import { describe, expect, it } from 'vitest';
import { convertHomeworkProblem } from '@/lib/homework';
import type { EffectiveHomeworkObservation, ExtractedField } from '@/lib/homework';

const region = { x: 0, y: 0, width: 0.5, height: 0.1 };
const field = (value: string): ExtractedField<string> => ({ value, confidence: 1, region });

function observation(family: string, fields: Record<string, string>, answer = 'student-answer'): EffectiveHomeworkObservation {
  return {
    id: 'hp-1', submissionId: 'hs-1', studentId: 's1', sequence: 1,
    question: field('fixture question'), answer: field(answer),
    structured: { family, fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, field(value)])) },
    provider: 'fixture', model: 'fixture-v1', schemaVersion: 'homework-vision-v1',
    createdAt: '2026-08-25T00:00:00.000Z',
  };
}

describe('homework deterministic conversion', () => {
  it('derives arithmetic answer keys from operands rather than the student answer', () => {
    const multiply = convertHomeworkProblem(observation('ARITHMETIC', {
      operation: 'MULTIPLY', left: '7', right: '8',
    }, '999'));
    expect(multiply).toEqual({
      supported: true,
      trusted: {
        problemSpec: { kind: 'ARITHMETIC', operation: 'MULTIPLY', left: 7, right: 8 },
        answerSpec: { kind: 'INTEGER', value: '56' },
        classification: 'CORE',
      },
    });

    const divide = convertHomeworkProblem(observation('ARITHMETIC', {
      operation: 'DIVIDE', left: '40', right: '5',
    }, '123'));
    expect(divide.supported && divide.trusted.answerSpec).toEqual({ kind: 'INTEGER', value: '8' });
  });

  it('converts simplify, compare, and related-fraction operations with trusted answers', () => {
    const simplify = convertHomeworkProblem(observation('FRACTION_SIMPLIFY', {
      numerator: '6', denominator: '8',
    }));
    expect(simplify.supported && simplify.trusted).toEqual({
      problemSpec: { kind: 'FRACTION_SIMPLIFY', numerator: 6, denominator: 8 },
      answerSpec: { kind: 'FRACTION', numerator: 3, denominator: 4, equivalence: 'EXACT_SIMPLEST' },
      classification: 'CORE',
    });

    const compare = convertHomeworkProblem(observation('FRACTION_COMPARE', {
      leftNumerator: '3', leftDenominator: '4', rightNumerator: '2', rightDenominator: '4',
    }));
    expect(compare.supported && compare.trusted.answerSpec).toEqual({
      kind: 'EXACT_TEXT', acceptedValues: ['>'], caseSensitive: false,
    });

    const operation = convertHomeworkProblem(observation('FRACTION_OPERATION', {
      operation: 'ADD', leftNumerator: '1', leftDenominator: '4', rightNumerator: '1', rightDenominator: '2',
    }));
    expect(operation.supported && operation.trusted.answerSpec).toEqual({
      kind: 'FRACTION', numerator: 3, denominator: 4, equivalence: 'VALUE',
    });
  });

  it('derives an equivalent-fraction missing value from visible fraction structure', () => {
    const result = convertHomeworkProblem(observation('FRACTION_EQUIVALENT', {
      numerator: '2', denominator: '3', targetNumerator: '', targetDenominator: '12', missing: 'NUMERATOR',
    }));
    expect(result.supported && result.trusted).toEqual({
      problemSpec: { kind: 'FRACTION_EQUIVALENT', numerator: 2, denominator: 3, scaleFactor: 4, missing: 'NUMERATOR' },
      answerSpec: { kind: 'INTEGER', value: '8' },
      classification: 'CORE',
    });
  });

  it('accepts an explicit, arithmetically consistent word-problem step graph', () => {
    const result = convertHomeworkProblem(observation('WORD_PROBLEM', {
      structure: 'EQUAL_GROUPS',
      quantities: JSON.stringify({ groups: 4, size: 6 }),
      steps: JSON.stringify([{ operation: 'MULTIPLY', operands: [4, 6], result: 24 }]),
    }));
    expect(result.supported && result.trusted).toEqual({
      problemSpec: {
        kind: 'WORD_PROBLEM', structure: 'EQUAL_GROUPS',
        quantities: { groups: 4, size: 6 },
        steps: [{ operation: 'MULTIPLY', operands: [4, 6], result: 24 }],
        answer: 24, templateId: 'homework-equal-groups-v1',
      },
      answerSpec: { kind: 'INTEGER', value: '24' },
      classification: 'APPLICATION',
    });
  });

  it('fails closed for missing structure, invalid fractions, unseen-key choices, and open explanations', () => {
    const cases = [
      observation('ARITHMETIC', { operation: 'MULTIPLY', left: '7' }),
      observation('FRACTION_SIMPLIFY', { numerator: '1', denominator: '0' }),
      observation('UNSEEN_KEY_MCQ', { prompt: 'Which answer?', options: '["A","B"]' }),
      observation('OPEN_EXPLANATION', { prompt: 'Explain your reasoning.' }),
    ];
    for (const input of cases) expect(convertHomeworkProblem(input).supported).toBe(false);
  });
});
