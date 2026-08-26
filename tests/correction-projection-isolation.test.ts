import { describe, expect, test } from 'vitest';
import { projectMistakeState, type CorrectionItem, type Mistake, type MistakeEvent } from '@/lib/correction';
import type { EvidenceRecord } from '@/lib/learning';
import type { Attempt } from '@/lib/practice';

const now = '2026-08-25T12:00:00.000Z';
const mistake: Mistake = {
  id: 'mistake-new', studentId: 'student-1', objectiveId: 'P3-FRA-003', initialAttemptId: 'root-new',
  initialDiagnosisTarget: { kind: 'GENERIC', code: 'UNKNOWN' }, diagnosisPolicyVersion: 'mistake-diagnosis-v1',
  firstObservedAt: now, createdAt: now,
};
const events: MistakeEvent[] = [
  {
    id: 'confirmed-new', mistakeId: mistake.id, type: 'DIAGNOSIS_CONFIRMED',
    payload: { target: { kind: 'MISCONCEPTION', misconceptionId: 'MIS-FRA-DENOMINATOR-SIZE' } },
    actorKind: 'SYSTEM', policyVersion: 'mistake-diagnosis-v1', occurredAt: now,
  },
  {
    id: 'started-new', mistakeId: mistake.id, type: 'CORRECTION_STARTED', payload: {},
    actorKind: 'SYSTEM', policyVersion: 'correction-v1', occurredAt: now,
  },
];
const root: Attempt = {
  id: 'root-new', source: { kind: 'PRACTICE', sessionId: 's', itemId: 'i' }, studentId: 'student-1',
  objectiveId: 'P3-FRA-003', answerText: '>', outcome: 'INCORRECT', hintUsed: false,
  gradingPolicyVersion: 'grading-v1', submittedAt: now, recordedAt: now,
};
const transfer: Attempt = {
  id: 'transfer-new', source: { kind: 'CORRECTION', mistakeId: mistake.id, correctionItemId: 'transfer-item-new' },
  studentId: 'student-1', objectiveId: 'P3-FRA-003', answerText: '<', outcome: 'CORRECT', hintUsed: false,
  gradingPolicyVersion: 'grading-v1', submittedAt: now, recordedAt: now,
};
const transferItem: CorrectionItem = {
  id: 'transfer-item-new', mistakeId: mistake.id, studentId: 'student-1', objectiveId: 'P3-FRA-003',
  kind: 'TRANSFER', sourceAttemptId: root.id, transferRound: 1,
  problemSpec: { kind: 'FRACTION_COMPARE', leftNumerator: 1, leftDenominator: 8, rightNumerator: 1, rightDenominator: 4 },
  answerSpec: { kind: 'EXACT_TEXT', acceptedValues: ['<'], caseSensitive: false }, prompt: 'Compare', solutionOutline: [],
  generator: 'correction-transfer', generatorVersion: 'correction-transfer-v1', createdAt: now,
};
function evidence(id: string, type: EvidenceRecord['type'], refId: string): EvidenceRecord {
  return {
    id, studentId: 'student-1', objectiveId: 'P3-FRA-003', type, observedAt: now, recordedAt: now,
    origin: { kind: 'CORRECTION', refId },
  };
}

describe('Mistake projection episode isolation', () => {
  test('does not let corrected/explained evidence from an older episode resolve a new recurrence', () => {
    expect(projectMistakeState({
      mistake,
      events,
      links: [
        { mistakeId: mistake.id, attemptId: root.id, role: 'OBSERVATION', linkedAt: now },
        { mistakeId: mistake.id, attemptId: transfer.id, role: 'TRANSFER', linkedAt: now },
      ],
      attempts: [root, transfer],
      evidence: [
        evidence('old-corrected', 'corrected', 'old-retry-attempt'),
        evidence('old-explained', 'explained_independently', 'mistake-old'),
        evidence('new-application', 'application_correct', transfer.id),
      ],
      correctionItems: [transferItem],
      reasoningChecks: [],
    })).toBe('CORRECTING');
  });
});
