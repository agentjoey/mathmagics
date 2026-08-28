import { getLearningObjective } from '@/lib/curriculum';
import {
  getObjectiveMastery,
  getObjectiveReadiness,
} from '@/lib/learning';
import type { LearningStateRepository, MasteryState } from '@/lib/learning';
import { listLevelObjectivesInCurriculumOrder } from './curriculum-order';
import type { LearningCandidate, LearningPosition, PlannerCandidateReason } from './types';

const REASON_RANK: Record<PlannerCandidateReason, number> = {
  REVIEW_DUE: 0,
  PREREQUISITE_SUPPORT: 1,
  CURRENT_POSITION: 2,
  NEXT_IN_SEQUENCE: 3,
};

const MASTERY_RANK: Record<MasteryState, number> = {
  NOT_STARTED: 0,
  INTRODUCED: 1,
  DEVELOPING: 2,
  MASTERED: 3,
};

export async function listLearningCandidates(
  repository: LearningStateRepository,
  position: LearningPosition,
): Promise<LearningCandidate[]> {
  const student = await repository.getStudent(position.studentId);
  if (!student) throw new Error(`Unknown student id: ${position.studentId}`);
  if (student.levelId !== position.levelId) {
    throw new Error('LearningPosition levelId must match student active level');
  }

  const studentId = student.id;
  const studentLevelId = student.levelId;
  const activeObjectives = listLevelObjectivesInCurriculumOrder(studentLevelId);
  const activeIndex = new Map(activeObjectives.map((objective, index) => [objective.id, index]));
  const allOrdered = studentLevelId === 'P3'
    ? [...listLevelObjectivesInCurriculumOrder('P2'), ...activeObjectives]
    : activeObjectives;
  const globalIndex = new Map(allOrdered.map((objective, index) => [objective.id, index]));

  const candidates: LearningCandidate[] = [];
  const seen = new Set<string>();
  const prerequisiteExpansion = new Set<string>();

  async function addCandidate(
    objectiveId: string,
    reason: PlannerCandidateReason,
    targetObjectiveId?: string,
  ): Promise<void> {
    const key = `${reason}:${objectiveId}:${targetObjectiveId ?? ''}`;
    if (seen.has(key)) return;
    const objective = getLearningObjective(objectiveId);
    if (studentLevelId === 'P2' && objective.levelId === 'P3') {
      throw new Error('P2 planner cannot target P3 objective');
    }
    const mastery = await getObjectiveMastery(repository, studentId, objectiveId);
    const readiness = await getObjectiveReadiness(repository, studentId, objectiveId);
    const curriculumOrder = globalIndex.get(objectiveId);
    if (curriculumOrder === undefined) throw new Error(`Objective ${objectiveId} is outside planner curriculum order`);
    seen.add(key);
    candidates.push({
      objectiveId,
      reason,
      readiness: readiness.state,
      mastery: mastery.state,
      reviewDue: mastery.reviewDue,
      targetObjectiveId,
      curriculumOrder,
    });
  }

  async function addPrerequisiteSupport(targetObjectiveId: string): Promise<void> {
    if (prerequisiteExpansion.has(targetObjectiveId)) return;
    prerequisiteExpansion.add(targetObjectiveId);
    const readiness = await getObjectiveReadiness(repository, studentId, targetObjectiveId);
    const nonMastered = readiness.prerequisites
      .filter((prerequisite) => prerequisite.mastery !== 'MASTERED')
      .sort((left, right) => {
        const masteryDifference = MASTERY_RANK[left.mastery] - MASTERY_RANK[right.mastery];
        if (masteryDifference) return masteryDifference;
        return (globalIndex.get(left.objectiveId) ?? Number.MAX_SAFE_INTEGER)
          - (globalIndex.get(right.objectiveId) ?? Number.MAX_SAFE_INTEGER);
      });
    for (const prerequisite of nonMastered) {
      const prerequisiteReadiness = await getObjectiveReadiness(repository, studentId, prerequisite.objectiveId);
      if (prerequisiteReadiness.state !== 'READY') {
        await addPrerequisiteSupport(prerequisite.objectiveId);
      }
      await addCandidate(prerequisite.objectiveId, 'PREREQUISITE_SUPPORT', targetObjectiveId);
    }
  }

  for (const reviewObjectiveId of position.reviewObjectiveIds) {
    const mastery = await getObjectiveMastery(repository, studentId, reviewObjectiveId);
    if (mastery.state === 'MASTERED' && mastery.reviewDue) {
      await addCandidate(reviewObjectiveId, 'REVIEW_DUE');
    }
  }

  if (!position.anchorObjectiveId) throw new Error('LearningPosition requires anchorObjectiveId');
  const anchor = getLearningObjective(position.anchorObjectiveId);
  if (anchor.levelId !== studentLevelId) {
    throw new Error(`Anchor objective must belong to student active level ${studentLevelId}`);
  }
  const anchorOrder = activeIndex.get(anchor.id);
  if (anchorOrder === undefined) throw new Error(`Anchor objective ${anchor.id} is outside active curriculum order`);

  const anchorMastery = await getObjectiveMastery(repository, studentId, anchor.id);
  if (anchorMastery.state !== 'MASTERED') {
    const readiness = await getObjectiveReadiness(repository, studentId, anchor.id);
    if (readiness.state !== 'READY') await addPrerequisiteSupport(anchor.id);
    if (readiness.state !== 'BLOCKED') await addCandidate(anchor.id, 'CURRENT_POSITION');
  } else {
    for (const objective of activeObjectives.slice(anchorOrder + 1)) {
      const mastery = await getObjectiveMastery(repository, studentId, objective.id);
      if (mastery.state === 'MASTERED') continue;
      const readiness = await getObjectiveReadiness(repository, studentId, objective.id);
      if (readiness.state !== 'READY') await addPrerequisiteSupport(objective.id);
      if (readiness.state !== 'BLOCKED') await addCandidate(objective.id, 'NEXT_IN_SEQUENCE');
      break;
    }
  }

  candidates.sort((left, right) => {
    const reasonDifference = REASON_RANK[left.reason] - REASON_RANK[right.reason];
    if (reasonDifference) return reasonDifference;
    if (left.reason === 'PREREQUISITE_SUPPORT' && right.reason === 'PREREQUISITE_SUPPORT') {
      const masteryDifference = MASTERY_RANK[left.mastery] - MASTERY_RANK[right.mastery];
      if (masteryDifference) return masteryDifference;
    }
    return left.curriculumOrder - right.curriculumOrder
      || (left.targetObjectiveId ?? '').localeCompare(right.targetObjectiveId ?? '')
      || left.objectiveId.localeCompare(right.objectiveId);
  });

  return candidates;
}
