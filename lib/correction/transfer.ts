import type { AnswerSpec, PracticeProblemSpec, WordProblemSpec, WordProblemStep } from '@/lib/practice';
import type { CorrectionItem, TrustedAttemptProblem } from './types';

const TABLES = [2, 3, 4, 5, 10] as const;

export interface TrustedTransferContext {
  mistakeId: string;
  studentId: string;
  objectiveId: string;
  sourceAttemptId: string;
  original: TrustedAttemptProblem;
  round: number;
  itemId: string;
  now: string;
}

export class UnsupportedCorrectionTransferError extends Error {
  constructor(message = 'correction transfer is unsupported for this problem structure') {
    super(message);
    this.name = 'UnsupportedCorrectionTransferError';
  }
}

interface TransferContent {
  problemSpec: PracticeProblemSpec;
  answerSpec: AnswerSpec;
  prompt: string;
  solutionOutline: string[];
}

function gcd(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) [a, b] = [b, a % b];
  return a || 1;
}

function simplify(numerator: number, denominator: number): { numerator: number; denominator: number } {
  const divisor = gcd(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

function arithmetic(original: Extract<PracticeProblemSpec, { kind: 'ARITHMETIC' }>, round: number): TransferContent {
  const factor = TABLES[(round - 1) % TABLES.length]!;
  const companion = 2 + ((Math.abs(original.left + original.right) + round * 2) % 8);
  if (original.operation === 'MULTIPLY') {
    const answer = factor * companion;
    return {
      problemSpec: { kind: 'ARITHMETIC', operation: 'MULTIPLY', left: factor, right: companion },
      answerSpec: { kind: 'INTEGER', value: String(answer) },
      prompt: `What is ${factor} × ${companion}?`,
      solutionOutline: [`${factor} × ${companion} = ${answer}`],
    };
  }
  const total = factor * companion;
  return {
    problemSpec: { kind: 'ARITHMETIC', operation: 'DIVIDE', left: total, right: factor },
    answerSpec: { kind: 'INTEGER', value: String(companion) },
    prompt: `What is ${total} ÷ ${factor}?`,
    solutionOutline: [`${total} ÷ ${factor} = ${companion}`],
  };
}

function equationChoice(
  original: Extract<PracticeProblemSpec, { kind: 'EQUATION_CHOICE' }>,
  round: number,
): TransferContent {
  const groups = TABLES[(round - 1) % TABLES.length]!;
  const groupSize = 2 + ((round * 3) % 7);
  const total = groups * groupSize;
  const correctExpression = original.scenario === 'SHARING'
    ? `${total} ÷ ${groups} = ${groupSize}`
    : `${total} ÷ ${groupSize} = ${groups}`;
  const options = [
    { id: 'A', expression: correctExpression },
    { id: 'B', expression: `${total} ÷ ${groups + 1} = ${groupSize}` },
    { id: 'C', expression: `${groups} × ${groupSize} = ${total + groups}` },
  ];
  return {
    problemSpec: {
      kind: 'EQUATION_CHOICE', scenario: original.scenario,
      total, groupSize, groups, options, correctOptionId: 'A',
    },
    answerSpec: { kind: 'CHOICE', optionId: 'A' },
    prompt: original.scenario === 'FACT_FAMILY'
      ? `Which equation belongs to the fact family for ${groups}, ${groupSize}, and ${total}?`
      : `Which division equation matches ${total} objects with ${groups} groups of ${groupSize}?`,
    solutionOutline: [correctExpression],
  };
}

function fractionCompare(
  original: Extract<PracticeProblemSpec, { kind: 'FRACTION_COMPARE' }>,
  round: number,
): TransferContent {
  const leftDenominator = 3 + ((original.leftDenominator + round - 1) % 6);
  const rightDenominator = 7 + ((original.rightDenominator + round - 1) % 5);
  const leftNumerator = 1 + ((original.leftNumerator + round) % (leftDenominator - 1));
  const rightNumerator = 1 + ((original.rightNumerator + round * 2) % (rightDenominator - 1));
  const leftCross = leftNumerator * rightDenominator;
  const rightCross = rightNumerator * leftDenominator;
  const symbol = leftCross < rightCross ? '<' : leftCross > rightCross ? '>' : '=';
  return {
    problemSpec: {
      kind: 'FRACTION_COMPARE', leftNumerator, leftDenominator, rightNumerator, rightDenominator,
    },
    answerSpec: { kind: 'EXACT_TEXT', acceptedValues: [symbol], caseSensitive: false },
    prompt: `Fill in <, >, or = : ${leftNumerator}/${leftDenominator} ? ${rightNumerator}/${rightDenominator}`,
    solutionOutline: [`Compare ${leftCross} and ${rightCross} by cross multiplication.`],
  };
}

function fractionEquivalent(
  original: Extract<PracticeProblemSpec, { kind: 'FRACTION_EQUIVALENT' }>,
  round: number,
): TransferContent {
  const numerator = 1 + ((original.numerator + round) % 3);
  const denominator = numerator + 2 + ((original.denominator + round) % 3);
  const scaleFactor = 2 + ((original.scaleFactor + round) % 3);
  const value = original.missing === 'NUMERATOR' ? numerator * scaleFactor : denominator * scaleFactor;
  const prompt = original.missing === 'NUMERATOR'
    ? `${numerator}/${denominator} = ?/${denominator * scaleFactor}. What is the missing numerator?`
    : `${numerator}/${denominator} = ${numerator * scaleFactor}/?. What is the missing denominator?`;
  return {
    problemSpec: { kind: 'FRACTION_EQUIVALENT', numerator, denominator, scaleFactor, missing: original.missing },
    answerSpec: { kind: 'INTEGER', value: String(value) },
    prompt,
    solutionOutline: [`Apply scale factor ${scaleFactor} to numerator and denominator.`],
  };
}

function fractionSimplify(round: number): TransferContent {
  const simplePairs = [[1, 3], [2, 5], [3, 7], [4, 9]] as const;
  const [simpleNumerator, simpleDenominator] = simplePairs[round % simplePairs.length]!;
  const factor = 2 + (round % 3);
  const numerator = simpleNumerator * factor;
  const denominator = simpleDenominator * factor;
  return {
    problemSpec: { kind: 'FRACTION_SIMPLIFY', numerator, denominator },
    answerSpec: {
      kind: 'FRACTION', numerator: simpleNumerator, denominator: simpleDenominator, equivalence: 'EXACT_SIMPLEST',
    },
    prompt: `Write ${numerator}/${denominator} in simplest form.`,
    solutionOutline: [`Divide numerator and denominator by ${factor}.`],
  };
}

function fractionOperation(
  operation: 'ADD' | 'SUBTRACT',
  round: number,
): TransferContent {
  const addPatterns = [
    [1, 4, 1, 2], [1, 3, 1, 6], [2, 5, 1, 5],
  ] as const;
  const subtractPatterns = [
    [3, 4, 1, 4], [5, 6, 1, 3], [4, 5, 1, 5],
  ] as const;
  const patterns = operation === 'ADD' ? addPatterns : subtractPatterns;
  const [leftNumerator, leftDenominator, rightNumerator, rightDenominator] = patterns[round % patterns.length]!;
  const rawNumerator = operation === 'ADD'
    ? leftNumerator * rightDenominator + rightNumerator * leftDenominator
    : leftNumerator * rightDenominator - rightNumerator * leftDenominator;
  const rawDenominator = leftDenominator * rightDenominator;
  const result = simplify(rawNumerator, rawDenominator);
  return {
    problemSpec: {
      kind: 'FRACTION_OPERATION', operation,
      leftNumerator, leftDenominator, rightNumerator, rightDenominator,
    },
    answerSpec: {
      kind: 'FRACTION', numerator: result.numerator, denominator: result.denominator, equivalence: 'VALUE',
    },
    prompt: `What is ${leftNumerator}/${leftDenominator} ${operation === 'ADD' ? '+' : '−'} ${rightNumerator}/${rightDenominator}?`,
    solutionOutline: ['Express the fractions with compatible parts, then calculate.'],
  };
}

function wordProblem(original: WordProblemSpec, round: number): TransferContent {
  let spec: WordProblemSpec;
  let prompt: string;
  if (original.templateId === 'p2-md-equal-groups-v1') {
    const groups = 2 + (round % 4);
    const size = 2 + ((round * 2) % 5);
    const total = groups * size;
    spec = {
      kind: 'WORD_PROBLEM', structure: original.structure,
      quantities: { groups, size },
      steps: [{ operation: 'MULTIPLY', operands: [groups, size], result: total }],
      answer: total, templateId: original.templateId,
    };
    prompt = `There are ${groups} baskets with ${size} oranges in each basket. How many oranges are there altogether?`;
  } else if (original.templateId === 'p2-md-sharing-v1') {
    const groups = 2 + (round % 4);
    const size = 2 + ((round * 2) % 5);
    const total = groups * size;
    spec = {
      kind: 'WORD_PROBLEM', structure: original.structure,
      quantities: { total, groups },
      steps: [{ operation: 'DIVIDE', operands: [total, groups], result: size }],
      answer: size, templateId: original.templateId,
    };
    prompt = `${total} stickers are shared equally among ${groups} children. How many stickers does each child get?`;
  } else if (original.templateId === 'p3-md-two-step-v1') {
    const groups = 3 + (round % 4);
    const size = 4 + (round % 5);
    const extra = 2 + round;
    const subtotal = groups * size;
    const answer = subtotal + extra;
    spec = {
      kind: 'WORD_PROBLEM', structure: original.structure,
      quantities: { groups, size, extra },
      steps: [
        { operation: 'MULTIPLY', operands: [groups, size], result: subtotal },
        { operation: 'ADD', operands: [subtotal, extra], result: answer },
      ],
      answer, templateId: original.templateId,
    };
    prompt = `A shop packs ${groups} boxes with ${size} pencils each, then adds ${extra} loose pencils. How many pencils are there altogether?`;
  } else if (original.templateId === 'p2-as-two-step-v1' || original.templateId === 'p3-as-two-step-v1') {
    const start = (original.templateId === 'p3-as-two-step-v1' ? 120 : 40) + round * 4;
    const added = 10 + round;
    const removed = 4 + round;
    const afterAdd = start + added;
    const answer = afterAdd - removed;
    spec = {
      kind: 'WORD_PROBLEM', structure: original.structure,
      quantities: { start, added, removed },
      steps: [
        { operation: 'ADD', operands: [start, added], result: afterAdd },
        { operation: 'SUBTRACT', operands: [afterAdd, removed], result: answer },
      ],
      answer, templateId: original.templateId,
    };
    prompt = `Alex has ${start} cards, gets ${added} more, then gives away ${removed}. How many cards remain?`;
  } else {
    throw new UnsupportedCorrectionTransferError(`unsupported word-problem transfer template: ${original.templateId}`);
  }
  return {
    problemSpec: spec,
    answerSpec: { kind: 'INTEGER', value: String(spec.answer) },
    prompt,
    solutionOutline: spec.steps.map((step: WordProblemStep) => `${step.operands.join(` ${step.operation} `)} = ${step.result}`),
  };
}

function contentFor(original: PracticeProblemSpec, round: number): TransferContent {
  switch (original.kind) {
    case 'ARITHMETIC': return arithmetic(original, round);
    case 'EQUATION_CHOICE': return equationChoice(original, round);
    case 'FRACTION_COMPARE': return fractionCompare(original, round);
    case 'FRACTION_EQUIVALENT': return fractionEquivalent(original, round);
    case 'FRACTION_SIMPLIFY': return fractionSimplify(round);
    case 'FRACTION_OPERATION': return fractionOperation(original.operation, round);
    case 'WORD_PROBLEM': return wordProblem(original, round);
  }
}

export function generateCorrectionTransfer(context: TrustedTransferContext): CorrectionItem {
  if (!Number.isInteger(context.round) || context.round <= 0) {
    throw new Error('transfer round must be a positive integer');
  }
  if (
    context.original.attempt.studentId !== context.studentId
    || context.original.attempt.objectiveId !== context.objectiveId
    || context.original.attempt.id !== context.sourceAttemptId
  ) {
    throw new Error('transfer context coordinates must match trusted original attempt');
  }
  const content = contentFor(context.original.problemSpec, context.round);
  return {
    id: context.itemId,
    mistakeId: context.mistakeId,
    studentId: context.studentId,
    objectiveId: context.objectiveId,
    kind: 'TRANSFER',
    sourceAttemptId: context.sourceAttemptId,
    transferRound: context.round,
    problemSpec: content.problemSpec,
    answerSpec: content.answerSpec,
    prompt: content.prompt,
    hint: 'Use the same relationship you just explained. Work independently before asking for help.',
    solutionOutline: content.solutionOutline,
    generator: 'correction-transfer',
    generatorVersion: 'correction-transfer-v1',
    createdAt: context.now,
  };
}
