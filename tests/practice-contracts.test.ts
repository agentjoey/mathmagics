import { describe, expect, it } from 'vitest';
import {
  assertValidAttempt,
  assertValidPracticeHintReveal,
  assertValidPracticeItem,
  assertValidPracticeSession,
} from '@/lib/practice';
import type {
  Attempt,
  PracticeHintReveal,
  PracticeItem,
  PracticeSession,
} from '@/lib/practice';

const session: PracticeSession = {
  id: 'ps-1',
  studentId: 's1',
  lessonId: 'l1',
  objectiveId: 'P2-MD-001',
  policyVersion: 'practice-v1',
  createdAt: '2026-08-25T00:00:00.000Z',
};

const item: PracticeItem = {
  id: 'pi-1',
  sessionId: 'ps-1',
  studentId: 's1',
  objectiveId: 'P2-MD-001',
  sequence: 1,
  difficultyBand: 'CORE',
  problemSpec: {
    kind: 'ARITHMETIC',
    operation: 'MULTIPLY',
    left: 2,
    right: 3,
  },
  prompt: 'What is 2 × 3?',
  answerSpec: { kind: 'INTEGER', value: '6' },
  hint: 'Think of two groups of three.',
  solutionOutline: ['2 × 3 = 6'],
  generator: 'p2-md',
  generatorVersion: '1',
  createdAt: '2026-08-25T00:00:00.000Z',
};

const attempt: Attempt = {
  id: 'a1',
  sessionId: 'ps-1',
  itemId: 'pi-1',
  studentId: 's1',
  objectiveId: 'P2-MD-001',
  answerText: '6',
  outcome: 'CORRECT',
  hintUsed: false,
  gradingPolicyVersion: 'grading-v1',
  submittedAt: '2026-08-25T00:01:00.000Z',
  recordedAt: '2026-08-25T00:01:00.000Z',
};

describe('practice contracts', () => {
  it('accepts valid immutable practice facts', () => {
    expect(() => assertValidPracticeSession(session)).not.toThrow();
    expect(() => assertValidPracticeItem(item)).not.toThrow();
    expect(() => assertValidAttempt(attempt)).not.toThrow();
  });

  it('rejects empty practice objective id', () => {
    expect(() => assertValidPracticeSession({ ...session, objectiveId: '' }))
      .toThrow('practice session objectiveId must be non-empty');
  });

  it('rejects attempt recorded before submission', () => {
    expect(() => assertValidAttempt({
      ...attempt,
      recordedAt: '2026-08-25T00:00:59.000Z',
    })).toThrow('attempt recordedAt must not precede submittedAt');
  });

  it('requires positive item sequence and finite arithmetic parameters', () => {
    expect(() => assertValidPracticeItem({ ...item, sequence: 0 }))
      .toThrow('practice item sequence must be a positive integer');
    expect(() => assertValidPracticeItem({
      ...item,
      problemSpec: { kind: 'ARITHMETIC', operation: 'MULTIPLY', left: Number.NaN, right: 3 },
    })).toThrow('practice problem numeric parameters must be finite');
  });

  it('requires positive fraction denominators', () => {
    expect(() => assertValidPracticeItem({
      ...item,
      problemSpec: {
        kind: 'FRACTION_COMPARE',
        leftNumerator: 1,
        leftDenominator: 0,
        rightNumerator: 1,
        rightDenominator: 2,
      },
      answerSpec: { kind: 'CHOICE', optionId: 'LEFT' },
    })).toThrow('fraction denominators must be positive integers');
  });

  it('requires non-empty solution outline, generator, and generator version', () => {
    expect(() => assertValidPracticeItem({ ...item, solutionOutline: [] }))
      .toThrow('practice item solutionOutline must be non-empty');
    expect(() => assertValidPracticeItem({ ...item, generator: ' ' }))
      .toThrow('practice item generator must be non-empty');
    expect(() => assertValidPracticeItem({ ...item, generatorVersion: '' }))
      .toThrow('practice item generatorVersion must be non-empty');
  });

  it('validates equation-choice options and correct membership', () => {
    const base = {
      ...item,
      problemSpec: {
        kind: 'EQUATION_CHOICE' as const,
        scenario: 'SHARING' as const,
        total: 12,
        groupSize: 3,
        groups: 4,
        options: [
          { id: 'a', expression: '12 ÷ 3 = 4' },
          { id: 'b', expression: '12 ÷ 4 = 3' },
        ],
        correctOptionId: 'a',
      },
      answerSpec: { kind: 'CHOICE' as const, optionId: 'a' },
    };
    expect(() => assertValidPracticeItem(base)).not.toThrow();
    expect(() => assertValidPracticeItem({
      ...base,
      problemSpec: {
        ...base.problemSpec,
        options: [
          { id: 'a', expression: '12 ÷ 3 = 4' },
          { id: 'a', expression: '12 ÷ 4 = 3' },
        ],
      },
    })).toThrow('equation choice option ids must be unique');
    expect(() => assertValidPracticeItem({
      ...base,
      problemSpec: { ...base.problemSpec, correctOptionId: 'missing' },
    })).toThrow('equation choice correctOptionId must reference an option');
  });

  it('validates word-problem step arithmetic and final answer', () => {
    const base = {
      ...item,
      problemSpec: {
        kind: 'WORD_PROBLEM' as const,
        structure: 'PART_WHOLE' as const,
        quantities: { first: 3, second: 4 },
        steps: [{ operation: 'ADD' as const, operands: [3, 4], result: 7 }],
        answer: 7,
        templateId: 'part-whole-1',
      },
      answerSpec: { kind: 'INTEGER' as const, value: '7' },
    };
    expect(() => assertValidPracticeItem(base)).not.toThrow();
    expect(() => assertValidPracticeItem({
      ...base,
      problemSpec: { ...base.problemSpec, steps: [] },
    })).toThrow('word problem steps must be non-empty');
    expect(() => assertValidPracticeItem({
      ...base,
      problemSpec: {
        ...base.problemSpec,
        steps: [{ operation: 'ADD', operands: [3, 4], result: 8 }],
      },
    })).toThrow('word problem step result must match its operation and operands');
    expect(() => assertValidPracticeItem({
      ...base,
      problemSpec: { ...base.problemSpec, answer: 8 },
    })).toThrow('word problem answer must equal final step result');
  });

  it('validates hint reveal timestamps and retry self-reference', () => {
    const reveal: PracticeHintReveal = {
      id: 'hr-1', sessionId: 'ps-1', itemId: 'pi-1', studentId: 's1',
      revealedAt: '2026-08-25T00:00:30.000Z',
    };
    expect(() => assertValidPracticeHintReveal(reveal)).not.toThrow();
    expect(() => assertValidPracticeHintReveal({ ...reveal, revealedAt: 'bad' }))
      .toThrow('practice hint reveal revealedAt must be a valid ISO date-time string');
    expect(() => assertValidAttempt({ ...attempt, retryOfAttemptId: attempt.id }))
      .toThrow('attempt retryOfAttemptId must not equal attempt id');
  });
});
