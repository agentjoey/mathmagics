import { deriveLessonExecutionState } from './execution';
import type { PlanningRepository } from './repository';
import type {
  DailyLesson,
  LessonBriefRecord,
  LessonExecutionEvent,
  WeeklyPlan,
} from './types';
import {
  assertValidDailyLesson,
  assertValidLessonExecutionEvent,
  assertValidWeeklyPlan,
} from './validation';

function clone<T>(value: T): T {
  return structuredClone(value);
}

function weekKey(studentId: string, weekStart: string): string {
  return `${studentId}:${weekStart}`;
}

function requireNonEmpty(value: string, field: string): void {
  if (!value.trim()) throw new Error(`${field} must be non-empty`);
}

function requireTimestamp(value: string, field: string): void {
  if (!value || Number.isNaN(Date.parse(value))) throw new Error(`${field} must be a valid ISO date-time string`);
}

export class MemoryPlanningRepository implements PlanningRepository {
  private readonly plans = new Map<string, WeeklyPlan>();
  private readonly planByWeek = new Map<string, string>();
  private readonly lessons = new Map<string, DailyLesson>();
  private readonly eventIds = new Set<string>();
  private readonly eventsByLesson = new Map<string, LessonExecutionEvent[]>();
  private readonly briefIds = new Set<string>();
  private readonly briefsByLesson = new Map<string, LessonBriefRecord[]>();

  async createWeeklyPlan(plan: WeeklyPlan, lessons: DailyLesson[]): Promise<void> {
    assertValidWeeklyPlan(plan);
    if (this.plans.has(plan.id)) throw new Error('weekly plan id already exists');
    const key = weekKey(plan.studentId, plan.weekStart);
    if (this.planByWeek.has(key)) throw new Error('weekly plan already exists for student and week');

    const lessonIds = new Set<string>();
    const lessonSequences = new Set<number>();
    for (const lesson of lessons) {
      assertValidDailyLesson(lesson);
      if (lessonIds.has(lesson.id) || this.lessons.has(lesson.id)) throw new Error('daily lesson id must be unique');
      if (lessonSequences.has(lesson.sequence)) throw new Error('daily lesson sequence must be unique within weekly plan');
      if (lesson.weeklyPlanId !== plan.id) throw new Error('daily lesson weeklyPlanId must match weekly plan id');
      if (lesson.studentId !== plan.studentId) throw new Error('daily lesson studentId must match weekly plan studentId');
      lessonIds.add(lesson.id);
      lessonSequences.add(lesson.sequence);
    }

    this.plans.set(plan.id, clone(plan));
    this.planByWeek.set(key, plan.id);
    for (const lesson of lessons) this.lessons.set(lesson.id, clone(lesson));
  }

  async getWeeklyPlan(planId: string): Promise<WeeklyPlan | undefined> {
    const plan = this.plans.get(planId);
    return plan ? clone(plan) : undefined;
  }

  async findWeeklyPlan(studentId: string, weekStart: string): Promise<WeeklyPlan | undefined> {
    const planId = this.planByWeek.get(weekKey(studentId, weekStart));
    return planId ? this.getWeeklyPlan(planId) : undefined;
  }

  async listWeeklyPlansForStudent(studentId: string): Promise<WeeklyPlan[]> {
    return [...this.plans.values()]
      .filter((plan) => plan.studentId === studentId)
      .sort((left, right) => left.weekStart.localeCompare(right.weekStart)
        || left.createdAt.localeCompare(right.createdAt)
        || left.id.localeCompare(right.id))
      .map(clone);
  }

  async getDailyLesson(lessonId: string): Promise<DailyLesson | undefined> {
    const lesson = this.lessons.get(lessonId);
    return lesson ? clone(lesson) : undefined;
  }

  async listDailyLessonsForPlan(planId: string): Promise<DailyLesson[]> {
    return [...this.lessons.values()]
      .filter((lesson) => lesson.weeklyPlanId === planId)
      .sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id))
      .map(clone);
  }

  async appendExecutionEvent(event: LessonExecutionEvent): Promise<void> {
    assertValidLessonExecutionEvent(event);
    if (this.eventIds.has(event.id)) throw new Error('lesson execution event id already exists');
    const lesson = this.lessons.get(event.lessonId);
    if (!lesson) throw new Error(`Unknown daily lesson id: ${event.lessonId}`);
    if (event.studentId !== lesson.studentId) throw new Error('execution event studentId must match lesson studentId');

    const existing = this.eventsByLesson.get(event.lessonId) ?? [];
    deriveLessonExecutionState(event.lessonId, [...existing, event]);
    this.eventIds.add(event.id);
    this.eventsByLesson.set(event.lessonId, [...existing, clone(event)]);
  }

  async listExecutionEvents(lessonId: string): Promise<LessonExecutionEvent[]> {
    return [...(this.eventsByLesson.get(lessonId) ?? [])]
      .sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt) || left.id.localeCompare(right.id))
      .map(clone);
  }

  async appendLessonBrief(record: LessonBriefRecord): Promise<void> {
    requireNonEmpty(record.id, 'lesson brief id');
    requireNonEmpty(record.lessonId, 'lesson brief lessonId');
    requireNonEmpty(record.studentId, 'lesson brief studentId');
    requireNonEmpty(record.generator, 'lesson brief generator');
    requireNonEmpty(record.model, 'lesson brief model');
    requireNonEmpty(record.contextVersion, 'lesson brief contextVersion');
    requireTimestamp(record.createdAt, 'createdAt');
    if (this.briefIds.has(record.id)) throw new Error('lesson brief id already exists');
    const lesson = this.lessons.get(record.lessonId);
    if (!lesson) throw new Error(`Unknown daily lesson id: ${record.lessonId}`);
    if (record.studentId !== lesson.studentId) throw new Error('lesson brief studentId must match lesson studentId');

    const existing = this.briefsByLesson.get(record.lessonId) ?? [];
    this.briefIds.add(record.id);
    this.briefsByLesson.set(record.lessonId, [...existing, clone(record)]);
  }

  async listLessonBriefs(lessonId: string): Promise<LessonBriefRecord[]> {
    return [...(this.briefsByLesson.get(lessonId) ?? [])]
      .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.id.localeCompare(right.id))
      .map(clone);
  }
}
