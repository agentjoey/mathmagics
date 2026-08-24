import {
  getLearningObjective,
  getMisconceptions,
  getPrerequisites,
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
import type { PlanningRepository } from './repository';
import type { DailyLesson } from './types';

export interface LessonPreparationObjectiveContext {
  objective: LearningObjective;
  mastery: MasterySnapshot;
  readiness: ObjectiveReadiness;
  prerequisites: LearningObjective[];
  representations: Representation[];
  strategies: ProblemSolvingStrategy[];
  misconceptions: Misconception[];
  readinessEvidence: string[];
  masteryEvidence: string[];
}

export interface LessonPreparationContext {
  student: StudentProfile;
  lesson: DailyLesson;
  objectives: LessonPreparationObjectiveContext[];
}

export async function buildLessonPreparationContext(
  learningRepository: LearningStateRepository,
  planningRepository: PlanningRepository,
  lessonId: string,
): Promise<LessonPreparationContext> {
  const lesson = await planningRepository.getDailyLesson(lessonId);
  if (!lesson) throw new Error(`Unknown daily lesson id: ${lessonId}`);

  const student = await getStudent(learningRepository, lesson.studentId);
  const objectives = await Promise.all(
    lesson.objectiveIds.map(async (objectiveId): Promise<LessonPreparationObjectiveContext> => {
      const objective = getLearningObjective(objectiveId);
      const mastery = await getObjectiveMastery(learningRepository, student.id, objectiveId);
      const readiness = await getObjectiveReadiness(learningRepository, student.id, objectiveId);
      return {
        objective: structuredClone(objective),
        mastery,
        readiness,
        prerequisites: structuredClone(getPrerequisites(objectiveId)),
        representations: structuredClone(getRepresentations(objectiveId)),
        strategies: structuredClone(getStrategies(objectiveId)),
        misconceptions: structuredClone(getMisconceptions(objectiveId)),
        readinessEvidence: [...objective.readinessEvidence],
        masteryEvidence: [...objective.masteryEvidence],
      };
    }),
  );

  return {
    student: structuredClone(student),
    lesson: structuredClone(lesson),
    objectives,
  };
}
