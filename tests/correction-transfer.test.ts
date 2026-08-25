import { describe, expect, test } from 'vitest';
import {
  UnsupportedCorrectionTransferError,
  correctionEvidenceIdForAttempt,
  generateCorrectionTransfer,
  projectCorrectedEvidence,
  projectTransferEvidence,
  reasoningEvidenceId,
  type CorrectionItem,
  type TrustedAttemptProblem,
  type TrustedTransferContext,
} from '@/lib/correction';
import type { AnswerSpec, Attempt, PracticeProblemSpec } from '@/lib/practice';

const now = '2026-08-25T12:00:00.000Z';

function original(
  objectiveId: string,
  problemSpec: PracticeProblemSpec,
  answerSpec: AnswerSpec,
): TrustedAttemptProblem {
  return {
    attempt: {
      id: `root-${objectiveId}`,
      source: { kind: 'PRACTICE', sessionId: 'session-1', itemId: 'item-1' },
      studentId: 'student-1', objectiveId, answerText: 'wrong', outcome: 'INCORRECT', hintUsed: false,
      gradingPolicyVersion: 'grading-v1', submittedAt: now, recordedAt: now,
    },
    problemSpec, answerSpec, prompt: 'original prompt', solutionOutline: [], classification: 'CORE',
  };
}

function context(originalProblem: TrustedAttemptProblem, round = 1): TrustedTransferContext {
  return {
    mistakeId: 'mistake-1', studentId: 'student-1', objectiveId: originalProblem.attempt.objectiveId,
    sourceAttemptId: originalProblem.attempt.id, original: originalProblem,
    round, itemId: `transfer-${round}`, now,
  };
}

function correctionAttempt(item: CorrectionItem, overrides: Partial<Attempt> = {}): Attempt {
  return {
    id: `attempt-${item.id}`,
    source: { kind: 'CORRECTION', mistakeId: item.mistakeId, correctionItemId: item.id },
    studentId: item.studentId, objectiveId: item.objectiveId, answerText: 'answer', outcome: 'CORRECT', hintUsed: false,
    gradingPolicyVersion: 'grading-v1', submittedAt: now, recordedAt: now,
    ...overrides,
  };
}

