import type { AnswerSpec, PracticeProblemSpec, WordProblemStep } from '@/lib/practice';
import type { EffectiveHomeworkObservation } from './types';

export interface TrustedHomeworkProblem {
  problemSpec: PracticeProblemSpec;
  answerSpec: AnswerSpec;
  classification: 'CORE' | 'APPLICATION';
}

export type HomeworkConversionResult =
  | { supported: true; trusted: TrustedHomeworkProblem }
  | { supported: false; reason: string };

function unsupported(reason: string): HomeworkConversionResult {
  return { supported: false, reason };
}

function value(input: EffectiveHomeworkObservation, key: string): string | undefined {
  return input.structured.fields[key]?.value;
}

function integer(raw: string | undefined): number | undefined {
  if (raw === undefined || !/^[+-]?\d+$/u.test(raw.trim())) return undefined;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function positiveInteger(raw: string | undefined): number | undefined {
  const parsed = integer(raw);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}

function gcd(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

function simplify(numerator: number, denominator: number): { numerator: number; denominator: number } {
  const divisor = gcd(numerator, denominator);
  let nextNumerator = numerator / divisor;
  let nextDenominator = denominator / divisor;
  if (nextDenominator < 0) {
    nextNumerator = -nextNumerator;
    nextDenominator = -nextDenominator;
  }
  return { numerator: nextNumerator, denominator: nextDenominator };
}

function convertArithmetic(input: EffectiveHomeworkObservation): HomeworkConversionResult {
  const operation = value(input, 'operation');
  const left = integer(value(input, 'left'));
  const right = integer(value(input, 'right'));
  if ((operation !== 'MULTIPLY' && operation !== 'DIVIDE') || left === undefined || right === undefined) {
    return unsupported('arithmetic structure is incomplete');
  }
  if (operation === 'DIVIDE' && (right === 0 || left % right !== 0)) {
    return unsupported('division must have a non-zero divisor and integer result');
  }
  const answer = operation === 'MULTIPLY' ? left * right : left / right;
  if (!Number.isSafeInteger(answer)) return unsupported('arithmetic result is outside safe integer range');
  return {
    supported: true,
    trusted: {
      problemSpec: { kind: 'ARITHMETIC', operation, left, right },
      answerSpec: { kind: 'INTEGER', value: String(answer) },
      classification: 'CORE',
    },
  };
}

function convertFractionEquivalent(input: EffectiveHomeworkObservation): HomeworkConversionResult {
  const numerator = positiveInteger(value(input, 'numerator'));
  const denominator = positiveInteger(value(input, 'denominator'));
  const missing = value(input, 'missing');
  if (!numerator || !denominator || (missing !== 'NUMERATOR' && missing !== 'DENOMINATOR')) {
    return unsupported('equivalent-fraction structure is incomplete');
  }

  let scaleFactor: number | undefined;
  let answer: number | undefined;
  if (missing === 'NUMERATOR') {
    const targetDenominator = positiveInteger(value(input, 'targetDenominator'));
    if (!targetDenominator || targetDenominator % denominator !== 0) return unsupported('equivalent denominator has no integer scale factor');
    scaleFactor = targetDenominator / denominator;
    answer = numerator * scaleFactor;
  } else {
    const targetNumerator = positiveInteger(value(input, 'targetNumerator'));
    if (!targetNumerator || targetNumerator % numerator !== 0) return unsupported('equivalent numerator has no integer scale factor');
    scaleFactor = targetNumerator / numerator;
    answer = denominator * scaleFactor;
  }
  if (!Number.isSafeInteger(answer) || !Number.isSafeInteger(scaleFactor) || scaleFactor <= 0) {
    return unsupported('equivalent-fraction result is invalid');
  }
  return {
    supported: true,
    trusted: {
      problemSpec: { kind: 'FRACTION_EQUIVALENT', numerator, denominator, scaleFactor, missing },
      answerSpec: { kind: 'INTEGER', value: String(answer) },
      classification: 'CORE',
    },
  };
}

function convertFractionSimplify(input: EffectiveHomeworkObservation): HomeworkConversionResult {
  const numerator = integer(value(input, 'numerator'));
  const denominator = positiveInteger(value(input, 'denominator'));
  if (numerator === undefined || !denominator) return unsupported('fraction simplify structure is invalid');
  const reduced = simplify(numerator, denominator);
  return {
    supported: true,
    trusted: {
      problemSpec: { kind: 'FRACTION_SIMPLIFY', numerator, denominator },
      answerSpec: { kind: 'FRACTION', ...reduced, equivalence: 'EXACT_SIMPLEST' },
      classification: 'CORE',
    },
  };
}

function convertFractionCompare(input: EffectiveHomeworkObservation): HomeworkConversionResult {
  const leftNumerator = integer(value(input, 'leftNumerator'));
  const leftDenominator = positiveInteger(value(input, 'leftDenominator'));
  const rightNumerator = integer(value(input, 'rightNumerator'));
  const rightDenominator = positiveInteger(value(input, 'rightDenominator'));
  if (leftNumerator === undefined || !leftDenominator || rightNumerator === undefined || !rightDenominator) {
    return unsupported('fraction comparison structure is invalid');
  }
  const leftCross = leftNumerator * rightDenominator;
  const rightCross = rightNumerator * leftDenominator;
  const symbol = leftCross < rightCross ? '<' : leftCross > rightCross ? '>' : '=';
  return {
    supported: true,
    trusted: {
      problemSpec: { kind: 'FRACTION_COMPARE', leftNumerator, leftDenominator, rightNumerator, rightDenominator },
      answerSpec: { kind: 'EXACT_TEXT', acceptedValues: [symbol], caseSensitive: false },
      classification: 'CORE',
    },
  };
}

function convertFractionOperation(input: EffectiveHomeworkObservation): HomeworkConversionResult {
  const operation = value(input, 'operation');
  const leftNumerator = integer(value(input, 'leftNumerator'));
  const leftDenominator = positiveInteger(value(input, 'leftDenominator'));
  const rightNumerator = integer(value(input, 'rightNumerator'));
  const rightDenominator = positiveInteger(value(input, 'rightDenominator'));
  if ((operation !== 'ADD' && operation !== 'SUBTRACT') || leftNumerator === undefined || !leftDenominator || rightNumerator === undefined || !rightDenominator) {
    return unsupported('fraction operation structure is invalid');
  }
  const numerator = operation === 'ADD'
    ? leftNumerator * rightDenominator + rightNumerator * leftDenominator
    : leftNumerator * rightDenominator - rightNumerator * leftDenominator;
  const denominator = leftDenominator * rightDenominator;
  const reduced = simplify(numerator, denominator);
  return {
    supported: true,
    trusted: {
      problemSpec: { kind: 'FRACTION_OPERATION', operation, leftNumerator, leftDenominator, rightNumerator, rightDenominator },
      answerSpec: { kind: 'FRACTION', ...reduced, equivalence: 'VALUE' },
      classification: 'CORE',
    },
  };
}

function parseJsonObject(raw: string | undefined): Record<string, number> | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return undefined;
    const entries = Object.entries(parsed as Record<string, unknown>);
    if (!entries.every(([key, item]) => key.length > 0 && typeof item === 'number' && Number.isFinite(item))) return undefined;
    return Object.fromEntries(entries) as Record<string, number>;
  } catch {
    return undefined;
  }
}

