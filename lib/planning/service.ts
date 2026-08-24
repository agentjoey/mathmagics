import { getStudent } from '@/lib/learning';
import type { LearningStateRepository } from '@/lib/learning';
import { listLearningCandidates } from './candidates';
import { buildLessonPreparationContext } from './lesson-preparation';
import type { LessonPreparationContext } from './lesson-preparation';
import { deriveLearningPosition } from './position';
import type { PlanningRepository } from './repository';
import type { LearningCandidate, LearningPosition, WeeklyPlan } from './types';
import { generateWeeklyPlan } from './weekly-plan';

export interface IdFactory {
  planId(): string;
  lessonId(sequence: number): string;
}

export interface TeachingPlannerService {
  derivePosition(studentId: string, now: string): Promise<LearningPosition>;
  listCandidates(studentId: string, now: string): Promise<LearningCandidate[]>;
  createWeeklyPlan(studentId: string, weekStart: string, now: string): Promise<WeeklyPlan>;
  prepareLesson(lessonId: string): Promise<LessonPreparationContext>;
}

export class TeachingPlannerServiceImpl implements TeachingPlannerService {
  constructor(
    private readonly learningRepository: LearningStateRepository,
    private readonly planningRepository: PlanningRepository,
    private readonly idFactory: IdFactory,
  ) {}

  derivePosition(studentId: string, now: string): Promise<LearningPosition> {
    return deriveLearningPosition(this.learningRepository, studentId, now);
  }

  async listCandidates(studentId: string, now: string): Promise<LearningCandidate[]> {
    const position = await this.derivePosition(studentId, now);
    return listLearningCandidates(this.learningRepository, position);
  }

  async createWeeklyPlan(studentId: string, weekStart: string, now: string): Promise<WeeklyPlan> {
    const existing = await this.planningRepository.findWeeklyPlan(studentId, weekStart);
    if (existing) throw new Error('weekly plan already exists for student and week');

    const student = await getStudent(this.learningRepository, studentId);
    const candidates = await this.listCandidates(studentId, now);
    const planId = this.idFactory.planId();
    const lessonIds = Array.from(
      { length: student.sessionsPerWeek },
      (_, index) => this.idFactory.lessonId(index + 1),
    );
    const bundle = generateWeeklyPlan({
      student,
      weekStart,
      now,
      candidates,
      planId,
      lessonIds,
    });

    await this.planningRepository.createWeeklyPlan(bundle.plan, bundle.lessons);
    return bundle.plan;
  }

  prepareLesson(lessonId: string): Promise<LessonPreparationContext> {
    return buildLessonPreparationContext(this.learningRepository, this.planningRepository, lessonId);
  }
}
