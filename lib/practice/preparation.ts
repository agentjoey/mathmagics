import {
  getLearningObjective,
  getMisconceptions,
  getRepresentations,
  getStrategies,
} from '@/lib/curriculum';
import type {
  LearningObjective,
  Misconception,
  ProblemSolvingStrategy,
  Representation,
} from '@/lib/curriculum';
import {
  getObjectiveMastery,
  getObjectiveReadiness,
  getStudent,
} from '@/lib/learning';
import type {
  LearningStateRepository,
  MasterySnapshot,
  ObjectiveReadiness,
  StudentProfile,
} from '@/lib/learning';
import type { DailyLesson, PlanningRepository } from '@/lib/planning';

export interface PracticePreparationContext {
  student: StudentProfile;
  lesson: DailyLesson;
  objective: LearningObjective;
  mastery: MasterySnapshot;
  readiness: ObjectiveReadiness;
  representations: Representation[];
  strategies: ProblemSolvingStrategy[];
  misconceptions: Misconception[];
  policyVersion: 'practice-v1';
  preparedAt: string;
}

function requireTimestamp(value: string): void {
  if (!value || Number.isNaN(Date.parse(value))) throw new Error('practice preparedAt must be a valid ISO date-time string');
}

export async function buildPracticePreparationContext(
  learningRepository: LearningStateRepository,
  planningRepository: PlanningRepository,
  lessonId: string,
  objectiveId: string,
  now: string,
): Promise<PracticePreparationContext> {
  requireTimestamp(now);
  const lesson = await planningRepository.getDailyLesson(lessonId);
  if (!lesson) throw new Error(`Unknown daily lesson id: ${lessonId}`);
  if (!lesson.objectiveIds.includes(objectiveId)) throw new Error('practice objective must belong to daily lesson');
  if (lesson.intent !== 'PRACTICE' && lesson.intent !== 'REVIEW') {
    throw new Error('practice requires PRACTICE or REVIEW daily lesson intent');
  }

  const student = await getStudent(learningRepository, lesson.studentId);
  const objective = getLearningObjective(objectiveId);
  if (student.levelId === 'P2' && objective.levelId === 'P3') {
    throw new Error('practice objective is above student active level');
  }

  const mastery = await getObjectiveMastery(learningRepository, student.id, objectiveId);
  const readiness = await getObjectiveReadiness(learningRepository, student.id, objectiveId);
  if (readiness.state === 'BLOCKED') throw new Error('practice objective readiness must not be BLOCKED');

  return {
    student,
    lesson,
    objective,
    mastery,
    readiness,
    representations: getRepresentations(objectiveId),
    strategies: getStrategies(objectiveId),
    misconceptions: getMisconceptions(objectiveId),
    policyVersion: 'practice-v1',
    preparedAt: now,
  };
}