function computeStep(step: WordProblemStep): number | undefined {
  if (step.operands.length < 2 || !step.operands.every(Number.isFinite)) return undefined;
  const [first, ...rest] = step.operands;
  if (first === undefined) return undefined;
  switch (step.operation) {
    case 'ADD': return rest.reduce((total, item) => total + item, first);
    case 'SUBTRACT': return rest.reduce((total, item) => total - item, first);
    case 'MULTIPLY': return rest.reduce((total, item) => total * item, first);
    case 'DIVIDE': {
      if (rest.some((item) => item === 0)) return undefined;
      return rest.reduce((total, item) => total / item, first);
    }
  }
}

function parseSteps(raw: string | undefined): WordProblemStep[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return undefined;
    const steps: WordProblemStep[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') return undefined;
      const candidate = entry as Partial<WordProblemStep>;
      if (!['ADD', 'SUBTRACT', 'MULTIPLY', 'DIVIDE'].includes(candidate.operation ?? '')) return undefined;
      if (!Array.isArray(candidate.operands) || typeof candidate.result !== 'number' || !Number.isFinite(candidate.result)) return undefined;
      const step = candidate as WordProblemStep;
      const computed = computeStep(step);
      if (computed === undefined || computed !== step.result) return undefined;
      steps.push(step);
    }
    return steps;
  } catch {
    return undefined;
  }
}