describe('deterministic correction transfer', () => {
  test('regenerates ARITHMETIC with the same operation and exact division', () => {
    const multiply = original('P2-MD-001',
      { kind: 'ARITHMETIC', operation: 'MULTIPLY', left: 3, right: 4 },
      { kind: 'INTEGER', value: '12' });
    const m1 = generateCorrectionTransfer(context(multiply, 1));
    const m1Replay = generateCorrectionTransfer(context(multiply, 1));
    const m2 = generateCorrectionTransfer(context(multiply, 2));
    expect(m1).toEqual(m1Replay);
    expect(m2.problemSpec).not.toEqual(m1.problemSpec);
    expect(m1.problemSpec).toMatchObject({ kind: 'ARITHMETIC', operation: 'MULTIPLY' });
    if (m1.problemSpec.kind !== 'ARITHMETIC') throw new Error('fixture mismatch');
    expect([2, 3, 4, 5, 10]).toContain(m1.problemSpec.left);

    const divide = original('P2-MD-004',
      { kind: 'ARITHMETIC', operation: 'DIVIDE', left: 20, right: 5 },
      { kind: 'INTEGER', value: '4' });
    const d = generateCorrectionTransfer(context(divide));
    if (d.problemSpec.kind !== 'ARITHMETIC' || d.answerSpec.kind !== 'INTEGER') throw new Error('fixture mismatch');
    expect(d.problemSpec.operation).toBe('DIVIDE');
    expect(d.problemSpec.left % d.problemSpec.right).toBe(0);
    expect(String(d.problemSpec.left / d.problemSpec.right)).toBe(d.answerSpec.value);
  });

  test('preserves EQUATION_CHOICE scenario and derives internally consistent quantities', () => {
    const source = original('P2-MD-003', {
      kind: 'EQUATION_CHOICE', scenario: 'FACT_FAMILY', total: 20, groupSize: 5, groups: 4,
      options: [{ id: 'A', expression: '20 ÷ 5 = 4' }, { id: 'B', expression: '4 × 5 = 21' }], correctOptionId: 'A',
    }, { kind: 'CHOICE', optionId: 'A' });
    const item = generateCorrectionTransfer(context(source));
    if (item.problemSpec.kind !== 'EQUATION_CHOICE' || item.answerSpec.kind !== 'CHOICE') throw new Error('fixture mismatch');
    expect(item.problemSpec.scenario).toBe('FACT_FAMILY');
    expect(item.problemSpec.total).toBe(item.problemSpec.groups * item.problemSpec.groupSize);
    expect(item.problemSpec.options.some((option) => option.id === item.problemSpec.correctOptionId)).toBe(true);
    expect(item.answerSpec.optionId).toBe(item.problemSpec.correctOptionId);
  });

  test('preserves each fraction family while deriving trusted answers', () => {
    const fixtures = [
      original('P3-FRA-003',
        { kind: 'FRACTION_COMPARE', leftNumerator: 1, leftDenominator: 8, rightNumerator: 1, rightDenominator: 4 },
        { kind: 'EXACT_TEXT', acceptedValues: ['<'], caseSensitive: false }),
      original('P3-FRA-004',
        { kind: 'FRACTION_EQUIVALENT', numerator: 2, denominator: 3, scaleFactor: 4, missing: 'NUMERATOR' },
        { kind: 'INTEGER', value: '8' }),
      original('P3-FRA-002',
        { kind: 'FRACTION_SIMPLIFY', numerator: 6, denominator: 9 },
        { kind: 'FRACTION', numerator: 2, denominator: 3, equivalence: 'EXACT_SIMPLEST' }),
      original('P3-FRA-005',
        { kind: 'FRACTION_OPERATION', operation: 'ADD', leftNumerator: 1, leftDenominator: 4, rightNumerator: 1, rightDenominator: 2 },
        { kind: 'FRACTION', numerator: 3, denominator: 4, equivalence: 'VALUE' }),
    ];

    for (const fixture of fixtures) {
      const item = generateCorrectionTransfer(context(fixture));
      expect(item.problemSpec.kind).toBe(fixture.problemSpec.kind);
      expect(item.problemSpec).not.toEqual(fixture.problemSpec);
    }

    const compare = generateCorrectionTransfer(context(fixtures[0]!));
    if (compare.problemSpec.kind !== 'FRACTION_COMPARE' || compare.answerSpec.kind !== 'EXACT_TEXT') throw new Error('fixture mismatch');
    const leftCross = compare.problemSpec.leftNumerator * compare.problemSpec.rightDenominator;
    const rightCross = compare.problemSpec.rightNumerator * compare.problemSpec.leftDenominator;
    const expected = leftCross < rightCross ? '<' : leftCross > rightCross ? '>' : '=';
    expect(compare.answerSpec.acceptedValues).toEqual([expected]);

    const equivalent = generateCorrectionTransfer(context(fixtures[1]!));
    if (equivalent.problemSpec.kind !== 'FRACTION_EQUIVALENT' || equivalent.answerSpec.kind !== 'INTEGER') throw new Error('fixture mismatch');
    expect(equivalent.problemSpec.missing).toBe('NUMERATOR');
    expect(equivalent.answerSpec.value).toBe(String(equivalent.problemSpec.numerator * equivalent.problemSpec.scaleFactor));

    const operation = generateCorrectionTransfer(context(fixtures[3]!));
    if (operation.problemSpec.kind !== 'FRACTION_OPERATION') throw new Error('fixture mismatch');
    expect(operation.problemSpec.operation).toBe('ADD');
  });

  test('preserves known WORD_PROBLEM template/structure/operation sequence and recomputes results', () => {
    const source = original('P3-MD-005', {
      kind: 'WORD_PROBLEM', structure: 'EQUAL_GROUPS', quantities: { groups: 4, size: 5, extra: 3 },
      steps: [
        { operation: 'MULTIPLY', operands: [4, 5], result: 20 },
        { operation: 'ADD', operands: [20, 3], result: 23 },
      ],
      answer: 23, templateId: 'p3-md-two-step-v1',
    }, { kind: 'INTEGER', value: '23' });
    const item = generateCorrectionTransfer(context(source));
    if (item.problemSpec.kind !== 'WORD_PROBLEM' || item.answerSpec.kind !== 'INTEGER') throw new Error('fixture mismatch');
    expect(item.problemSpec.templateId).toBe(source.problemSpec.kind === 'WORD_PROBLEM' ? source.problemSpec.templateId : '');
    expect(item.problemSpec.structure).toBe('EQUAL_GROUPS');
    expect(item.problemSpec.steps.map((step) => step.operation)).toEqual(['MULTIPLY', 'ADD']);
    expect(item.problemSpec.answer).toBe(item.problemSpec.steps.at(-1)?.result);
    expect(item.answerSpec.value).toBe(String(item.problemSpec.answer));
  });

  test('fails closed for unknown word-problem templates rather than inventing transfer structure', () => {
    const source = original('P3-MD-005', {
      kind: 'WORD_PROBLEM', structure: 'EQUAL_GROUPS', quantities: { a: 2, b: 3 },
      steps: [{ operation: 'MULTIPLY', operands: [2, 3], result: 6 }],
      answer: 6, templateId: 'unknown-template',
    }, { kind: 'INTEGER', value: '6' });
    expect(() => generateCorrectionTransfer(context(source))).toThrow(UnsupportedCorrectionTransferError);
  });
});

