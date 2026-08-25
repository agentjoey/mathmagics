import { describe, expect, it } from 'vitest';
import { gradeAnswer, assertValidPracticeItem } from '@/lib/practice';
import type { AnswerSpec, PracticeItem } from '@/lib/practice';

function grade(answerText: string, answerSpec: AnswerSpec) {
  return gradeAnswer(answerText, answerSpec);
}

describe('deterministic practice grading', () => {
  it('grades integer syntax exactly and canonicalizes leading zeros', () => {
    expect(grade(' 06 ', { kind: 'INTEGER', value: '6' })).toEqual({ outcome: 'CORRECT', normalizedAnswer: '6' });
    expect(grade('6.0', { kind: 'INTEGER', value: '6' }).outcome).toBe('INCORRECT');
  });

  it('compares decimals exactly without floating tolerance', () => {
    expect(grade('1.20', { kind: 'DECIMAL', value: '1.2' })).toEqual({ outcome: 'CORRECT', normalizedAnswer: '1.2' });
    expect(grade('1.2001', { kind: 'DECIMAL', value: '1.2' }).outcome).toBe('INCORRECT');
  });

  it('grades fraction value equivalence and exact simplest form separately', () => {
    expect(grade('2/4', { kind: 'FRACTION', numerator: 1, denominator: 2, equivalence: 'VALUE' })).toEqual({
      outcome: 'CORRECT', normalizedAnswer: '1/2',
    });
    expect(grade('2/4', { kind: 'FRACTION', numerator: 1, denominator: 2, equivalence: 'EXACT_SIMPLEST' }).outcome)
      .toBe('INCORRECT');
    expect(grade('1/2', { kind: 'FRACTION', numerator: 1, denominator: 2, equivalence: 'EXACT_SIMPLEST' }).outcome)
      .toBe('CORRECT');
  });

  it('grades choice ids exactly after outer whitespace trim', () => {
    expect(grade(' A ', { kind: 'CHOICE', optionId: 'A' }).outcome).toBe('CORRECT');
    expect(grade('a', { kind: 'CHOICE', optionId: 'A' }).outcome).toBe('INCORRECT');
  });

  it('normalizes exact text whitespace and case under the declared policy', () => {
    expect(grade('  Greater   Than ', {
      kind: 'EXACT_TEXT', acceptedValues: ['greater than'], caseSensitive: false,
    })).toEqual({ outcome: 'CORRECT', normalizedAnswer: 'greater than' });
  });

  it('treats malformed student syntax as incorrect', () => {
    expect(grade('six', { kind: 'INTEGER', value: '6' }).outcome).toBe('INCORRECT');
    expect(grade('1//2', { kind: 'FRACTION', numerator: 1, denominator: 2, equivalence: 'VALUE' }).outcome)
      .toBe('INCORRECT');
  });

  it('rejects malformed trusted numeric answer specs during item validation', () => {
    const item: PracticeItem = {
      id: 'i1', sessionId: 'ps1', studentId: 's1', objectiveId: 'P2-MD-001', sequence: 1,
      difficultyBand: 'CORE',
      problemSpec: { kind: 'ARITHMETIC', operation: 'MULTIPLY', left: 2, right: 3 },
      prompt: '2 × 3?', answerSpec: { kind: 'INTEGER', value: '6.0' },
      solutionOutline: ['2 × 3 = 6'], generator: 'test', generatorVersion: '1',
      createdAt: '2026-08-25T00:00:00.000Z',
    };
    expect(() => assertValidPracticeItem(item)).toThrow('integer answer spec value must be valid integer syntax');
  });
});