function convertWordProblem(input: EffectiveHomeworkObservation): HomeworkConversionResult {
  const structure = value(input, 'structure');
  if (!['EQUAL_GROUPS', 'SHARING', 'GROUPING', 'PART_WHOLE', 'COMPARISON'].includes(structure ?? '')) {
    return unsupported('word-problem structure is invalid');
  }
  const quantities = parseJsonObject(value(input, 'quantities'));
  const steps = parseSteps(value(input, 'steps'));
  if (!quantities || !steps) return unsupported('word-problem quantities or steps are invalid');
  const answer = steps.at(-1)!.result;
  const typedStructure = structure as 'EQUAL_GROUPS' | 'SHARING' | 'GROUPING' | 'PART_WHOLE' | 'COMPARISON';
  return {
    supported: true,
    trusted: {
      problemSpec: {
        kind: 'WORD_PROBLEM',
        structure: typedStructure,
        quantities,
        steps,
        answer,
        templateId: `homework-${typedStructure.toLowerCase().replace('_', '-')}-v1`,
      },
      answerSpec: { kind: 'INTEGER', value: String(answer) },
      classification: 'APPLICATION',
    },
  };
}

function convertEquationChoice(input: EffectiveHomeworkObservation): HomeworkConversionResult {
  const scenario = value(input, 'scenario');
  const total = positiveInteger(value(input, 'total'));
  const groupSize = positiveInteger(value(input, 'groupSize'));
  const groups = positiveInteger(value(input, 'groups'));
  if (!total || !groupSize || !groups || total !== groupSize * groups || !['SHARING', 'GROUPING', 'FACT_FAMILY'].includes(scenario ?? '')) {
    return unsupported('equation-choice structure is invalid');
  }
  let options: Array<{ id: string; expression: string }>;
  try {
    const parsed: unknown = JSON.parse(value(input, 'options') ?? '');
    if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every((entry) => (
      entry && typeof entry === 'object'
      && typeof (entry as { id?: unknown }).id === 'string'
      && typeof (entry as { expression?: unknown }).expression === 'string'
    ))) return unsupported('equation-choice options are invalid');
    options = parsed as Array<{ id: string; expression: string }>;
  } catch {
    return unsupported('equation-choice options are invalid');
  }
  const expected = scenario === 'SHARING'
    ? `${total} ÷ ${groups} = ${groupSize}`
    : scenario === 'GROUPING'
      ? `${total} ÷ ${groupSize} = ${groups}`
      : `${groups} × ${groupSize} = ${total}`;
  const matches = options.filter((option) => option.expression.trim().replace(/\s+/gu, ' ') === expected);
  if (matches.length !== 1) return unsupported('equation-choice correct option is not uniquely derivable');
  return {
    supported: true,
    trusted: {
      problemSpec: { kind: 'EQUATION_CHOICE', scenario: scenario as 'SHARING' | 'GROUPING' | 'FACT_FAMILY', total, groupSize, groups, options, correctOptionId: matches[0]!.id },
      answerSpec: { kind: 'CHOICE', optionId: matches[0]!.id },
      classification: 'CORE',
    },
  };
}

export function convertHomeworkProblem(input: EffectiveHomeworkObservation): HomeworkConversionResult {
  switch (input.structured.family) {
    case 'ARITHMETIC': return convertArithmetic(input);
    case 'EQUATION_CHOICE': return convertEquationChoice(input);
    case 'FRACTION_EQUIVALENT': return convertFractionEquivalent(input);
    case 'FRACTION_SIMPLIFY': return convertFractionSimplify(input);
    case 'FRACTION_COMPARE': return convertFractionCompare(input);
    case 'FRACTION_OPERATION': return convertFractionOperation(input);
    case 'WORD_PROBLEM': return convertWordProblem(input);
    default: return unsupported(`unsupported homework family: ${input.structured.family}`);
  }
}
