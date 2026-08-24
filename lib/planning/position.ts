import { getLearningObjective, loadCurriculumDataset } from '@/lib/curriculum';
import { assertValidCurrentPosition, deriveMastery } from '@/lib/learning';
import type { LearningStateRepository } from '@/lib/learning';
import type { LearningPosition } from './types';
import { listLevelObjectivesInCurriculumOrder } from './curriculum-order';

function requireValidTimestamp(value: string): void {
  if (!value || Number.isNaN(Date.parse(value))) throw new Error('derivedAt must be a valid ISO date-time string');
}

export async function deriveLearningPosition(
  repository: LearningStateRepository,
  studentId: string,
  now: string,
): Promise<LearningPosition> {
  requireValidTimestamp(now);
  const student = await repository.getStudent(studentId);
  if (!student) throw new Error(`Unknown student id: ${studentId}`);

  const dataset = loadCurriculumDataset();
  const orderedObjectives = listLevelObjectivesInCurriculumOrder(student.levelId, dataset);
  if (orderedObjectives.length === 0) throw new Error(`No curriculum objectives for level ${student.levelId}`);

  const currentPosition = await repository.getCurrentPosition(studentId);
  let anchorObjective = orderedObjectives[0]!;
  let anchorTopicId = anchorObjective.topicId;

  if (currentPosition) {
    assertValidCurrentPosition(student, currentPosition, dataset);
    if (currentPosition.objectiveId) {
      anchorObjective = getLearningObjective(currentPosition.objectiveId, dataset);
      anchorTopicId = currentPosition.topicId ?? anchorObjective.topicId;
    } else if (currentPosition.topicId) {
      const topicObjectives = orderedObjectives.filter(
        (objective) => objective.topicId === currentPosition.topicId,
      );
      if (topicObjectives.length === 0) {
        throw new Error(`Current position topic ${currentPosition.topicId} has no objectives`);
      }
      anchorObjective = topicObjectives[0]!;
      anchorTopicId = currentPosition.topicId;
    }
  }

  const reviewObjectiveIds: string[] = [];
  for (const objective of orderedObjectives) {
    const evidence = await repository.listEvidenceForObjective(studentId, objective.id);
    const mastery = deriveMastery(studentId, objective.id, evidence);
    if (mastery.state === 'MASTERED' && mastery.reviewDue) reviewObjectiveIds.push(objective.id);
  }

  return {
    studentId,
    levelId: student.levelId,
    anchorTopicId,
    anchorObjectiveId: anchorObjective.id,
    reviewObjectiveIds,
    derivedAt: now,
  };
}
