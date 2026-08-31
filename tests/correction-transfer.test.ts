import { describe, expect, test } from 'vitest';
import {
  correctionEvidenceIdForAttempt,
  generateCorrectionTransfer,
  projectCorrectedEvidence,
  projectTransferEvidence,
  reasoningEvidenceId,
  UnsupportedCorrectionTransferError,
} from '@/lib/correction';
import type { CorrectionItem, TrustedAttemptProblem } from '@/lib/correction';
import type { Attempt, AnswerSpec, PracticeProblemSpec } from '@/lib/practice';

function original(
  objectiveId: string,
  problemSpec: PracticeProblemSpec,
  answerSpec: AnswerSpec,
): TrustedAttemptProblem {
  return {
    attempt: {
      id: `attempt-${objectiveId}`,
      source: { kind: 'PRACTICE', sessionId: 'session-1', itemId: 'item-1' },
      studentId: 'student-1', objectiveId, answerText: 'wrong', outcome: 'INCORRECT', hintUsed: false,
      gradingPolicyVersion: 'grading-v1', submittedAt: '2026-08-25T00:00:00.000Z', recordedAt: '2026-08-25T00:00:00.000Z',
    },
    problemSpec,
    answerSpec,
    prompt: 'Original prompt',
    hint: 'Original hint',
    solutionOutline: ['Original solution'],
    classification: 'CORE',
  };
}

function context(problem: TrustedAttemptProblem, round = 1) {
  return {
    mistakeId: 'mistake-1',
    studentId: problem.attempt.studentId,
    objectiveId: problem.attempt.objectiveId,
    sourceAttemptId: problem.attempt.id,
    original: problem,
    round,
    itemId: `transfer-${round}`,
    now: '2026-08-25T00:01:00.000Z',
  };
}

function correctionAttempt(item: CorrectionItem, overrides: Partial<Attempt> = {}): Attempt {
  return {
    id: 'correction-attempt-1',
    source: { kind: 'CORRECTION', mistakeId: item.mistakeId, correctionItemId: item.id },
    studentId: item.studentId,
    objectiveId: item.objectiveId,
    answerText: 'answer',
    outcome: 'CORRECT',
    hintUsed: false,
    gradingPolicyVersion: 'grading-v1',
    submittedAt: '2026-08-25T00:02:00.000Z',
    recordedAt: '2026-08-25T00:02:00.000Z',
    ...overrides,
  };
}

describe('correction-transfer-v1', () => {
  test('is deterministic for the same trusted source and round, and changes safely by round', () => {
    const source = original('P2-MD-001',
      { kind: 'ARITHMETIC', operation: 'MULTIPLY', left: 3, right: 4 },
      { kind: 'INTEGER', value: '12' });
    const first = generateCorrectionTransfer(context(source));
    const replay = generateCorrectionTransfer(context(source));
    const second = generateCorrectionTransfer(context(source, 2));

    expect(replay).toEqual(first);
    expect(second.problemSpec).not.toEqual(first.problemSpec);
    expect(first).toMatchObject({
      kind: 'TRANSFER', mistakeId: 'mistake-1', objectiveId: 'P2-MD-001',
      transferRound: 1, generator: 'correction-transfer', generatorVersion: 'correction-transfer-v1',
    });
  });

  test('preserves arithmetic operation and exact divisibility', () => {
    const multiply = original('P2-MD-001',
      { kind: 'ARITHMETIC', operation: 'MULTIPLY', left: 3, right: 4 },
      { kind: 'INTEGER', value: '12' });
    const m1 = generateCorrectionTransfer(context(multiply));
    const m2 = generateCorrectionTransfer(context(multiply, 2));
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
    const problemSpec = item.problemSpec;
    expect(problemSpec.scenario).toBe('FACT_FAMILY');
    expect(problemSpec.total).toBe(problemSpec.groups * problemSpec.groupSize);
    expect(problemSpec.options.some((option) => option.id === problemSpec.correctOptionId)).toBe(true);
    expect(item.answerSpec.optionId).toBe(problemSpec.correctOptionId);
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
      expect(item.answerSpec).toBeDefined();
    }
  });

  test('preserves trusted word-problem template, structure, and step operations', () => {
    const source = original('P2-MD-005', {
      kind: 'WORD_PROBLEM', structure: 'EQUAL_GROUPS', quantities: { groups: 3, size: 4 },
      steps: [{ operation: 'MULTIPLY', operands: [3, 4], result: 12 }], answer: 12,
      templateId: 'p2-md-equal-groups-v1',
    }, { kind: 'INTEGER', value: '12' });
    const item = generateCorrectionTransfer(context(source));
    if (item.problemSpec.kind !== 'WORD_PROBLEM') throw new Error('fixture mismatch');
    expect(item.problemSpec.structure).toBe('EQUAL_GROUPS');
    expect(item.problemSpec.templateId).toBe('p2-md-equal-groups-v1');
    expect(item.problemSpec.steps.map((step) => step.operation)).toEqual(['MULTIPLY']);
  });

  test('fails closed for unregistered word-problem templates', () => {
    const source = original('P2-MD-005', {
      kind: 'WORD_PROBLEM', structure: 'EQUAL_GROUPS', quantities: { groups: 3, size: 4 },
      steps: [{ operation: 'MULTIPLY', operands: [3, 4], result: 12 }], answer: 12,
      templateId: 'future-template-v9',
    }, { kind: 'INTEGER', value: '12' });
    expect(() => generateCorrectionTransfer(context(source))).toThrow(UnsupportedCorrectionTransferError);
  });

  test('fails closed for TIME_24_HOUR until correction transfer support is explicitly added', () => {
    const source = original('P3-TIME-003', {
      kind: 'TIME_24_HOUR', direction: 'TWELVE_TO_24', hour24: 19, minute: 45, hour12: 7, period: 'PM',
    }, { kind: 'EXACT_TEXT', acceptedValues: ['19:45', '1945'], caseSensitive: false });
    expect(() => generateCorrectionTransfer(context(source))).toThrow(UnsupportedCorrectionTransferError);
  });
});

