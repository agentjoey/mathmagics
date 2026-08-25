import type { EvidenceRecord, EvidenceType } from '@/lib/learning';
import type { Attempt, PracticeItem } from './types';

export function evidenceIdForAttempt(attemptId: string): string {
  return `practice-attempt:${attemptId}`;
}

function coordinatesMatch(attempt: Attempt, item: PracticeItem): boolean {
  return attempt.source.kind === 'PRACTICE'
    && attempt.source.itemId === item.id
    && attempt.source.sessionId === item.sessionId
    && attempt.studentId === item.studentId
    && attempt.objectiveId === item.objectiveId;
}

function evidenceType(attempt: Attempt, item: PracticeItem): EvidenceType {
  if (attempt.outcome === 'INCORRECT') return 'incorrect';
  if (attempt.retryOfAttemptId) return 'corrected';
  if (attempt.hintUsed) return 'correct_with_hint';
  if (item.difficultyBand === 'APPLICATION' || item.difficultyBand === 'CHALLENGE') {
    return 'application_correct';
  }
  return 'independent_correct';
}

export function projectAttemptToEvidence(
  attempt: Attempt,
  item: PracticeItem,
): EvidenceRecord {
  if (attempt.source.kind !== 'PRACTICE') {
    throw new Error('practice evidence requires a PRACTICE attempt source');
  }
  if (!coordinatesMatch(attempt, item)) {
    throw new Error('attempt and practice item coordinates must match');
  }
  return {
    id: evidenceIdForAttempt(attempt.id),
    studentId: attempt.studentId,
    objectiveId: attempt.objectiveId,
    type: evidenceType(attempt, item),
    observedAt: attempt.submittedAt,
    recordedAt: attempt.recordedAt,
    origin: { kind: 'PRACTICE', refId: attempt.id },
  };
}
