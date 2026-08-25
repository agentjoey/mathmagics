import type { EvidenceRecord } from '@/lib/learning';
import type { Attempt } from '@/lib/practice';
import type { CorrectionItem } from './types';

export type CorrectionAttemptEvidenceType = 'corrected' | 'application_correct';

export function correctionEvidenceIdForAttempt(
  attemptId: string,
  type: CorrectionAttemptEvidenceType,
): string {
  return `correction:${type}:${attemptId}`;
}

export function reasoningEvidenceId(mistakeId: string, policyVersion: string): string {
  return `correction:explained:${mistakeId}:${policyVersion}`;
}

function assertCoordinates(attempt: Attempt, item: CorrectionItem): void {
  if (
    attempt.source.kind !== 'CORRECTION'
    || attempt.source.mistakeId !== item.mistakeId
    || attempt.source.correctionItemId !== item.id
    || attempt.studentId !== item.studentId
    || attempt.objectiveId !== item.objectiveId
  ) {
    throw new Error('correction attempt coordinates must match correction item');
  }
}

function evidence(attempt: Attempt, type: CorrectionAttemptEvidenceType): EvidenceRecord {
  return {
    id: correctionEvidenceIdForAttempt(attempt.id, type),
    studentId: attempt.studentId,
    objectiveId: attempt.objectiveId,
    type,
    observedAt: attempt.submittedAt,
    recordedAt: attempt.recordedAt,
    origin: { kind: 'CORRECTION', refId: attempt.id },
  };
}

export function projectCorrectedEvidence(
  attempt: Attempt,
  item: CorrectionItem,
): EvidenceRecord | null {
  assertCoordinates(attempt, item);
  if (item.kind !== 'ORIGINAL_RETRY') {
    throw new Error('corrected evidence requires an ORIGINAL_RETRY item');
  }
  if (attempt.outcome !== 'CORRECT') return null;
  return evidence(attempt, 'corrected');
}

export function projectTransferEvidence(
  attempt: Attempt,
  item: CorrectionItem,
  priorAttempts: Attempt[],
): EvidenceRecord | null {
  assertCoordinates(attempt, item);
  if (item.kind !== 'TRANSFER') {
    throw new Error('transfer evidence requires a TRANSFER item');
  }
  const earlierForItem = priorAttempts.filter((prior) =>
    prior.source.kind === 'CORRECTION'
    && prior.source.mistakeId === item.mistakeId
    && prior.source.correctionItemId === item.id);
  if (earlierForItem.length > 0 || attempt.outcome !== 'CORRECT' || attempt.hintUsed) return null;
  return evidence(attempt, 'application_correct');
}