describe('CORRECTION Evidence projection', () => {
  const originalItem: CorrectionItem = {
    id: 'original-retry', mistakeId: 'mistake-1', studentId: 'student-1', objectiveId: 'P3-FRA-003',
    kind: 'ORIGINAL_RETRY', sourceAttemptId: 'root',
    problemSpec: { kind: 'FRACTION_COMPARE', leftNumerator: 1, leftDenominator: 8, rightNumerator: 1, rightDenominator: 4 },
    answerSpec: { kind: 'EXACT_TEXT', acceptedValues: ['<'], caseSensitive: false },
    prompt: '1/8 ? 1/4', solutionOutline: [], generator: 'correction-original', generatorVersion: 'v1', createdAt: now,
  };
  const transferItem: CorrectionItem = {
    ...originalItem, id: 'transfer-1', kind: 'TRANSFER', transferRound: 1,
    generator: 'correction-transfer', generatorVersion: 'correction-transfer-v1',
  };

  test('emits corrected only for a correct ORIGINAL_RETRY and never for a failed retry', () => {
    const correct = correctionAttempt(originalItem, { id: 'retry-correct', hintUsed: true });
    expect(projectCorrectedEvidence(correct, originalItem)).toEqual({
      id: correctionEvidenceIdForAttempt('retry-correct', 'corrected'),
      studentId: 'student-1', objectiveId: 'P3-FRA-003', type: 'corrected',
      observedAt: now, recordedAt: now, origin: { kind: 'CORRECTION', refId: 'retry-correct' },
    });
    expect(projectCorrectedEvidence({ ...correct, id: 'retry-wrong', outcome: 'INCORRECT' }, originalItem)).toBeNull();
  });

  test('emits application_correct only for the first no-hint correct TRANSFER attempt', () => {
    const correct = correctionAttempt(transferItem, { id: 'transfer-correct' });
    expect(projectTransferEvidence(correct, transferItem, [])).toMatchObject({
      id: correctionEvidenceIdForAttempt('transfer-correct', 'application_correct'),
      type: 'application_correct', origin: { kind: 'CORRECTION', refId: 'transfer-correct' },
    });
    expect(projectTransferEvidence({ ...correct, hintUsed: true }, transferItem, [])).toBeNull();
    const firstWrong = correctionAttempt(transferItem, { id: 'transfer-wrong', outcome: 'INCORRECT' });
    expect(projectTransferEvidence(correct, transferItem, [firstWrong])).toBeNull();
  });

  test('uses stable source-aware correction evidence ids', () => {
    expect(correctionEvidenceIdForAttempt('a1', 'corrected')).toBe('correction:corrected:a1');
    expect(correctionEvidenceIdForAttempt('a1', 'application_correct')).toBe('correction:application_correct:a1');
    expect(reasoningEvidenceId('m1', 'correction-reasoning-v1')).toBe('correction:explained:m1:correction-reasoning-v1');
  });
});
