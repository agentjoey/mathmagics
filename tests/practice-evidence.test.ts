import { describe, expect, it } from 'vitest';
import {
  evidenceIdForAttempt,
  projectAttemptToEvidence,
} from '@/lib/practice';
import type { Attempt, PracticeItem } from '@/lib/practice';

const item: PracticeItem = {
  id: 'item-1', sessionId: 'session-1', studentId: 'student-1', objectiveId: 'P2-MD-001', sequence: 1,
  difficultyBand: 'CORE',
  problemSpec: { kind: 'ARITHMETIC', operation: 'MULTIPLY', left: 2, right: 3 },
  prompt: '2 × 3?', answerSpec: { kind: 'INTEGER', value: '6' }, hint: 'Equal groups.',
  solutionOutline: ['2 × 3 = 6'], generator: 'test', generatorVersion: '1',
  createdAt: '2026-08-25T00:00:00.000Z',
};

function attempt(overrides: Partial<Attempt> = {}): Attempt {
  return {
    id: 'attempt-1', source: { kind: 'PRACTICE', sessionId: item.sessionId, itemId: item.id }, studentId: item.studentId,
    objectiveId: item.objectiveId, answerText: '6', outcome: 'CORRECT', hintUsed: false,
    gradingPolicyVersion: 'grading-v1', submittedAt: '2026-08-25T00:01:00.000Z',
    recordedAt: '2026-08-25T00:01:00.000Z', ...overrides,
  };
}

describe('Attempt to Evidence projection', () => {
  it('uses a stable evidence id per attempt', () => {
    expect(evidenceIdForAttempt('attempt-1')).toBe('practice-attempt:attempt-1');
  });

  it.each([
    [{ outcome: 'INCORRECT' as const, hintUsed: false }, 'CORE', 'incorrect'],
    [{ outcome: 'CORRECT' as const, retryOfAttemptId: 'attempt-0', hintUsed: false }, 'CORE', 'corrected'],
    [{ outcome: 'CORRECT' as const, hintUsed: true }, 'CORE', 'correct_with_hint'],
    [{ outcome: 'CORRECT' as const, hintUsed: false }, 'FOUNDATION', 'independent_correct'],
    [{ outcome: 'CORRECT' as const, hintUsed: false }, 'CORE', 'independent_correct'],
    [{ outcome: 'CORRECT' as const, hintUsed: false }, 'APPLICATION', 'application_correct'],
    [{ outcome: 'CORRECT' as const, hintUsed: false }, 'CHALLENGE', 'application_correct'],
  ])('projects %o at %s to %s', (attemptOverrides, band, evidenceType) => {
    const record = projectAttemptToEvidence(
      attempt(attemptOverrides),
      { ...item, difficultyBand: band as PracticeItem['difficultyBand'] },
    );
    expect(record).toEqual({
      id: 'practice-attempt:attempt-1',
      studentId: 'student-1',
      objectiveId: 'P2-MD-001',
      type: evidenceType,
      observedAt: '2026-08-25T00:01:00.000Z',
      recordedAt: '2026-08-25T00:01:00.000Z',
      origin: { kind: 'PRACTICE', refId: 'attempt-1' },
    });
  });

  it('rejects an attempt/item coordinate mismatch', () => {
    expect(() => projectAttemptToEvidence(attempt({ objectiveId: 'P2-MD-002' }), item))
      .toThrow('attempt and practice item coordinates must match');
  });
});
