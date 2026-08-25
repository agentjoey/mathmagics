import { describe, expect, test } from 'vitest';
import {
  canonicalMistakeId,
  confirmedDiagnosisTarget,
  deriveMisconceptionSummary,
  projectMistakeState,
  type CorrectionItem,
  type Mistake,
  type MistakeEvent,
  type MistakeProjectionInput,
} from '@/lib/correction';
import type { Attempt } from '@/lib/practice';
import type { EvidenceRecord } from '@/lib/learning';

const now = '2026-08-25T12:00:00.000Z';
const later = '2026-08-25T12:05:00.000Z';

const mistake: Mistake = {
  id: 'mistake-1',
  studentId: 'student-1',
  objectiveId: 'P3-FRA-003',
  initialAttemptId: 'attempt-original',
  initialDiagnosisTarget: { kind: 'GENERIC', code: 'UNKNOWN' },
  diagnosisPolicyVersion: 'mistake-diagnosis-v1',
  firstObservedAt: now,
  createdAt: now,
};

const originalAttempt: Attempt = {
  id: 'attempt-original',
  source: { kind: 'PRACTICE', sessionId: 'session-1', itemId: 'item-1' },
  studentId: mistake.studentId,
  objectiveId: mistake.objectiveId,
  answerText: '>',
  outcome: 'INCORRECT',
  hintUsed: false,
  gradingPolicyVersion: 'grading-v1',
  submittedAt: now,
  recordedAt: now,
};

const confirmed: MistakeEvent = {
  id: 'event-confirmed',
  mistakeId: mistake.id,
  type: 'DIAGNOSIS_CONFIRMED',
  payload: {
    target: { kind: 'MISCONCEPTION', misconceptionId: 'MIS-FRA-DENOMINATOR-SIZE' },
  },
  actorKind: 'SYSTEM',
  policyVersion: 'mistake-diagnosis-v1',
  occurredAt: now,
};

const started: MistakeEvent = {
  id: 'event-started',
  mistakeId: mistake.id,
  type: 'CORRECTION_STARTED',
  payload: {},
  actorKind: 'SYSTEM',
  policyVersion: 'correction-v1',
  occurredAt: later,
};

function evidence(id: string, type: EvidenceRecord['type'], refId: string): EvidenceRecord {
  return {
    id,
    studentId: mistake.studentId,
    objectiveId: mistake.objectiveId,
    type,
    observedAt: later,
    recordedAt: later,
    origin: { kind: 'CORRECTION', refId },
  };
}

function input(overrides: Partial<MistakeProjectionInput> = {}): MistakeProjectionInput {
  return {
    mistake,
    events: [],
    links: [{ mistakeId: mistake.id, attemptId: originalAttempt.id, role: 'OBSERVATION', linkedAt: now }],
    attempts: [originalAttempt],
    evidence: [],
    correctionItems: [],
    reasoningChecks: [],
    ...overrides,
  };
}

