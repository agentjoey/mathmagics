import { assertValidPracticeItem } from '../validation';
import type { PracticeItem, WordProblemSpec, WordProblemStep } from '../types';
import type { PracticeItemGenerationInput, PracticeItemGenerator } from './registry';

const OBJECTIVES = new Set(['P2-AS-002', 'P2-MD-005', 'P3-AS-002', 'P3-MD-005']);

function requireInput(input: PracticeItemGenerationInput): void {
  if (input.session.objectiveId !== input.context.objective.id || input.blueprint.objectiveId !== input.session.objectiveId) {
    throw new Error('practice generation objective coordinates must match');
  }
  if (input.itemIds.length < input.blueprint.slots.length || new Set(input.itemIds).size !== input.itemIds.length) {
    throw new Error('practice generation itemIds must provide unique ids for every slot');
  }
}

function makeSpec(objectiveId: string, sequence: number): { spec: WordProblemSpec; prompt: string } {
  if (objectiveId === 'P2-MD-005') {
    const groups = 2 + (sequence % 4);
    const size = 2 + ((sequence * 2) % 5);
    const total = groups * size;
    if (sequence % 2 === 1) {
      return {
        spec: {
          kind: 'WORD_PROBLEM', structure: 'EQUAL_GROUPS',
          quantities: { groups, size },
          steps: [{ operation: 'MULTIPLY', operands: [groups, size], result: total }],
          answer: total, templateId: 'p2-md-equal-groups-v1',
        },
        prompt: `There are ${groups} baskets with ${size} oranges in each basket. How many oranges are there altogether?`,
      };
    }
    return {
      spec: {
        kind: 'WORD_PROBLEM', structure: 'SHARING',
        quantities: { total, groups },
        steps: [{ operation: 'DIVIDE', operands: [total, groups], result: size }],
        answer: size, templateId: 'p2-md-sharing-v1',
      },
      prompt: `${total} stickers are shared equally among ${groups} children. How many stickers does each child get?`,
    };
  }

  if (objectiveId === 'P3-MD-005') {
    const groups = 3 + (sequence % 4);
    const size = 4 + (sequence % 5);
    const extra = 2 + sequence;
    const subtotal = groups * size;
    const answer = subtotal + extra;
    const steps: WordProblemStep[] = [
      { operation: 'MULTIPLY', operands: [groups, size], result: subtotal },
      { operation: 'ADD', operands: [subtotal, extra], result: answer },
    ];
    return {
      spec: {
        kind: 'WORD_PROBLEM', structure: 'EQUAL_GROUPS',
        quantities: { groups, size, extra }, steps, answer,
        templateId: 'p3-md-two-step-v1',
      },
      prompt: `A shop packs ${groups} boxes with ${size} pencils each, then adds ${extra} loose pencils. How many pencils are there altogether?`,
    };
  }

  const start = (objectiveId === 'P3-AS-002' ? 120 : 40) + sequence * 3;
  const added = 10 + sequence;
  const removed = 4 + sequence;
  const afterAdd = start + added;
  const answer = afterAdd - removed;
  return {
    spec: {
      kind: 'WORD_PROBLEM',
      structure: sequence % 2 === 1 ? 'PART_WHOLE' : 'COMPARISON',
      quantities: { start, added, removed },
      steps: [
        { operation: 'ADD', operands: [start, added], result: afterAdd },
        { operation: 'SUBTRACT', operands: [afterAdd, removed], result: answer },
      ],
      answer,
      templateId: objectiveId === 'P3-AS-002' ? 'p3-as-two-step-v1' : 'p2-as-two-step-v1',
    },
    prompt: `Alex has ${start} cards, gets ${added} more, then gives away ${removed}. How many cards remain?`,
  };
}

export const wordProblemPracticeGenerator: PracticeItemGenerator = {
  supports(objectiveId) {
    return OBJECTIVES.has(objectiveId);
  },
  generate(input) {
    requireInput(input);
    const objectiveId = input.session.objectiveId;
    if (!OBJECTIVES.has(objectiveId)) throw new Error(`Unsupported practice objective: ${objectiveId}`);
    return input.blueprint.slots.map((difficultyBand, index) => {
      const sequence = index + 1;
      const { spec, prompt } = makeSpec(objectiveId, sequence);
      const item: PracticeItem = {
        id: input.itemIds[index]!,
        sessionId: input.session.id,
        studentId: input.session.studentId,
        objectiveId,
        sequence,
        difficultyBand,
        problemSpec: spec,
        prompt,
        answerSpec: { kind: 'INTEGER', value: String(spec.answer) },
        hint: 'Represent the known and unknown quantities before calculating.',
        solutionOutline: spec.steps.map((step) => `${step.operands.join(` ${step.operation} `)} = ${step.result}`),
        generator: 'word-problems',
        generatorVersion: 'word-problems-v1',
        createdAt: input.session.createdAt,
      };
      assertValidPracticeItem(item);
      return item;
    });
  },
};
