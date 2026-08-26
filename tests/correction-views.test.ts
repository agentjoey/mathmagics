import { describe, expect, test } from 'vitest';
import {
  CorrectionAttemptObserver,
  toParentMistakeGroups,
  toStudentMistakeView,
  type MisconceptionSummary,
  type StudentMistakeProjectionInput,
} from '@/lib/correction';
import type { Attempt } from '@/lib/practice';

const now = '2026-08-25T15:00:00.000Z';

function keysDeep(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(keysDeep);
  const record = value as Record<string, unknown>;
  return Object.entries(record).flatMap(([key, child]) => [key, ...keysDeep(child)]);
}

function studentInput(overrides: Partial<StudentMistakeProjectionInput> = {}): StudentMistakeProjectionInput {
  return {
    mistakeId: 'mistake-1',
    objectiveId: 'P3-FRA-003',
    state: 'CONFIRMED',
    diagnosisTarget: { kind: 'MISCONCEPTION', misconceptionId: 'MIS-FRA-DENOMINATOR-SIZE' },
    problemPrompt: 'Compare 1/8 and 1/4.',
    hasCorrectedEvidence: false,
    hasIndependentExplanation: false,
    hasPreparedTransfer: false,
    lastObservedAt: now,
    ...overrides,
  };
}

describe('correction student/parent projections', () => {
  test('maps Mistake state and progress to learning-language student steps', () => {
    expect(toStudentMistakeView(studentInput({ state: 'OBSERVED', diagnosisTarget: null }))).toMatchObject({
      status: 'NEEDS_REVIEW', nextStep: 'CONFIRM_DIAGNOSIS', diagnosisLabel: 'Needs review',
    });
    expect(toStudentMistakeView(studentInput())).toMatchObject({
      status: 'READY_TO_CORRECT', nextStep: 'RETRY', diagnosisLabel: 'Larger denominator means larger fraction',
    });
    expect(toStudentMistakeView(studentInput({ state: 'CORRECTING', hasCorrectedEvidence: true }))).toMatchObject({
      status: 'IN_CORRECTION', nextStep: 'REASON',
    });
    expect(toStudentMistakeView(studentInput({
      state: 'CORRECTING', hasCorrectedEvidence: true, hasIndependentExplanation: true,
    }))).toMatchObject({ status: 'IN_CORRECTION', nextStep: 'TRANSFER' });
  });

  test('student view cannot expose answer keys, solution outlines, AI rationale, or internal events', () => {
    const view = toStudentMistakeView(studentInput());
    expect(keysDeep(view)).not.toEqual(expect.arrayContaining([
      'answerSpec', 'solutionOutline', 'rationale', 'events', 'payload', 'gradingPolicyVersion',
    ]));
    expect(view.problemPrompt).toBe('Compare 1/8 and 1/4.');
  });

  test('parent view derives Active/Resolved/Recurring groups with curriculum labels only', () => {
    const summaries: MisconceptionSummary[] = [
      {
        studentId: 'student-1',
        target: { kind: 'MISCONCEPTION', misconceptionId: 'MIS-FRA-DENOMINATOR-SIZE' },
        activeEpisodeCount: 1,
        resolvedEpisodeCount: 2,
        recurrenceCount: 2,
        linkedIncorrectObservationCount: 4,
        firstObservedAt: '2026-08-20T00:00:00.000Z',
        lastObservedAt: now,
      },
      {
        studentId: 'student-1',
        target: { kind: 'GENERIC', code: 'PROCEDURE_ERROR' },
        activeEpisodeCount: 0,
        resolvedEpisodeCount: 1,
        recurrenceCount: 0,
        linkedIncorrectObservationCount: 1,
        firstObservedAt: '2026-08-21T00:00:00.000Z',
        lastObservedAt: '2026-08-21T00:05:00.000Z',
      },
    ];
    const view = toParentMistakeGroups(summaries);
    expect(view.active).toEqual([
      expect.objectContaining({ label: 'Larger denominator means larger fraction', activeEpisodeCount: 1 }),
    ]);
    expect(view.resolved).toHaveLength(2);
    expect(view.recurring).toEqual([
      expect.objectContaining({ label: 'Larger denominator means larger fraction', recurrenceCount: 2 }),
    ]);
    expect(keysDeep(view)).not.toEqual(expect.arrayContaining(['answerSpec', 'solutionOutline', 'events', 'payload']));
  });
});

describe('CorrectionAttemptObserver', () => {
  test('observes only non-CORRECTION incorrect Attempts', async () => {
    const observed: string[] = [];
    const observer = new CorrectionAttemptObserver({
      async observeIncorrectAttempt({ attemptId }) {
        observed.push(attemptId);
        return {
          id: `mistake:${attemptId}`, studentId: 's1', objectiveId: 'P3-FRA-003', initialAttemptId: attemptId,
          initialDiagnosisTarget: { kind: 'GENERIC', code: 'UNKNOWN' }, diagnosisPolicyVersion: 'mistake-diagnosis-v1',
          firstObservedAt: now, createdAt: now,
        };
      },
    });
    const base: Attempt = {
      id: 'root', source: { kind: 'PRACTICE', sessionId: 's', itemId: 'i' }, studentId: 's1', objectiveId: 'P3-FRA-003',
      answerText: 'wrong', outcome: 'INCORRECT', hintUsed: false, gradingPolicyVersion: 'grading-v1', submittedAt: now, recordedAt: now,
    };
    await observer.onAttemptRecorded(base, now);
    await observer.onAttemptRecorded({ ...base, id: 'correct', outcome: 'CORRECT' }, now);
    await observer.onAttemptRecorded({
      ...base, id: 'correction', source: { kind: 'CORRECTION', mistakeId: 'm1', correctionItemId: 'c1' },
    }, now);
    expect(observed).toEqual(['root']);
  });
});
