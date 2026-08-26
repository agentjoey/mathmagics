import { describe, expect, test } from 'vitest';
import {
  assertValidCorrectionItem,
  assertValidCorrectionReasoningCheck,
  assertValidDiagnosisTarget,
  assertValidMistake,
  assertValidMistakeEvent,
  type CorrectionItem,
  type CorrectionReasoningCheck,
  type Mistake,
  type MistakeEvent,
} from '@/lib/correction';

const now = '2026-08-25T12:00:00.000Z';

const mistake: Mistake = {
  id: 'mistake-1',
  studentId: 'student-1',
  objectiveId: 'P3-FRA-003',
  initialAttemptId: 'attempt-1',
  initialDiagnosisTarget: {
    kind: 'MISCONCEPTION',
    misconceptionId: 'MIS-FRA-DENOMINATOR-SIZE',
  },
  diagnosisPolicyVersion: 'mistake-diagnosis-v1',
  firstObservedAt: now,
  createdAt: now,
};

const event: MistakeEvent = {
  id: 'event-1',
  mistakeId: mistake.id,
  type: 'DIAGNOSIS_CONFIRMED',
  payload: {
    target: {
      kind: 'MISCONCEPTION',
      misconceptionId: 'MIS-FRA-DENOMINATOR-SIZE',
    },
  },
  actorKind: 'SYSTEM',
  policyVersion: 'mistake-diagnosis-v1',
  occurredAt: now,
};

const originalRetry: CorrectionItem = {
  id: 'correction-item-1',
  mistakeId: mistake.id,
  studentId: mistake.studentId,
  objectiveId: mistake.objectiveId,
  kind: 'ORIGINAL_RETRY',
  sourceAttemptId: mistake.initialAttemptId,
  problemSpec: {
    kind: 'FRACTION_COMPARE',
    leftNumerator: 1,
    leftDenominator: 8,
    rightNumerator: 1,
    rightDenominator: 4,
  },
  answerSpec: { kind: 'CHOICE', optionId: 'RIGHT' },
  prompt: 'Which fraction is greater: 1/8 or 1/4?',
  solutionOutline: ['1/4 is greater than 1/8 because fourths are larger parts than eighths.'],
  generator: 'correction-original',
  generatorVersion: 'correction-original-v1',
  createdAt: now,
};

const reasoningCheck: CorrectionReasoningCheck = {
  id: 'reasoning-1',
  mistakeId: mistake.id,
  studentId: mistake.studentId,
  objectiveId: mistake.objectiveId,
  checkSpec: {
    id: 'fraction-part-size',
    kind: 'CHOICE',
    prompt: 'For the same whole, what happens to part size when the denominator increases?',
    options: [
      { id: 'SMALLER', label: 'Each part becomes smaller' },
      { id: 'LARGER', label: 'Each part becomes larger' },
    ],
    expectedOptionId: 'SMALLER',
  },
  response: { optionId: 'SMALLER' },
  outcome: 'PASS',
  assisted: false,
  policyVersion: 'correction-reasoning-v1',
  submittedAt: now,
  recordedAt: now,
};

describe('Phase 6 correction contracts', () => {
  test('accepts curriculum and generic diagnosis targets allowed by the objective', () => {
    expect(() => assertValidDiagnosisTarget('P3-FRA-003', {
      kind: 'MISCONCEPTION',
      misconceptionId: 'MIS-FRA-DENOMINATOR-SIZE',
    })).not.toThrow();
    expect(() => assertValidDiagnosisTarget('P3-FRA-003', {
      kind: 'GENERIC',
      code: 'UNKNOWN',
    })).not.toThrow();
  });

  test('rejects diagnosis targets outside the objective taxonomy', () => {
    expect(() => assertValidDiagnosisTarget('P3-FRA-003', {
      kind: 'MISCONCEPTION',
      misconceptionId: 'MIS-NOT-IN-OBJECTIVE',
    })).toThrow('diagnosis target is not allowed for objective P3-FRA-003');

    expect(() => assertValidDiagnosisTarget('P3-FRA-003', {
      kind: 'GENERIC',
      code: 'CARELESS' as never,
    })).toThrow('invalid generic diagnosis code');
  });

  test('validates immutable Mistake identity without mutable state authority', () => {
    expect(() => assertValidMistake(mistake)).not.toThrow();
    expect(() => assertValidMistake({ ...mistake, id: '' })).toThrow('mistake id must be non-empty');
    expect(() => assertValidMistake({ ...mistake, createdAt: 'not-a-date' })).toThrow('mistake createdAt must be a valid ISO date-time string');
    expect(() => assertValidMistake({ ...mistake, state: 'RESOLVED' } as Mistake)).toThrow('mistake must not contain mutable state');
  });

  test('validates Mistake events and their coordinates', () => {
    expect(() => assertValidMistakeEvent(mistake, event)).not.toThrow();
    expect(() => assertValidMistakeEvent(mistake, { ...event, mistakeId: 'mistake-other' }))
      .toThrow('mistake event coordinates must match mistake');
    expect(() => assertValidMistakeEvent(mistake, { ...event, occurredAt: '' }))
      .toThrow('mistake event occurredAt must be a valid ISO date-time string');
  });

  test('validates correction items including transfer-round rules', () => {
    expect(() => assertValidCorrectionItem(mistake, originalRetry)).not.toThrow();
    expect(() => assertValidCorrectionItem(mistake, { ...originalRetry, transferRound: 1 }))
      .toThrow('original retry must not define transferRound');

    const transfer: CorrectionItem = {
      ...originalRetry,
      id: 'correction-transfer-1',
      kind: 'TRANSFER',
      transferRound: 1,
      generator: 'correction-transfer',
      generatorVersion: 'correction-transfer-v1',
    };
    expect(() => assertValidCorrectionItem(mistake, transfer)).not.toThrow();
    expect(() => assertValidCorrectionItem(mistake, { ...transfer, transferRound: 0 }))
      .toThrow('transferRound must be a positive integer');
    expect(() => assertValidCorrectionItem(mistake, { ...transfer, studentId: 'student-other' }))
      .toThrow('correction item coordinates must match mistake');
  });

  test('validates structured reasoning facts and rejects coordinate drift', () => {
    expect(() => assertValidCorrectionReasoningCheck(mistake, reasoningCheck)).not.toThrow();
    expect(() => assertValidCorrectionReasoningCheck(mistake, { ...reasoningCheck, objectiveId: 'P3-FRA-004' }))
      .toThrow('reasoning check coordinates must match mistake');
    expect(() => assertValidCorrectionReasoningCheck(mistake, { ...reasoningCheck, submittedAt: 'bad' }))
      .toThrow('reasoning check submittedAt must be a valid ISO date-time string');
  });
});
