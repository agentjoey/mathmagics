import { createHash } from 'node:crypto';
import type { LearningStateRepository } from '@/lib/learning';
import { gradeAnswer, type Attempt, type AttemptRecordedObserver, type PracticeRepository } from '@/lib/practice';
import type { HomeworkVisionProvider } from '@/lib/providers/homework-vision';
import { deriveEffectiveHomeworkObservation, deriveHomeworkTrustState } from './confidence';
import { convertHomeworkProblem } from './conversion';
import { homeworkEvidenceIdForAttempt, projectHomeworkAttemptToEvidence } from './evidence';
import { mapHomeworkObjective } from './objective-mapping';
import type { HomeworkRepository } from './repository';
import type { HomeworkConfirmation, HomeworkMimeType, HomeworkProblemExtraction, HomeworkSubmission, HomeworkTrustState } from './types';
import { validateHomeworkImageMetadata, validateHomeworkVisionResult } from './validation';

export interface SubmitHomeworkInput {
  submissionId: string;
  studentId: string;
  bytes: Uint8Array;
  mimeType: HomeworkMimeType;
  sha256: string;
}
export interface HomeworkProblemProjection {
  problem: HomeworkProblemExtraction;
  trustState: HomeworkTrustState;
  objectiveCandidates: string[];
}
export interface HomeworkSubmissionProjection {
  submission: HomeworkSubmission;
  problems: HomeworkProblemProjection[];
}
export interface ConfirmHomeworkProblemInput {
  confirmationId: string;
  problemId: string;
  studentId: string;
  corrections: Record<string, string>;
  confirmerRole: 'STUDENT' | 'PARENT';
}
export interface GradeHomeworkProblemInput { problemId: string; attemptId: string }
export interface HomeworkGradeProjection { attempt: Attempt; evidenceId: string }

const NOOP_ATTEMPT_OBSERVER: AttemptRecordedObserver = {
  async onAttemptRecorded() {},
};

export class HomeworkServiceImpl {
  constructor(
    readonly homeworkRepository: HomeworkRepository,
    private readonly practiceRepository: PracticeRepository,
    private readonly learningRepository: LearningStateRepository,
    private readonly visionProvider: HomeworkVisionProvider,
    private readonly attemptObserver: AttemptRecordedObserver = NOOP_ATTEMPT_OBSERVER,
  ) {}

  private async projectProblem(problem: HomeworkProblemExtraction): Promise<HomeworkProblemProjection> {
    const student = await this.learningRepository.getStudent(problem.studentId);
    if (!student) throw new Error(`Unknown student id: ${problem.studentId}`);
    const confirmations = await this.homeworkRepository.listConfirmations(problem.id);
    const observation = deriveEffectiveHomeworkObservation(problem, confirmations);
    const conversion = convertHomeworkProblem(observation);
    const candidates = conversion.supported
      ? mapHomeworkObjective(student.levelId, conversion.trusted).candidates
      : [];
    return {
      problem: structuredClone(problem),
      trustState: deriveHomeworkTrustState(observation, { conversionSupported: conversion.supported, objectiveCandidateCount: candidates.length }),
      objectiveCandidates: candidates,
    };
  }

  async submitHomework(input: SubmitHomeworkInput, now: string): Promise<HomeworkSubmissionProjection> {
    const student = await this.learningRepository.getStudent(input.studentId);
    if (!student) throw new Error(`Unknown student id: ${input.studentId}`);
    const actualSha = createHash('sha256').update(input.bytes).digest('hex');
    if (actualSha !== input.sha256) throw new Error('homework image sha256 does not match bytes');
    validateHomeworkImageMetadata({ mimeType: input.mimeType, byteLength: input.bytes.byteLength, sha256: actualSha });
    const existing = await this.homeworkRepository.findSubmissionByStudentAndHash(input.studentId, actualSha);
    if (existing) {
      const problems = await this.homeworkRepository.listProblems(existing.id);
      return { submission: existing, problems: await Promise.all(problems.map((problem) => this.projectProblem(problem))) };
    }
    const result = await this.visionProvider.extract({ submissionId: input.submissionId, studentId: input.studentId, bytes: input.bytes, mimeType: input.mimeType, now });
    validateHomeworkVisionResult(result);
    if (result.submissionId !== input.submissionId || result.studentId !== input.studentId) throw new Error('homework vision coordinates must match trusted input');
    const submission: HomeworkSubmission = {
      id: input.submissionId, studentId: input.studentId, sourceSha256: actualSha, mimeType: input.mimeType,
      byteLength: input.bytes.byteLength, provider: result.provider, model: result.model, schemaVersion: 'homework-vision-v1', createdAt: now,
    };
    await this.homeworkRepository.createSubmission(submission, result.problems);
    return { submission, problems: await Promise.all(result.problems.map((problem) => this.projectProblem(problem))) };
  }

