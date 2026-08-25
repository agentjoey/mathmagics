import type { DiagnosisTarget, ReasoningCheckSpec, TrustedAttemptProblem } from './types';

function isMisconception(target: DiagnosisTarget, id: string): boolean {
  return target.kind === 'MISCONCEPTION' && target.misconceptionId === id;
}

export function buildReasoningChecks(
  problem: TrustedAttemptProblem,
  target: DiagnosisTarget,
): ReasoningCheckSpec[] {
  const spec = problem.problemSpec;

  if (
    isMisconception(target, 'MIS-MD-GROUP-SIZE')
    && spec.kind === 'WORD_PROBLEM'
    && spec.structure === 'EQUAL_GROUPS'
  ) {
    const total = spec.quantities.total;
    const groups = spec.quantities.groups;
    const groupSize = spec.quantities.groupSize;
    if ([total, groups, groupSize].every((value) => Number.isFinite(value))) {
      return [{
        id: 'reasoning:equal-groups',
        kind: 'FIELDS',
        prompt: 'Identify the total, number of groups, and size of each group.',
        fields: ['total', 'groups', 'groupSize'],
        expected: {
          total: String(total),
          groups: String(groups),
          groupSize: String(groupSize),
        },
      }];
    }
  }

  if (
    isMisconception(target, 'MIS-MD-INVERSE')
    && spec.kind === 'EQUATION_CHOICE'
    && spec.scenario === 'FACT_FAMILY'
  ) {
    return [{
      id: 'reasoning:inverse-relation',
      kind: 'CHOICE',
      prompt: 'How are the multiplication and division facts for these quantities related?',
      options: [
        { id: 'INVERSE', label: 'They are inverse operations in the same fact family' },
        { id: 'UNRELATED', label: 'They are unrelated facts' },
      ],
      expectedOptionId: 'INVERSE',
    }];
  }

  if (
    isMisconception(target, 'MIS-FRA-DENOMINATOR-SIZE')
    && spec.kind === 'FRACTION_COMPARE'
  ) {
    return [{
      id: 'reasoning:fraction-part-size',
      kind: 'CHOICE',
      prompt: 'For the same whole, what happens to each equal part when the denominator increases?',
      options: [
        { id: 'SMALLER', label: 'Each part becomes smaller' },
        { id: 'LARGER', label: 'Each part becomes larger' },
      ],
      expectedOptionId: 'SMALLER',
    }];
  }

  if (
    isMisconception(target, 'MIS-FRA-EQUIVALENCE-ONE-SIDE')
    && spec.kind === 'FRACTION_EQUIVALENT'
  ) {
    return [{
      id: 'reasoning:fraction-equivalence-scale',
      kind: 'FIELDS',
      prompt: 'What scale factor must be applied to both numerator and denominator?',
      fields: ['numeratorFactor', 'denominatorFactor'],
      expected: {
        numeratorFactor: String(spec.scaleFactor),
        denominatorFactor: String(spec.scaleFactor),
      },
    }];
  }

  return [];
}

function exactResponseKeys(response: Record<string, string>, expectedKeys: string[]): boolean {
  const actual = Object.keys(response).sort();
  const expected = expectedKeys.slice().sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function gradeReasoningResponse(
  spec: ReasoningCheckSpec,
  response: Record<string, string>,
): 'PASS' | 'FAIL' {
  if (spec.kind === 'CHOICE') {
    if (!exactResponseKeys(response, ['optionId'])) return 'FAIL';
    return response.optionId?.trim() === spec.expectedOptionId ? 'PASS' : 'FAIL';
  }

  if (!exactResponseKeys(response, spec.fields)) return 'FAIL';
  for (const field of spec.fields) {
    if (response[field]?.trim() !== spec.expected[field]?.trim()) return 'FAIL';
  }
  return 'PASS';
}
