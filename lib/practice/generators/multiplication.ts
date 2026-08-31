import { assertValidPracticeItem } from '../validation';
import type { PracticeItem } from '../types';
import type { PracticeItemGenerationInput, PracticeItemGenerator } from './registry';

const OBJECTIVES = new Set(['P2-MD-001', 'P2-MD-002', 'P2-MD-003', 'P2-MD-004', 'P2-MD-006', 'P3-MD-001']);
const P2_TABLES = [2, 3, 4, 5, 10] as const;
const P3_TABLES = [6, 7, 8, 9] as const;

function requireInput(input: PracticeItemGenerationInput): void {
  if (input.session.objectiveId !== input.context.objective.id || input.blueprint.objectiveId !== input.session.objectiveId) {
    throw new Error('practice generation objective coordinates must match');
  }
  if (input.itemIds.length < input.blueprint.slots.length || new Set(input.itemIds).size !== input.itemIds.length) {
    throw new Error('practice generation itemIds must provide unique ids for every slot');
  }
}

function parameters(sequence: number, tables: readonly number[] = P2_TABLES): { factor: number; companion: number; total: number } {
  const factor = tables[(sequence - 1) % tables.length]!;
  const companion = ((sequence * 2) % 9) + 2;
  return { factor, companion, total: factor * companion };
}

function makeArithmetic(input: PracticeItemGenerationInput, sequence: number, operation: 'MULTIPLY' | 'DIVIDE'): PracticeItem {
  const tables = input.session.objectiveId === 'P3-MD-001' ? P3_TABLES : P2_TABLES;
  const { factor, companion, total } = parameters(sequence, tables);
  const left = operation === 'MULTIPLY' ? factor : total;
  const right = operation === 'MULTIPLY' ? companion : factor;
  const answer = operation === 'MULTIPLY' ? factor * companion : total / factor;
  const item: PracticeItem = {
    id: input.itemIds[sequence - 1]!,
    sessionId: input.session.id,
    studentId: input.session.studentId,
    objectiveId: input.session.objectiveId,
    sequence,
    difficultyBand: input.blueprint.slots[sequence - 1]!,
    problemSpec: { kind: 'ARITHMETIC', operation, left, right },
    prompt: operation === 'MULTIPLY' ? `What is ${left} × ${right}?` : `What is ${left} ÷ ${right}?`,
    answerSpec: { kind: 'INTEGER', value: String(answer) },
    hint: operation === 'MULTIPLY' ? 'Think in equal groups.' : 'Use the related multiplication fact.',
    solutionOutline: [`${left} ${operation === 'MULTIPLY' ? '×' : '÷'} ${right} = ${answer}`],
    generator: 'p2-multiplication-division',
    generatorVersion: 'p2-md-v1',
    createdAt: input.session.createdAt,
  };
  assertValidPracticeItem(item);
  return item;
}

function makeEquationChoice(
  input: PracticeItemGenerationInput,
  sequence: number,
  factFamily: boolean,
): PracticeItem {
  const { factor: groups, companion: groupSize, total } = parameters(sequence);
  const scenario = factFamily ? 'FACT_FAMILY' : (sequence % 2 === 1 ? 'SHARING' : 'GROUPING');
  const correctExpression = scenario === 'SHARING'
    ? `${total} ÷ ${groups} = ${groupSize}`
    : `${total} ÷ ${groupSize} = ${groups}`;
  const options = [
    { id: 'A', expression: correctExpression },
    { id: 'B', expression: `${total} ÷ ${groups + 1} = ${groupSize}` },
    { id: 'C', expression: `${groups} × ${groupSize} = ${total + groups}` },
  ];
  const item: PracticeItem = {
    id: input.itemIds[sequence - 1]!,
    sessionId: input.session.id,
    studentId: input.session.studentId,
    objectiveId: input.session.objectiveId,
    sequence,
    difficultyBand: input.blueprint.slots[sequence - 1]!,
    problemSpec: {
      kind: 'EQUATION_CHOICE', scenario, total, groupSize, groups, options, correctOptionId: 'A',
    },
    prompt: factFamily
      ? `Which equation belongs to the fact family for ${groups}, ${groupSize}, and ${total}?`
      : `Which division equation matches ${total} objects arranged with ${groups} groups of ${groupSize}?`,
    answerSpec: { kind: 'CHOICE', optionId: 'A' },
    hint: 'Identify the total, number of groups, and size of each group.',
    solutionOutline: [correctExpression],
    generator: 'p2-multiplication-division',
    generatorVersion: 'p2-md-v1',
    createdAt: input.session.createdAt,
  };
  assertValidPracticeItem(item);
  return item;
}

export const multiplicationPracticeGenerator: PracticeItemGenerator = {
  supports(objectiveId) {
    return OBJECTIVES.has(objectiveId);
  },
  generate(input) {
    requireInput(input);
    const objectiveId = input.session.objectiveId;
    if (!OBJECTIVES.has(objectiveId)) throw new Error(`Unsupported practice objective: ${objectiveId}`);
    return input.blueprint.slots.map((_, index) => {
      const sequence = index + 1;
      if (objectiveId === 'P2-MD-002') return makeEquationChoice(input, sequence, false);
      if (objectiveId === 'P2-MD-003') return makeEquationChoice(input, sequence, true);
      if (objectiveId === 'P2-MD-004' || objectiveId === 'P2-MD-006') {
        return makeArithmetic(input, sequence, sequence % 2 === 1 ? 'MULTIPLY' : 'DIVIDE');
      }
      return makeArithmetic(input, sequence, 'MULTIPLY');
    });
  },
};
