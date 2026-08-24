import fs from 'node:fs';
import path from 'node:path';
import type {
  Curriculum,
  CurriculumDataset,
  CurriculumNode,
  CurriculumSource,
  LearningObjective,
  Misconception,
  ProblemSolvingStrategy,
  Representation,
  TextbookReference,
} from './types';
import { assertValidCurriculumDataset } from './validate';

const DEFAULT_ROOT = path.join(process.cwd(), 'content', 'curriculum', 'singapore-primary-math');

function readJson<T>(rootDir: string, relativePath: string): T {
  const filePath = path.join(rootDir, relativePath);
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

export function loadCurriculumDataset(rootDir: string = DEFAULT_ROOT): CurriculumDataset {
  const dataset: CurriculumDataset = {
    sources: readJson<CurriculumSource[]>(rootDir, 'sources.json'),
    curriculum: readJson<Curriculum>(rootDir, 'curriculum.json'),
    nodes: [
      ...readJson<CurriculumNode[]>(rootDir, 'p2/nodes.json'),
      ...readJson<CurriculumNode[]>(rootDir, 'p3/nodes.json'),
    ],
    objectives: [
      ...readJson<LearningObjective[]>(rootDir, 'p2/objectives.json'),
      ...readJson<LearningObjective[]>(rootDir, 'p3/objectives.json'),
    ],
    representations: readJson<Representation[]>(rootDir, 'representations.json'),
    strategies: readJson<ProblemSolvingStrategy[]>(rootDir, 'strategies.json'),
    misconceptions: readJson<Misconception[]>(rootDir, 'misconceptions.json'),
    textbookReferences: [
      ...readJson<TextbookReference[]>(rootDir, 'textbook-mappings/primary-mathematics-2022-p2.json'),
      ...readJson<TextbookReference[]>(rootDir, 'textbook-mappings/primary-mathematics-2022-p3.json'),
    ],
  };

  assertValidCurriculumDataset(dataset);
  return dataset;
}
