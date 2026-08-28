import { assertValidPracticeItem } from '../validation';
import type { PracticeItem } from '../types';
import type { PracticeItemGenerationInput, PracticeItemGenerator } from './registry';

const OBJECTIVES = new Set(['P2-WN-005', 'P3-WN-005']);
const P2_STEPS = [2, 5, 10, 25] as const;
const P3_STEPS = [25, 50, 100, 125] as const;

function requireInput(input: PracticeItemGenerationInput): void {
  if (input.session.objectiveId !== input.context.objective.id || input.blueprint.objectiveId !== input.session.objectiveId) {
    throw new Error('practice generation objective coordinates must match');
  }
  if (input.itemIds.length < input.blueprint.slots.length || new Set(input.itemIds).size !== input.itemIds.length) {
    throw new Error('practice generation itemIds must provide unique ids for every slot');
  }
}

function sequenceFor(objectiveId: string, sequence: number): { terms: number[]; step: number; nextValue: number } {
  const p2 = objectiveId.startsWith('P2-');
  const steps = p2 ? P2_STEPS : P3_STEPS;
  const step = steps[(sequence - 1) % steps.length]!;
  const start = p2 ? 10 + sequence * 7 : 100 + sequence * 37;
  const terms = Array.from({ length: 4 }, (_, index) => start + index * step);
  return { terms, step, nextValue: terms.at(-1)! + step };
}

export const numberSequencePracticeGenerator: PracticeItemGenerator = {
  supports(objectiveId) {
    return OBJECTIVES.has(objectiveId);
  },
  generate(input) {
    requireInput(input);
    const objectiveId = input.session.objectiveId;
    if (!OBJECTIVES.has(objectiveId)) throw new Error(`Unsupported practice objective: ${objectiveId}`);
    return input.blueprint.slots.map((difficultyBand, index) => {
      const sequence = index + 1;
      const content = sequenceFor(objectiveId, sequence);
      const item: PracticeItem = {
        id: input.itemIds[index]!,
        sessionId: input.session.id,
        studentId: input.session.studentId,
        objectiveId,
        sequence,
        difficultyBand,
        problemSpec: { kind: 'NUMBER_SEQUENCE', ...content },
        prompt: `Continue the pattern: ${content.terms.join(', ')}, ?`,
        answerSpec: { kind: 'INTEGER', value: String(content.nextValue) },
        hint: 'Look at how much the number changes each time.',
        solutionOutline: [`Each term increases by ${content.step}; the next value is ${content.nextValue}.`],
        generator: 'number-sequence-patterns',
        generatorVersion: 'number-sequence-v1',
        createdAt: input.session.createdAt,
      };
      assertValidPracticeItem(item);
      return item;
    });
  },
};
