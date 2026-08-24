import { loadCurriculumDataset } from './loader';
import type {
  CurriculumDataset,
  LearningObjective,
  Misconception,
  ProblemSolvingStrategy,
  Representation,
  TextbookReference,
} from './types';

let defaultDataset: CurriculumDataset | undefined;

function datasetOrDefault(dataset?: CurriculumDataset): CurriculumDataset {
  if (dataset) return dataset;
  defaultDataset ??= loadCurriculumDataset();
  return defaultDataset;
}

export function getLearningObjective(id: string, dataset?: CurriculumDataset): LearningObjective {
  const resolved = datasetOrDefault(dataset);
  const objective = resolved.objectives.find((item) => item.id === id);
  if (!objective) throw new Error(`Unknown learning objective id: ${id}`);
  return objective;
}

export function listObjectivesForTopic(topicId: string, dataset?: CurriculumDataset): LearningObjective[] {
  const resolved = datasetOrDefault(dataset);
  const topic = resolved.nodes.find((node) => node.id === topicId && node.type === 'topic');
  if (!topic) throw new Error(`Unknown curriculum topic id: ${topicId}`);
  return resolved.objectives
    .filter((objective) => objective.topicId === topicId)
    .slice()
    .sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id));
}

export function getPrerequisites(objectiveId: string, dataset?: CurriculumDataset): LearningObjective[] {
  const resolved = datasetOrDefault(dataset);
  const objective = getLearningObjective(objectiveId, resolved);
  return objective.prerequisiteIds.map((id) => getLearningObjective(id, resolved));
}

export function getRepresentations(objectiveId: string, dataset?: CurriculumDataset): Representation[] {
  const resolved = datasetOrDefault(dataset);
  const objective = getLearningObjective(objectiveId, resolved);
  return objective.representationIds.map((id) => {
    const representation = resolved.representations.find((item) => item.id === id);
    if (!representation) throw new Error(`Objective ${objectiveId} references unknown representation: ${id}`);
    return representation;
  });
}

export function getStrategies(objectiveId: string, dataset?: CurriculumDataset): ProblemSolvingStrategy[] {
  const resolved = datasetOrDefault(dataset);
  const objective = getLearningObjective(objectiveId, resolved);
  return objective.strategyIds.map((id) => {
    const strategy = resolved.strategies.find((item) => item.id === id);
    if (!strategy) throw new Error(`Objective ${objectiveId} references unknown strategy: ${id}`);
    return strategy;
  });
}

export function getMisconceptions(objectiveId: string, dataset?: CurriculumDataset): Misconception[] {
  const resolved = datasetOrDefault(dataset);
  const objective = getLearningObjective(objectiveId, resolved);
  return objective.misconceptionIds.map((id) => {
    const misconception = resolved.misconceptions.find((item) => item.id === id);
    if (!misconception) throw new Error(`Objective ${objectiveId} references unknown misconception: ${id}`);
    return misconception;
  });
}

export function getTextbookReferences(objectiveId: string, dataset?: CurriculumDataset): TextbookReference[] {
  const resolved = datasetOrDefault(dataset);
  getLearningObjective(objectiveId, resolved);
  return resolved.textbookReferences.filter((reference) => reference.objectiveIds.includes(objectiveId));
}