const originalItem: CorrectionItem = {
  id: 'retry-item', mistakeId: 'mistake-1', studentId: 'student-1', objectiveId: 'P3-FRA-003',
  kind: 'ORIGINAL_RETRY', sourceAttemptId: 'attempt-P3-FRA-003',
  problemSpec: { kind: 'FRACTION_COMPARE', leftNumerator: 1, leftDenominator: 8, rightNumerator: 1, rightDenominator: 4 },
  answerSpec: { kind: 'EXACT_TEXT', acceptedValues: ['<'], caseSensitive: false },
  prompt: 'Compare.', hint: 'Use a common whole.', solutionOutline: ['1/8 < 1/4'],
  generator: 'correction-original-retry', generatorVersion: 'correction-original-retry-v1',
  createdAt: '2026-08-25T00:01:00.000Z',
};

const transferItem: CorrectionItem = {
  ...originalItem,
  id: 'transfer-item', kind: 'TRANSFER', transferRound: 1,
  generator: 'correction-transfer', generatorVersion: 'correction-transfer-v1',
};

describe('CORRECTION Evidence projection', () => {
  test('emits corrected only for a correct ORIGINAL_RETRY and never for a failed retry', () => {
    const correct = correctionAttempt(originalItem, { id: 'retry-correct', outcome: 'CORRECT' });
    expect(projectCorrectedEvidence(correct, originalItem)).toEqual({
      id: correctionEvidenceIdForAttempt('retry-correct', 'corrected'),
      studentId: 'student-1', objectiveId: 'P3-FRA-003', type: 'corrected',
      observedAt: correct.submittedAt, recordedAt: correct.recordedAt,
      origin: { kind: 'CORRECTION', refId: 'retry-correct' },
    });
    expect(projectCorrectedEvidence(correctionAttempt(originalItem, { outcome: 'INCORRECT' }), originalItem)).toBeNull();
  });

  test('emits application_correct only for the first no-hint correct TRANSFER attempt', () => {
    const correct = correctionAttempt(transferItem, { id: 'transfer-correct' });
    expect(projectTransferEvidence(correct, transferItem, [])).toMatchObject({
      id: correctionEvidenceIdForAttempt('transfer-correct', 'application_correct'),
      type: 'application_correct', origin: { kind: 'CORRECTION', refId: 'transfer-correct' },
    });
    expect(projectTransferEvidence({ ...correct, hintUsed: true }, transferItem, [])).toBeNull();
    expect(projectTransferEvidence(correct, transferItem, [{ ...correct, id: 'prior', outcome: 'INCORRECT' }])).toBeNull();
  });

  test('uses stable source-aware correction evidence ids', () => {
    expect(correctionEvidenceIdForAttempt('a1', 'corrected')).toBe('correction:corrected:a1');
    expect(correctionEvidenceIdForAttempt('a1', 'application_correct')).toBe('correction:application_correct:a1');
    expect(reasoningEvidenceId('m1', 'correction-reasoning-v1')).toBe('correction:explained:m1:correction-reasoning-v1');
  });
});
