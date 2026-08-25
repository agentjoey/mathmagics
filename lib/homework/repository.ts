import { deriveEffectiveHomeworkObservation } from './confidence';
import type {
  HomeworkConfirmation,
  HomeworkProblemExtraction,
  HomeworkSubmission,
} from './types';
import { validateHomeworkImageMetadata, validateHomeworkVisionResult } from './validation';

export interface HomeworkRepository {
  getSubmission(id: string): Promise<HomeworkSubmission | undefined>;
  findSubmissionByStudentAndHash(studentId: string, sha256: string): Promise<HomeworkSubmission | undefined>;
  createSubmission(submission: HomeworkSubmission, problems: HomeworkProblemExtraction[]): Promise<void>;
  getProblem(id: string): Promise<HomeworkProblemExtraction | undefined>;
  listProblems(submissionId: string): Promise<HomeworkProblemExtraction[]>;
  appendConfirmation(confirmation: HomeworkConfirmation): Promise<void>;
  listConfirmations(problemId: string): Promise<HomeworkConfirmation[]>;
}

function requireNonEmpty(value: string, field: string): void {
  if (!value.trim()) throw new Error(`${field} must be non-empty`);
}

function requireTimestamp(value: string, field: string): void {
  if (!value || Number.isNaN(Date.parse(value))) throw new Error(`${field} must be a valid ISO date-time string`);
}

export function assertValidHomeworkSubmissionBundle(
  submission: HomeworkSubmission,
  problems: HomeworkProblemExtraction[],
): void {
  requireNonEmpty(submission.id, 'homework submission id');
  requireNonEmpty(submission.studentId, 'homework submission studentId');
  requireNonEmpty(submission.provider, 'homework submission provider');
  requireNonEmpty(submission.model, 'homework submission model');
  validateHomeworkImageMetadata({
    mimeType: submission.mimeType,
    byteLength: submission.byteLength,
    sha256: submission.sourceSha256,
  });
  if (submission.schemaVersion !== 'homework-vision-v1') {
    throw new Error('homework submission schemaVersion must be homework-vision-v1');
  }
  requireTimestamp(submission.createdAt, 'homework submission createdAt');
  if (problems.length === 0) throw new Error('homework submission problems must be non-empty');

  const ids = new Set<string>();
  const sequences = new Set<number>();
  for (const problem of problems) {
    if (ids.has(problem.id)) throw new Error('homework problem id must be unique');
    if (sequences.has(problem.sequence)) throw new Error('homework problem sequence must be unique within submission');
    if (problem.submissionId !== submission.id || problem.studentId !== submission.studentId) {
      throw new Error('homework problem coordinates must match submission');
    }
    if (problem.provider !== submission.provider || problem.model !== submission.model || problem.schemaVersion !== submission.schemaVersion) {
      throw new Error('homework problem provider metadata must match submission');
    }
    ids.add(problem.id);
    sequences.add(problem.sequence);
  }

  validateHomeworkVisionResult({
    submissionId: submission.id,
    studentId: submission.studentId,
    provider: submission.provider,
    model: submission.model,
    schemaVersion: submission.schemaVersion,
    problems,
  });
}

export function assertValidHomeworkConfirmationForProblem(
  problem: HomeworkProblemExtraction,
  confirmation: HomeworkConfirmation,
): void {
  deriveEffectiveHomeworkObservation(problem, [confirmation]);
}
