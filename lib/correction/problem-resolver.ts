import type { LearningStateRepository } from '@/lib/learning';
import {
  convertHomeworkProblem,
  deriveEffectiveHomeworkObservation,
  deriveHomeworkTrustState,
  mapHomeworkObjective,
  type HomeworkRepository,
} from '@/lib/homework';
import type { Attempt, PracticeRepository } from '@/lib/practice';
import type { TrustedAttemptProblem } from './types';

export interface AttemptProblemResolver {
  resolve(attempt: Attempt): Promise<TrustedAttemptProblem>;
}

export class RepositoryAttemptProblemResolver implements AttemptProblemResolver {
  constructor(
    private readonly practiceRepository: PracticeRepository,
    private readonly homeworkRepository: HomeworkRepository,
    private readonly learningRepository: LearningStateRepository,
  ) {}

  async resolve(attempt: Attempt): Promise<TrustedAttemptProblem> {
    if (attempt.source.kind === 'PRACTICE') return this.resolvePractice(attempt);
    if (attempt.source.kind === 'HOMEWORK') return this.resolveHomework(attempt);
    throw new Error('correction attempts are not valid root mistake observations');
  }

  private async resolvePractice(attempt: Attempt): Promise<TrustedAttemptProblem> {
    if (attempt.source.kind !== 'PRACTICE') throw new Error('expected PRACTICE attempt source');
    const item = await this.practiceRepository.getPracticeItem(attempt.source.itemId);
    if (!item) throw new Error(`Unknown practice item id: ${attempt.source.itemId}`);

    if (
      item.id !== attempt.source.itemId
      || item.sessionId !== attempt.source.sessionId
      || attempt.studentId !== item.studentId
      || attempt.objectiveId !== item.objectiveId
    ) {
      throw new Error('practice attempt coordinates do not match trusted item');
    }

    const session = await this.practiceRepository.getPracticeSession(item.sessionId);
    if (!session) throw new Error(`Unknown practice session id: ${item.sessionId}`);
    if (
      session.id !== item.sessionId
      || session.studentId !== item.studentId
      || session.objectiveId !== item.objectiveId
    ) {
      throw new Error('practice attempt coordinates do not match trusted item');
    }

    return {
      attempt: structuredClone(attempt),
      problemSpec: structuredClone(item.problemSpec),
      answerSpec: structuredClone(item.answerSpec),
      prompt: item.prompt,
      hint: item.hint,
      solutionOutline: item.solutionOutline.slice(),
      classification: item.difficultyBand,
    };
  }

  private async resolveHomework(attempt: Attempt): Promise<TrustedAttemptProblem> {
    if (attempt.source.kind !== 'HOMEWORK') throw new Error('expected HOMEWORK attempt source');
    const problem = await this.homeworkRepository.getProblem(attempt.source.problemId);
    if (!problem) throw new Error(`Unknown homework problem id: ${attempt.source.problemId}`);
    if (
      problem.submissionId !== attempt.source.submissionId
      || problem.studentId !== attempt.studentId
    ) {
      throw new Error('homework attempt coordinates do not match trusted problem');
    }

    const student = await this.learningRepository.getStudent(problem.studentId);
    if (!student) throw new Error(`Unknown student id: ${problem.studentId}`);
    const confirmations = await this.homeworkRepository.listConfirmations(problem.id);
    const observation = deriveEffectiveHomeworkObservation(problem, confirmations);
    const conversion = convertHomeworkProblem(observation);
    const candidates = conversion.supported
      ? mapHomeworkObjective(student.levelId, conversion.trusted).candidates
      : [];
    const trustState = deriveHomeworkTrustState(observation, {
      conversionSupported: conversion.supported,
      objectiveCandidateCount: candidates.length,
    });

    if (trustState !== 'CONFIRMED' || !conversion.supported || candidates.length !== 1) {
      throw new Error('homework problem is not confirmed for correction');
    }
    if (candidates[0] !== attempt.objectiveId) {
      throw new Error('homework attempt objective does not match trusted mapping');
    }

    return {
      attempt: structuredClone(attempt),
      problemSpec: structuredClone(conversion.trusted.problemSpec),
      answerSpec: structuredClone(conversion.trusted.answerSpec),
      prompt: observation.question.value,
      solutionOutline: [],
      classification: conversion.trusted.classification,
    };
  }
}
