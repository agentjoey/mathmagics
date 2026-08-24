import { loadCurriculumDataset } from '@/lib/curriculum';
import type { CurriculumDataset, CurriculumNode, LearningObjective } from '@/lib/curriculum';
import type { StudentLevel } from '@/lib/learning';

function bySequenceThenId<T extends { sequence: number; id: string }>(left: T, right: T): number {
  return left.sequence - right.sequence || left.id.localeCompare(right.id);
}

function childrenOf(
  dataset: CurriculumDataset,
  parentId: string,
  type: CurriculumNode['type'],
): CurriculumNode[] {
  return dataset.nodes
    .filter((node) => node.parentId === parentId && node.type === type)
    .sort(bySequenceThenId);
}

export function listLevelObjectivesInCurriculumOrder(
  levelId: StudentLevel,
  dataset: CurriculumDataset = loadCurriculumDataset(),
): LearningObjective[] {
  const level = dataset.nodes.find((node) => node.id === levelId && node.type === 'level');
  if (!level) throw new Error(`Unknown curriculum level id: ${levelId}`);

  const ordered: LearningObjective[] = [];
  const topicIds = new Set<string>();
  const strands = childrenOf(dataset, level.id, 'strand');

  for (const strand of strands) {
    const topics = childrenOf(dataset, strand.id, 'topic');
    for (const topic of topics) {
      topicIds.add(topic.id);
      const objectives = dataset.objectives
        .filter((objective) => objective.levelId === levelId && objective.topicId === topic.id)
        .sort(bySequenceThenId);
      ordered.push(...objectives);
    }
  }

  const expected = dataset.objectives.filter((objective) => objective.levelId === levelId);
  const missing = expected.filter((objective) => !topicIds.has(objective.topicId));
  if (missing.length > 0) {
    throw new Error(`Curriculum objective ${missing[0]!.id} is not attached to an ordered topic for ${levelId}`);
  }
  if (ordered.length !== expected.length) {
    throw new Error(`Curriculum order for ${levelId} is incomplete`);
  }

  return ordered;
}