  async confirmHomeworkProblem(input: ConfirmHomeworkProblemInput, now: string): Promise<HomeworkProblemProjection> {
    const problem = await this.homeworkRepository.getProblem(input.problemId);
    if (!problem) throw new Error(`Unknown homework problem id: ${input.problemId}`);
    const confirmation: HomeworkConfirmation = {
      id: input.confirmationId, problemId: input.problemId, studentId: input.studentId, corrections: structuredClone(input.corrections),
      confirmerRole: input.confirmerRole, policyVersion: 'homework-confidence-v1', confirmedAt: now,
    };
    await this.homeworkRepository.appendConfirmation(confirmation);
    return this.projectProblem(problem);
  }

  async gradeHomeworkProblem(input: GradeHomeworkProblemInput, now: string): Promise<HomeworkGradeProjection> {
    const problem = await this.homeworkRepository.getProblem(input.problemId);
    if (!problem) throw new Error(`Unknown homework problem id: ${input.problemId}`);
    const submission = await this.homeworkRepository.getSubmission(problem.submissionId);
    if (!submission) throw new Error(`Unknown homework submission id: ${problem.submissionId}`);
    const student = await this.learningRepository.getStudent(problem.studentId);
    if (!student) throw new Error(`Unknown student id: ${problem.studentId}`);
    const confirmations = await this.homeworkRepository.listConfirmations(problem.id);
    const observation = deriveEffectiveHomeworkObservation(problem, confirmations);
    const conversion = convertHomeworkProblem(observation);
    const candidates = conversion.supported ? mapHomeworkObjective(student.levelId, conversion.trusted).candidates : [];
    const trustState = deriveHomeworkTrustState(observation, { conversionSupported: conversion.supported, objectiveCandidateCount: candidates.length });
    if (trustState !== 'CONFIRMED' || !conversion.supported || candidates.length !== 1 || !observation.answer) {
      throw new Error('homework problem is not confirmed');
    }
    const objectiveId = candidates[0]!;
    const grade = gradeAnswer(observation.answer.value, conversion.trusted.answerSpec);
    const expected: Attempt = {
      id: input.attemptId,
      source: { kind: 'HOMEWORK', submissionId: submission.id, problemId: problem.id },
      studentId: problem.studentId,
      objectiveId,
      answerText: observation.answer.value,
      outcome: grade.outcome,
      hintUsed: false,
      gradingPolicyVersion: 'grading-v1',
      submittedAt: now,
      recordedAt: now,
    };
    const existing = await this.practiceRepository.getAttempt(input.attemptId);
    let attempt = expected;
    if (existing) {
      const comparable = { ...existing, submittedAt: now, recordedAt: now };
      if (JSON.stringify(comparable) !== JSON.stringify(expected)) throw new Error('attempt idempotency conflict');
      attempt = existing;
    } else {
      await this.practiceRepository.appendAttempt(expected);
    }
    const evidence = projectHomeworkAttemptToEvidence(attempt, { classification: conversion.trusted.classification });
    const storedEvidence = await this.learningRepository.getEvidence(evidence.id);
    if (!storedEvidence) await this.learningRepository.appendEvidence(evidence);
    else if (JSON.stringify(storedEvidence) !== JSON.stringify(evidence)) throw new Error('homework evidence idempotency conflict');
    if (attempt.outcome === 'INCORRECT') await this.attemptObserver.onAttemptRecorded(attempt, now);
    return { attempt: structuredClone(attempt), evidenceId: evidence.id };
  }
}

export const evidenceIdForHomeworkAttempt = homeworkEvidenceIdForAttempt;
