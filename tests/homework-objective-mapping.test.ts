import { describe, expect, it } from 'vitest';
import { mapHomeworkObjective } from '@/lib/homework';
import { getLearningObjective } from '@/lib/curriculum';
import type { TrustedHomeworkProblem } from '@/lib/homework';
import type { PracticeProblemSpec } from '@/lib/practice';

function trusted(problemSpec: PracticeProblemSpec, classification: 'CORE' | 'APPLICATION' = 'CORE'): TrustedHomeworkProblem {
  return { problemSpec, answerSpec: { kind: 'INTEGER', value: '1' }, classification };
}

const cases: Array<[level: 'P2' | 'P3', spec: PracticeProblemSpec, expected: string]> = [
  ['P2', { kind: 'ARITHMETIC', operation: 'MULTIPLY', left: 5, right: 7 }, 'P2-MD-001'],
  ['P2', { kind: 'ARITHMETIC', operation: 'DIVIDE', left: 40, right: 5 }, 'P2-MD-004'],
  ['P2', { kind: 'EQUATION_CHOICE', scenario: 'SHARING', total: 20, groupSize: 5, groups: 4, options: [], correctOptionId: 'A' }, 'P2-MD-002'],
  ['P2', { kind: 'EQUATION_CHOICE', scenario: 'FACT_FAMILY', total: 20, groupSize: 5, groups: 4, options: [], correctOptionId: 'A' }, 'P2-MD-003'],
  ['P2', { kind: 'WORD_PROBLEM', structure: 'EQUAL_GROUPS', quantities: {}, steps: [{ operation: 'MULTIPLY', operands: [4, 5], result: 20 }], answer: 20, templateId: 'fixture' }, 'P2-MD-005'],
  ['P2', { kind: 'WORD_PROBLEM', structure: 'PART_WHOLE', quantities: {}, steps: [{ operation: 'ADD', operands: [3, 4], result: 7 }], answer: 7, templateId: 'fixture' }, 'P2-AS-002'],
  ['P3', { kind: 'FRACTION_EQUIVALENT', numerator: 2, denominator: 3, scaleFactor: 4, missing: 'NUMERATOR' }, 'P3-FRA-004'],
  ['P3', { kind: 'FRACTION_SIMPLIFY', numerator: 6, denominator: 8 }, 'P3-FRA-002'],
  ['P3', { kind: 'FRACTION_COMPARE', leftNumerator: 2, leftDenominator: 3, rightNumerator: 3, rightDenominator: 4 }, 'P3-FRA-003'],
  ['P3', { kind: 'FRACTION_OPERATION', operation: 'ADD', leftNumerator: 1, leftDenominator: 4, rightNumerator: 1, rightDenominator: 2 }, 'P3-FRA-005'],
  ['P3', { kind: 'WORD_PROBLEM', structure: 'EQUAL_GROUPS', quantities: {}, steps: [{ operation: 'MULTIPLY', operands: [4, 5], result: 20 }, { operation: 'ADD', operands: [20, 2], result: 22 }], answer: 22, templateId: 'fixture' }, 'P3-MD-005'],
  ['P3', { kind: 'WORD_PROBLEM', structure: 'COMPARISON', quantities: {}, steps: [{ operation: 'SUBTRACT', operands: [9, 4], result: 5 }], answer: 5, templateId: 'fixture' }, 'P3-AS-002'],
];

describe('homework objective mapping', () => {
  it.each(cases)('maps %s supported paper structure to exactly %s', (level, spec, expected) => {
    const result = mapHomeworkObjective(level, trusted(spec, spec.kind === 'WORD_PROBLEM' ? 'APPLICATION' : 'CORE'));
    expect(result).toEqual({ candidates: [expected], version: 'homework-objective-map-v1' });
    expect(getLearningObjective(expected).levelId).toBe(level);
  });

  it('does not infer mental-calculation or recognition-only objectives from paper work', () => {
    const p2 = mapHomeworkObjective('P2', trusted({ kind: 'ARITHMETIC', operation: 'MULTIPLY', left: 5, right: 7 }));
    expect(p2.candidates).not.toContain('P2-MD-006');

    const p3 = mapHomeworkObjective('P3', trusted({
      kind: 'FRACTION_EQUIVALENT', numerator: 2, denominator: 3, scaleFactor: 4, missing: 'NUMERATOR',
    }));
    expect(p3.candidates).not.toContain('P3-FRA-001');
    expect(p3.candidates).not.toContain('P3-MD-006');
  });

  it('returns zero candidates outside the locked V1 map instead of guessing', () => {
    expect(mapHomeworkObjective('P3', trusted({
      kind: 'ARITHMETIC', operation: 'MULTIPLY', left: 5, right: 7,
    })).candidates).toEqual([]);
    expect(mapHomeworkObjective('P2', trusted({
      kind: 'FRACTION_SIMPLIFY', numerator: 6, denominator: 8,
    })).candidates).toEqual([]);
    expect(mapHomeworkObjective('P2', trusted({
      kind: 'ARITHMETIC', operation: 'MULTIPLY', left: 7, right: 8,
    })).candidates).toEqual([]);
  });
});
