import {
  getLearningObjective,
  getPrerequisites,
  listObjectivesForTopic,
  loadCurriculumDataset,
} from '@/lib/curriculum';
import type { CurriculumDataset, CurriculumNode } from '@/lib/curriculum';
import { deriveMastery } from './mastery-policy';
import { classifyReadiness } from './readiness';
import type { LearningStateRepository } from './repository';
import type {
  MasterySnapshot,
  MasteryState,
  ObjectiveReadiness,
  StudentLevel,
  StudentProfile,
} from './types';

function levelRank(level: StudentLevel): number {
  return level === 'P2' ? 2 : 3;
}

function topicLevel(topicId: string, dataset: CurriculumDataset): StudentLevel {
  let current: CurriculumNode | undefined = dataset.nodes.find((node) => node.id === topicId && node.type === 'topic');
  if (!current) throw new Error(`Unknown curriculum topic id: ${topicId}`);

  const visited = new Set<string>();
  while (current) {
    if (visited.has(current.id)) throw new Error(`Curriculum node parent cycle at: ${current.id}`);
    visited.add(current.id);

    if (current.type === 'level') {
      if (current.id === 'P2' || current.id === 'P3') return current.id;
      throw new Error(`Unsupported curriculum level id: ${current.id}`);
    }

    if (!current.parentId) break;
    current = dataset.nodes.find((node) => node.id === current!.parentId);
  }

  throw new Error(`Curriculum topic ${topicId} is not attached to a supported level`);
}

export async function getStudent(
  repository: LearningStateRepository,
  studentId: string,
): Promise<StudentProfile> {
  const student = await repository.getStudent(studentId);
  if (!student) throw new Error(`Unknown student id: ${studentId}`);
  return student;
}

export async function getObjectiveMastery(
  repository: LearningStateRepository,
  studentId: string,
  objectiveId: string,
): Promise<MasterySnapshot> {
  await getStudent(repository, studentId);
  getLearningObjective(objectiveId);
  const evidence = await repository.listEvidenceForObjective(studentId, objectiveId);
  return deriveMastery(studentId, objectiveId, evidence);
}

export async function listTopicMastery(
  repository: LearningStateRepository,
  studentId: string,
  topicId: string,
): Promise<MasterySnapshot[]> {
  const student = await getStudent(repository, studentId);
  const dataset = loadCurriculumDataset();
  const objectives = listObjectivesForTopic(topicId, dataset);
  const level = topicLevel(topicId, dataset);
  if (levelRank(level) > levelRank(student.levelId)) {
    throw new Error(`Topic ${topicId} is above student active level ${student.levelId}`);
  }

  return Promise.all(
    objectives.map(async (objective) => {
      const evidence = await repository.listEvidenceForObjective(studentId, objective.id);
      return deriveMastery(studentId, objective.id, evidence);
    }),
  );
}

export async function getObjectiveReadiness(
  repository: LearningStateRepository,
  studentId: string,
  objectiveId: string,
): Promise<ObjectiveReadiness> {
  await getStudent(repository, studentId);
  getLearningObjective(objectiveId);
  const prerequisites = getPrerequisites(objectiveId);
  const statuses = await Promise.all(
    prerequisites.map(async (prerequisite) => {
      const mastery = await getObjectiveMastery(repository, studentId, prerequisite.id);
      return {
        objectiveId: prerequisite.id,
        mastery: mastery.state,
        reviewDue: mastery.reviewDue,
      };
    }),
  );
  return classifyReadiness(studentId, objectiveId, statuses);
}

export async function getStudentLearningSummary(
  repository: LearningStateRepository,
  studentId: string,
): Promise<{
  levelId: StudentLevel;
  counts: Record<MasteryState, number>;
  reviewDueCount: number;
}> {
  const student = await getStudent(repository, studentId);
  const dataset = loadCurriculumDataset();
  const objectives = dataset.objectives.filter((objective) => objective.levelId === student.levelId);
  const counts: Record<MasteryState, number> = {
    NOT_STARTED: 0,
    INTRODUCED: 0,
    DEVELOPING: 0,
    MASTERED: 0,
  };
  let reviewDueCount = 0;

  for (const objective of objectives) {
    const evidence = await repository.listEvidenceForObjective(studentId, objective.id);
    const snapshot = deriveMastery(studentId, objective.id, evidence);
    counts[snapshot.state] += 1;
    if (snapshot.reviewDue) reviewDueCount += 1;
  }

  return { levelId: student.levelId, counts, reviewDueCount };
}