describe('Mistake lifecycle projection', () => {
  test('projects observation, confirmation, and correction start deterministically', () => {
    expect(projectMistakeState(input())).toBe('OBSERVED');
    expect(projectMistakeState(input({ events: [confirmed] }))).toBe('CONFIRMED');
    expect(projectMistakeState(input({ events: [started, confirmed] }))).toBe('CORRECTING');
  });

  test('requires corrected, independent reasoning, and qualifying transfer facts to resolve', () => {
    const transferAttempt: Attempt = {
      ...originalAttempt,
      id: 'attempt-transfer-1',
      answerText: '<',
      outcome: 'CORRECT',
      hintUsed: false,
      submittedAt: later,
      recordedAt: later,
    };
    const transferItem: CorrectionItem = {
      id: 'correction-transfer-1',
      mistakeId: mistake.id,
      studentId: mistake.studentId,
      objectiveId: mistake.objectiveId,
      kind: 'TRANSFER',
      sourceAttemptId: mistake.initialAttemptId,
      transferRound: 1,
      problemSpec: {
        kind: 'FRACTION_COMPARE',
        leftNumerator: 1,
        leftDenominator: 10,
        rightNumerator: 1,
        rightDenominator: 5,
      },
      answerSpec: { kind: 'EXACT_TEXT', acceptedValues: ['<'], caseSensitive: false },
      prompt: '1/10 ? 1/5',
      solutionOutline: [],
      generator: 'correction-transfer',
      generatorVersion: 'correction-transfer-v1',
      createdAt: later,
    };
    const base = input({
      events: [confirmed, started],
      attempts: [originalAttempt, transferAttempt],
      links: [
        { mistakeId: mistake.id, attemptId: originalAttempt.id, role: 'OBSERVATION', linkedAt: now },
        { mistakeId: mistake.id, attemptId: transferAttempt.id, role: 'TRANSFER', linkedAt: later },
      ],
      correctionItems: [transferItem],
    });
    const corrected = evidence('ev-corrected', 'corrected', 'attempt-retry-1');
    const explained = evidence('ev-explained', 'explained_independently', mistake.id);
    const applied = evidence('ev-application', 'application_correct', transferAttempt.id);

    expect(projectMistakeState({ ...base, evidence: [corrected] })).toBe('CORRECTING');
    expect(projectMistakeState({ ...base, evidence: [corrected, explained] })).toBe('CORRECTING');
    expect(projectMistakeState({ ...base, evidence: [corrected, explained, applied] })).toBe('RESOLVED');
  });

  test('does not trust MISTAKE_RESOLVED receipt without the hard facts', () => {
    const receipt: MistakeEvent = {
      id: 'event-resolved',
      mistakeId: mistake.id,
      type: 'MISTAKE_RESOLVED',
      payload: {},
      actorKind: 'SYSTEM',
      policyVersion: 'correction-v1',
      occurredAt: later,
    };

    expect(projectMistakeState(input({ events: [confirmed, started, receipt] }))).toBe('CORRECTING');
  });

  test('orders diagnosis confirmation deterministically and exposes consolidation alias', () => {
    const laterConfirmation: MistakeEvent = {
      ...confirmed,
      id: 'event-confirmed-later',
      occurredAt: later,
      payload: { target: { kind: 'GENERIC', code: 'PROCEDURE_ERROR' } },
      actorKind: 'PARENT',
    };
    const consolidated: MistakeEvent = {
      id: 'event-consolidated',
      mistakeId: mistake.id,
      type: 'MISTAKE_CONSOLIDATED',
      payload: { canonicalMistakeId: 'mistake-canonical' },
      actorKind: 'SYSTEM',
      policyVersion: 'mistake-diagnosis-v1',
      occurredAt: later,
    };

    expect(confirmedDiagnosisTarget([laterConfirmation, confirmed])).toEqual({
      kind: 'GENERIC',
      code: 'PROCEDURE_ERROR',
    });
    expect(canonicalMistakeId([consolidated])).toBe('mistake-canonical');
  });

  test('misconception summary excludes consolidated aliases and counts recurrence by episode', () => {
    const resolvedInput = input({
      mistake: { ...mistake, id: 'mistake-old', initialAttemptId: 'attempt-old' },
      events: [
        { ...confirmed, id: 'event-old-confirmed', mistakeId: 'mistake-old' },
        { ...started, id: 'event-old-started', mistakeId: 'mistake-old' },
      ],
      links: [{ mistakeId: 'mistake-old', attemptId: 'attempt-old', role: 'OBSERVATION', linkedAt: now }],
      attempts: [{ ...originalAttempt, id: 'attempt-old' }],
      evidence: [],
    });
    const activeInput = input({ events: [confirmed] });
    const aliasInput = input({
      mistake: { ...mistake, id: 'mistake-alias' },
      events: [{
        id: 'event-alias',
        mistakeId: 'mistake-alias',
        type: 'MISTAKE_CONSOLIDATED',
        payload: { canonicalMistakeId: mistake.id },
        actorKind: 'SYSTEM',
        policyVersion: 'mistake-diagnosis-v1',
        occurredAt: later,
      }],
    });

    // Mark the old episode as resolved through trusted correction Evidence facts.
    const transferAttempt = { ...originalAttempt, id: 'attempt-old-transfer', outcome: 'CORRECT' as const, hintUsed: false };
    resolvedInput.attempts.push(transferAttempt);
    resolvedInput.links.push({ mistakeId: 'mistake-old', attemptId: transferAttempt.id, role: 'TRANSFER', linkedAt: later });
    resolvedInput.correctionItems.push({
      id: 'old-transfer-item', mistakeId: 'mistake-old', studentId: mistake.studentId, objectiveId: mistake.objectiveId,
      kind: 'TRANSFER', sourceAttemptId: 'attempt-old', transferRound: 1,
      problemSpec: { kind: 'FRACTION_COMPARE', leftNumerator: 1, leftDenominator: 6, rightNumerator: 1, rightDenominator: 3 },
      answerSpec: { kind: 'EXACT_TEXT', acceptedValues: ['<'], caseSensitive: false }, prompt: '1/6 ? 1/3',
      solutionOutline: [], generator: 'correction-transfer', generatorVersion: 'correction-transfer-v1', createdAt: later,
    });
    resolvedInput.evidence.push(
      { ...evidence('old-corrected', 'corrected', 'old-retry'), studentId: mistake.studentId },
      { ...evidence('old-explained', 'explained_independently', 'mistake-old'), studentId: mistake.studentId },
      { ...evidence('old-application', 'application_correct', transferAttempt.id), studentId: mistake.studentId },
    );

    const summaries = deriveMisconceptionSummary([resolvedInput, activeInput, aliasInput]);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      target: { kind: 'MISCONCEPTION', misconceptionId: 'MIS-FRA-DENOMINATOR-SIZE' },
      activeEpisodeCount: 1,
      resolvedEpisodeCount: 1,
      recurrenceCount: 1,
      linkedIncorrectObservationCount: 2,
    });
  });
});
