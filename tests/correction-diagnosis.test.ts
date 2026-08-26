import { describe, expect, test } from 'vitest';
import {
  allowedDiagnosisTargets,
  diagnoseDeterministically,
  type TrustedAttemptProblem,
} from '@/lib/correction';

const now = '2026-08-25T12:00:00.000Z';

function problem(
  objectiveId: string,
  problemSpec: TrustedAttemptProblem['problemSpec'],
  answerSpec: TrustedAttemptProblem['answerSpec'],
  answerText: string,
): TrustedAttemptProblem {
  return {
    attempt: {
      id: `attempt-${objectiveId}`,
      source: { kind: 'PRACTICE', sessionId: 'session-1', itemId: 'item-1' },
      studentId: 'student-1',
      objectiveId,
      answerText,
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

describe('mistake-diagnosis-v1', () => {
  test('proves denominator-size misconception for reversed unit-fraction comparison', () => {
    const input = problem(
      'P3-FRA-003',
      {
        kind: 'FRACTION_COMPARE',
        leftNumerator: 1,
        leftDenominator: 8,
        rightNumerator: 1,
        rightDenominator: 4,
      },
      { kind: 'EXACT_TEXT', acceptedValues: ['<'], caseSensitive: false },
      '>',
    );

    expect(diagnoseDeterministically(input).provenTargets).toEqual([
      { kind: 'MISCONCEPTION', misconceptionId: 'MIS-FRA-DENOMINATOR-SIZE' },
    ]);
  });

  test('proves multiplication fact retrieval error for a wrong product on a fact objective', () => {
    const input = problem(
      'P2-MD-001',
      { kind: 'ARITHMETIC', operation: 'MULTIPLY', left: 4, right: 5 },
      { kind: 'INTEGER', value: '20' },
      '24',
    );

    expect(diagnoseDeterministically(input).provenTargets).toEqual([
      { kind: 'MISCONCEPTION', misconceptionId: 'MIS-MD-FACT-RETRIEVAL' },
    ]);
  });

  test('returns no proven target when typed facts do not prove a misconception', () => {
    const input = problem(
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
      '2/6',
    );

    expect(diagnoseDeterministically(input).provenTargets).toEqual([]);
  });

  test('keeps ambiguous multiply/divide errors unconfirmed while exposing allowed targets', () => {
    const input = problem(
      'P2-MD-004',
      { kind: 'ARITHMETIC', operation: 'DIVIDE', left: 20, right: 5 },
      { kind: 'INTEGER', value: '4' },
      '5',
    );

    const result = diagnoseDeterministically(input);
    expect(result.provenTargets).toEqual([]);
    expect(result.allowedTargets).toEqual(allowedDiagnosisTargets('P2-MD-004'));
    expect(result.allowedTargets).toEqual(expect.arrayContaining([
      { kind: 'MISCONCEPTION', misconceptionId: 'MIS-MD-INVERSE' },
      { kind: 'MISCONCEPTION', misconceptionId: 'MIS-MD-FACT-RETRIEVAL' },
    ]));
  });
});
