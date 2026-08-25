import type { EvidenceRecord, EvidenceType } from '@/lib/learning';
import type { Attempt } from '@/lib/practice';

export interface HomeworkEvidenceContext {
  classification: 'CORE' | 'APPLICATION';
}

export function homeworkEvidenceIdForAttempt(attemptId: string): string {
  return `homework-attempt:${attemptId}`;
}

export function projectHomeworkAttemptToEvidence(
  attempt: Attempt,
  context: HomeworkEvidenceContext,
): EvidenceRecord {
  if (attempt.source.kind !== 'HOMEWORK') {
    throw new Error('homework evidence requires a HOMEWORK attempt source');
  }
  if (attempt.hintUsed) throw new Error('homework attempt must not record practice hint use');
  if (attempt.retryOfAttemptId) throw new Error('Phase 5 homework attempt must not be a correction retry');
  const type: EvidenceType = attempt.outcome === 'INCORRECT'
    ? 'incorrect'
    : context.classification === 'APPLICATION'
      ? 'application_correct'
      : 'independent_correct';
  return {
    id: homeworkEvidenceIdForAttempt(attempt.id),
    studentId: attempt.studentId,
    objectiveId: attempt.objectiveId,
    type,
    observedAt: attempt.submittedAt,
    recordedAt: attempt.recordedAt,
    origin: { kind: 'HOMEWORK', refId: attempt.id },
  };
}
