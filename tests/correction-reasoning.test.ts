import { describe, expect, test } from 'vitest';
import {
  buildReasoningChecks,
  gradeReasoningResponse,
  type DiagnosisTarget,
  type TrustedAttemptProblem,
} from '@/lib/correction';

const now = '2026-08-25T12:00:00.000Z';

function trusted(
  objectiveId: string,
  problemSpec: TrustedAttemptProblem['problemSpec'],
  answerSpec: TrustedAttemptProblem['answerSpec'],
): TrustedAttemptProblem {
  return {
    attempt: {
      id: `attempt-${objectiveId}`,
      source: { kind: 'PRACTICE', sessionId: 'session-1', itemId: 'item-1' },
      studentId: 'student-1',
      objectiveId,
      answerText: 'wrong',
      outcome: 'INCORRECT',
      hintUsed: false,
      gradingPolicyVersion: 'grading-v1',
      submittedAt: now,
      recordedAt: now,
    },
    problemSpec,
    answerSpec,
    prompt: 'trusted prompt',
    solutionOutline: [],
    classification: 'CORE',
  };
}

function misconception(misconceptionId: string): DiagnosisTarget {
  return { kind: 'MISCONCEPTION', misconceptionId };
}

describe('correction-reasoning-v1', () => {
  test('builds equal-groups fields from trusted quantities', () => {
    const problem = trusted(
      'P2-MD-005',
      {
        kind: 'WORD_PROBLEM',
        structure: 'EQUAL_GROUPS',
        quantities: { groups: 4, groupSize: 3, total: 12 },
        steps: [{ operation: 'MULTIPLY', operands: [4, 3], result: 12 }],
        answer: 12,
        templateId: 'equal-groups-basic',
      },
      { kind: 'INTEGER', value: '12' },
    );

    const checks = buildReasoningChecks(problem, misconception('MIS-MD-GROUP-SIZE'));
    expect(checks).toEqual([{
      id: 'reasoning:equal-groups',
      kind: 'FIELDS',
      prompt: 'Identify the total, number of groups, and size of each group.',
      fields: ['total', 'groups', 'groupSize'],
      expected: { total: '12', groups: '4', groupSize: '3' },
    }]);
    expect(gradeReasoningResponse(checks[0]!, { total: '12', groups: '4', groupSize: '3' })).toBe('PASS');
    expect(gradeReasoningResponse(checks[0]!, { total: '12', groups: '3', groupSize: '4' })).toBe('FAIL');
  });

  test('builds an inverse-relation choice from a trusted multiplication/division fact family', () => {
    const problem = trusted(
      'P2-MD-003',
      {
        kind: 'EQUATION_CHOICE',
        scenario: 'FACT_FAMILY',
        total: 20,
        groupSize: 5,
        groups: 4,
        options: [
          { id: 'A', expression: '4 × 5 = 20' },
          { id: 'B', expression: '20 ÷ 5 = 4' },
        ],
        correctOptionId: 'B',
      },
      { kind: 'CHOICE', optionId: 'B' },
    );

    const checks = buildReasoningChecks(problem, misconception('MIS-MD-INVERSE'));
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({
      id: 'reasoning:inverse-relation',
      kind: 'CHOICE',
      expectedOptionId: 'INVERSE',
    });
    expect(gradeReasoningResponse(checks[0]!, { optionId: 'INVERSE' })).toBe('PASS');
    expect(gradeReasoningResponse(checks[0]!, { optionId: 'UNRELATED' })).toBe('FAIL');
  });

  test('builds denominator/part-size reasoning for fraction comparison', () => {
    const problem = trusted(
      'P3-FRA-003',
      {
        kind: 'FRACTION_COMPARE',
        leftNumerator: 1,
        leftDenominator: 8,
        rightNumerator: 1,
        rightDenominator: 4,
      },
      { kind: 'EXACT_TEXT', acceptedValues: ['<'], caseSensitive: false },
    );

    const checks = buildReasoningChecks(problem, misconception('MIS-FRA-DENOMINATOR-SIZE'));
    expect(checks).toEqual([{
      id: 'reasoning:fraction-part-size',
      kind: 'CHOICE',
      prompt: 'For the same whole, what happens to each equal part when the denominator increases?',
      options: [
        { id: 'SMALLER', label: 'Each part becomes smaller' },
        { id: 'LARGER', label: 'Each part becomes larger' },
      ],
      expectedOptionId: 'SMALLER',
    }]);
    expect(gradeReasoningResponse(checks[0]!, { optionId: 'SMALLER' })).toBe('PASS');
  });

  test('builds same-scale-factor fields for equivalent fractions', () => {
    const problem = trusted(
      'P3-FRA-004',
      {
        kind: 'FRACTION_EQUIVALENT',
        numerator: 2,
        denominator: 3,
        scaleFactor: 4,
        missing: 'NUMERATOR',
      },
      { kind: 'INTEGER', value: '8' },
    );

    const checks = buildReasoningChecks(problem, misconception('MIS-FRA-EQUIVALENCE-ONE-SIDE'));
    expect(checks).toEqual([{
      id: 'reasoning:fraction-equivalence-scale',
      kind: 'FIELDS',
      prompt: 'What scale factor must be applied to both numerator and denominator?',
      fields: ['numeratorFactor', 'denominatorFactor'],
      expected: { numeratorFactor: '4', denominatorFactor: '4' },
    }]);
    expect(gradeReasoningResponse(checks[0]!, { numeratorFactor: '4', denominatorFactor: '4' })).toBe('PASS');
    expect(gradeReasoningResponse(checks[0]!, { numeratorFactor: '4', denominatorFactor: '1' })).toBe('FAIL');
  });

  test('fails closed with no reasoning policy for unsupported problem/target combinations', () => {
    const problem = trusted(
      'P3-FRA-005',
      {
        kind: 'FRACTION_OPERATION',
        operation: 'ADD',
        leftNumerator: 1,
        leftDenominator: 4,
        rightNumerator: 1,
        rightDenominator: 2,
      },
      { kind: 'FRACTION', numerator: 3, denominator: 4, equivalence: 'VALUE' },
    );

    expect(buildReasoningChecks(problem, { kind: 'GENERIC', code: 'UNKNOWN' })).toEqual([]);
  });

  test('rejects extra or missing structured response fields instead of accepting partial matches', () => {
    const spec = {
      id: 'reasoning:fields',
      kind: 'FIELDS' as const,
      prompt: 'Fill the fields.',
      fields: ['a', 'b'],
      expected: { a: '1', b: '2' },
    };
    expect(gradeReasoningResponse(spec, { a: '1' })).toBe('FAIL');
    expect(gradeReasoningResponse(spec, { a: '1', b: '2', c: '3' })).toBe('FAIL');
  });
});
