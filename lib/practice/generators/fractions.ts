import { assertValidPracticeItem } from '../validation';
import type { AnswerSpec, PracticeItem, PracticeProblemSpec } from '../types';
import type { PracticeItemGenerationInput, PracticeItemGenerator } from './registry';

const OBJECTIVES = new Set(['P3-FRA-001', 'P3-FRA-002', 'P3-FRA-003', 'P3-FRA-004', 'P3-FRA-005']);

function gcd(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

function requireInput(input: PracticeItemGenerationInput): void {
  if (input.session.objectiveId !== input.context.objective.id || input.blueprint.objectiveId !== input.session.objectiveId) {
    throw new Error('practice generation objective coordinates must match');
  }
  if (input.itemIds.length < input.blueprint.slots.length || new Set(input.itemIds).size !== input.itemIds.length) {
    throw new Error('practice generation itemIds must provide unique ids for every slot');
  }
}

function fractionContent(objectiveId: string, sequence: number): {
  problemSpec: PracticeProblemSpec;
  answerSpec: AnswerSpec;
  prompt: string;
  solution: string;
} {
  const factor = 2 + ((sequence - 1) % 3);
  if (objectiveId === 'P3-FRA-001' || objectiveId === 'P3-FRA-004') {
    const numerator = 1 + ((sequence - 1) % 3);
    const denominator = numerator + 2 + (sequence % 2);
    const missing = sequence % 2 === 1 ? 'NUMERATOR' as const : 'DENOMINATOR' as const;
    const targetNumerator = numerator * factor;
    const targetDenominator = denominator * factor;
    const value = missing === 'NUMERATOR' ? targetNumerator : targetDenominator;
    return {
      problemSpec: { kind: 'FRACTION_EQUIVALENT', numerator, denominator, scaleFactor: factor, missing },
      answerSpec: { kind: 'INTEGER', value: String(value) },
      prompt: missing === 'NUMERATOR'
        ? `${numerator}/${denominator} = ?/${targetDenominator}. What is the missing numerator?`
        : `${numerator}/${denominator} = ${targetNumerator}/?. What is the missing denominator?`,
      solution: `Multiply numerator and denominator by ${factor}.`,
    };
  }

  if (objectiveId === 'P3-FRA-002') {
    const simpleNumerator = 1 + ((sequence - 1) % 3);
    const simpleDenominator = simpleNumerator + 2;
    const numerator = simpleNumerator * factor;
    const denominator = simpleDenominator * factor;
    return {
      problemSpec: { kind: 'FRACTION_SIMPLIFY', numerator, denominator },
      answerSpec: { kind: 'FRACTION', numerator: simpleNumerator, denominator: simpleDenominator, equivalence: 'EXACT_SIMPLEST' },
      prompt: `Write ${numerator}/${denominator} in simplest form.`,
      solution: `Divide numerator and denominator by ${factor}.`,
    };
  }

  if (objectiveId === 'P3-FRA-003') {
    const leftDenominator = 3 + ((sequence - 1) % 5);
    const rightDenominator = 5 + ((sequence - 1) % 5);
    const leftNumerator = 1 + ((sequence - 1) % Math.max(1, leftDenominator - 1));
    const rightNumerator = 1 + (sequence % Math.max(1, rightDenominator - 1));
    const leftCross = leftNumerator * rightDenominator;
    const rightCross = rightNumerator * leftDenominator;
    const symbol = leftCross < rightCross ? '<' : leftCross > rightCross ? '>' : '=';
    return {
      problemSpec: { kind: 'FRACTION_COMPARE', leftNumerator, leftDenominator, rightNumerator, rightDenominator },
      answerSpec: { kind: 'EXACT_TEXT', acceptedValues: [symbol], caseSensitive: false },
      prompt: `Fill in <, >, or = : ${leftNumerator}/${leftDenominator} ? ${rightNumerator}/${rightDenominator}`,
      solution: `Compare ${leftCross} and ${rightCross} by cross multiplication.`,
    };
  }

  const add = sequence % 2 === 1;
  const leftNumerator = add ? 1 : 3;
  const leftDenominator = 4;
  const rightNumerator = 1;
  const rightDenominator = 2;
  const resultNumerator = add ? 3 : 1;
  const resultDenominator = 4;
  const divisor = gcd(resultNumerator, resultDenominator);
  return {
    problemSpec: {
      kind: 'FRACTION_OPERATION',
      operation: add ? 'ADD' : 'SUBTRACT',
      leftNumerator, leftDenominator, rightNumerator, rightDenominator,
    },
    answerSpec: {
      kind: 'FRACTION',
      numerator: resultNumerator / divisor,
      denominator: resultDenominator / divisor,
      equivalence: 'VALUE',
    },
    prompt: `What is ${leftNumerator}/${leftDenominator} ${add ? '+' : '−'} ${rightNumerator}/${rightDenominator}?`,
    solution: 'Express the related fractions with compatible parts, then calculate.',
  };
}

export const fractionPracticeGenerator: PracticeItemGenerator = {
  supports(objectiveId) {
    return OBJECTIVES.has(objectiveId);
  },
  generate(input) {
    requireInput(input);
    const objectiveId = input.session.objectiveId;
    if (!OBJECTIVES.has(objectiveId)) throw new Error(`Unsupported practice objective: ${objectiveId}`);
    return input.blueprint.slots.map((difficultyBand, index) => {
      const sequence = index + 1;
      const content = fractionContent(objectiveId, sequence);
      const item: PracticeItem = {
        id: input.itemIds[index]!,
        sessionId: input.session.id,
        studentId: input.session.studentId,
        objectiveId,
        sequence,
        difficultyBand,
        problemSpec: content.problemSpec,
        prompt: content.prompt,
        answerSpec: content.answerSpec,
        hint: 'Use a fraction strip or equivalent fractions if helpful.',
        solutionOutline: [content.solution],
        generator: 'p3-fractions',
        generatorVersion: 'p3-fractions-v1',
        createdAt: input.session.createdAt,
      };
      assertValidPracticeItem(item);
      return item;
    });
  },
};
