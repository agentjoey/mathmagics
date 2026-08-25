import type { Attempt, SubmitAttemptInput } from './types';

export function hintRevealId(studentId: string, itemId: string): string {
  return `practice-hint:${encodeURIComponent(studentId)}:${encodeURIComponent(itemId)}`;
}

export interface RetryCoordinates {
  studentId: string;
  sessionId: string;
  itemId: string;
  objectiveId: string;
}

function compareAttempts(left: Attempt, right: Attempt): number {
  return Date.parse(left.submittedAt) - Date.parse(right.submittedAt)
    || Date.parse(left.recordedAt) - Date.parse(right.recordedAt)
    || left.id.localeCompare(right.id);
}

function coordinatesMatch(attempt: Attempt, coordinates: RetryCoordinates): boolean {
  return attempt.source.kind === 'PRACTICE'
    && attempt.studentId === coordinates.studentId
    && attempt.source.sessionId === coordinates.sessionId
    && attempt.source.itemId === coordinates.itemId
    && attempt.objectiveId === coordinates.objectiveId;
}

export function validateRetryAttempt(
  previousAttempts: Attempt[],
  input: SubmitAttemptInput,
  coordinates: RetryCoordinates,
): Attempt | undefined {
  if (input.sessionId !== coordinates.sessionId || input.itemId !== coordinates.itemId) {
    throw new Error('attempt input coordinates must match trusted practice coordinates');
  }

  if (previousAttempts.length === 0) {
    if (input.retryOfAttemptId) throw new Error('retry parent does not exist');
    return undefined;
  }

  if (!input.retryOfAttemptId) {
    throw new Error('subsequent attempt must retry the latest incorrect attempt');
  }

  const parent = previousAttempts.find((attempt) => attempt.id === input.retryOfAttemptId);
  if (!parent) throw new Error('retry parent does not exist');
  if (!coordinatesMatch(parent, coordinates)) {
    throw new Error('retry parent coordinates must match trusted practice coordinates');
  }

  const latest = [...previousAttempts].sort(compareAttempts).at(-1)!;
  if (parent.id !== latest.id) throw new Error('retry must reference the latest attempt for the item');
  if (parent.outcome === 'CORRECT') throw new Error('correct attempt cannot be retried');
  return parent;
}
