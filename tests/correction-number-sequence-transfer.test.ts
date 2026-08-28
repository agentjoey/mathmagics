import { describe, expect, it } from 'vitest';
import { generateCorrectionTransfer } from '@/lib/correction';
import type { TrustedAttemptProblem } from '@/lib/correction';

describe('number-sequence correction transfer', () => {
  it('creates a new auditable sequence that preserves the trusted step relationship', () => {
    const original: TrustedAttemptProblem = {
      attempt: {
        id: 'attempt-sequence-1',
        source: { kind: 'PRACTICE', sessionId: 'session-1', itemId: 'item-1' },
        studentId: 'student-1',
        objectiveId: 'P2-WN-005',
        answerText: '31',
        outcome: 'INCORRECT',
        hintUsed: false,
        gradingPolicyVersion: 'grading-v1',
        submittedAt: '2026-08-28T08:00:00.000Z',
        recordedAt: '2026-08-28T08:00:00.000Z',
      },
      problemSpec: { kind: 'NUMBER_SEQUENCE', terms: [17, 19, 21, 23], step: 2, nextValue: 25 },
      answerSpec: { kind: 'INTEGER', value: '25' },
      prompt: 'Continue the pattern.',
      hint: 'Look at the change.',
      solutionOutline: ['Add 2 each time.'],
      classification: 'CORE',
    };

    const item = generateCorrectionTransfer({
      mistakeId: 'mistake-1',
      studentId: 'student-1',
      objectiveId: 'P2-WN-005',
      sourceAttemptId: original.attempt.id,
      original,
      round: 1,
      itemId: 'transfer-1',
      now: '2026-08-28T08:05:00.000Z',
    });

    expect(item.problemSpec.kind).toBe('NUMBER_SEQUENCE');
    if (item.problemSpec.kind !== 'NUMBER_SEQUENCE' || item.answerSpec.kind !== 'INTEGER') {
      throw new Error('unexpected transfer problem type');
    }
    const spec = item.problemSpec;
    expect(spec).not.toEqual(original.problemSpec);
    expect(spec.step).toBe(2);
    expect(spec.terms.slice(1).every((value, index) => value - spec.terms[index]! === 2)).toBe(true);
    expect(spec.nextValue).toBe(spec.terms.at(-1)! + 2);
    expect(item.answerSpec.value).toBe(String(spec.nextValue));
  });
});
