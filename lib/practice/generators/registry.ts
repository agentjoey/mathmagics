import type { PracticePreparationContext } from '../preparation';
import type { PracticeBlueprint, PracticeItem, PracticeSession } from '../types';
import { fractionPracticeGenerator } from './fractions';
import { multiplicationPracticeGenerator } from './multiplication';
import { wordProblemPracticeGenerator } from './word-problems';

export interface PracticeItemGenerationInput {
  session: PracticeSession;
  context: PracticePreparationContext;
  blueprint: PracticeBlueprint;
  itemIds: string[];
}

export interface PracticeItemGenerator {
  supports(objectiveId: string): boolean;
  generate(input: PracticeItemGenerationInput): PracticeItem[];
}

const GENERATORS: PracticeItemGenerator[] = [
  multiplicationPracticeGenerator,
  fractionPracticeGenerator,
  wordProblemPracticeGenerator,
];

export function getPracticeItemGenerator(objectiveId: string): PracticeItemGenerator {
  const generator = GENERATORS.find((candidate) => candidate.supports(objectiveId));
  if (!generator) throw new Error(`Unsupported practice objective: ${objectiveId}`);
  return generator;
}
