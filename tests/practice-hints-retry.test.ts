import { describe, expect, it } from 'vitest';
import {
  hintRevealId,
  validateRetryAttempt,
} from '@/lib/practice';
import type { Attempt, RetryCoordinates, SubmitAttemptInput } from '@/lib/practice';

const coordinates: RetryCoordinates = {
  studentId: 'student-1', sessionId: 'session-1', itemId: 'item-1', objectiveId: 'P2-MD-001',
};

function attempt(id: string, outcome: Attempt['outcome'], submittedAt: string, overrides: Partial<Attempt> = {}): Attempt {
  return {
    id,
    source: { kind: 'PRACTICE', sessionId: coordinates.sessionId, itemId: coordinates.itemId },
    studentId: coordinates.studentId,
    objectiveId: coordinates.objectiveId,
    answerText: outcome === 'CORRECT' ? '6' : '5', outcome, hintUsed: false,
    gradingPolicyVersion: 'grading-v1', submittedAt, recordedAt: submittedAt, ...overrides,
  };
}

function input(overrides: Partial<SubmitAttemptInput> = {}): SubmitAttemptInput {
  return { attemptId: 'attempt-new', sessionId: coordinates.sessionId, itemId: coordinates.itemId, answerText: '6', ...overrides };
}

describe('hint and retry provenance', () => {
  it('derives stable escaped hint reveal ids', () => {
    expect(hintRevealId('student-1', 'item-1')).toBe('practice-hint:student-1:item-1');
    expect(hintRevealId('student:a', 'item:b')).toBe('practice-hint:student%3Aa:item%3Ab');
  });

  it('allows a first attempt without retry provenance', () => {
    expect(validateRetryAttempt([], input(), coordinates)).toBeUndefined();
  });

  it('requires a retry to point to the latest wrong attempt', () => {
    const first = attempt('a1', 'INCORRECT', '2026-08-25T00:01:00.000Z');
    const second = attempt('a2', 'INCORRECT', '2026-08-25T00:02:00.000Z', { retryOfAttemptId: 'a1' });
    expect(validateRetryAttempt([first, second], input({ retryOfAttemptId: 'a2' }), coordinates)).toEqual(second);
    expect(() => validateRetryAttempt([first, second], input({ retryOfAttemptId: 'a1' }), coordinates))
      .toThrow('retry must reference the latest attempt for the item');
  });

  it('rejects retry of a correct attempt', () => {
    const previous = attempt('a1', 'CORRECT', '2026-08-25T00:01:00.000Z');
    expect(() => validateRetryAttempt([previous], input({ retryOfAttemptId: 'a1' }), coordinates))
      .toThrow('correct attempt cannot be retried');
  });

  it('rejects a second fresh attempt after history exists', () => {
    const previous = attempt('a1', 'INCORRECT', '2026-08-25T00:01:00.000Z');
    expect(() => validateRetryAttempt([previous], input(), coordinates))
      .toThrow('subsequent attempt must retry the latest incorrect attempt');
  });

  it('rejects retry parents outside trusted coordinates', () => {
    const previous = attempt('a1', 'INCORRECT', '2026-08-25T00:01:00.000Z', { objectiveId: 'P2-MD-002' });
    expect(() => validateRetryAttempt([previous], input({ retryOfAttemptId: 'a1' }), coordinates))
      .toThrow('retry parent coordinates must match trusted practice coordinates');
  });

  it('rejects a retry id when no prior attempt exists', () => {
    expect(() => validateRetryAttempt([], input({ retryOfAttemptId: 'missing' }), coordinates))
      .toThrow('retry parent does not exist');
  });
});
