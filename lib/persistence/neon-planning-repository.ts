import { and, asc, eq } from 'drizzle-orm';
import { deriveLessonExecutionState } from '@/lib/planning';
import type {
  DailyLesson,
  GeneratedLessonBriefContent,
  LessonBriefRecord,
  LessonExecutionEvent,
  LessonExecutionEventType,
  LessonIntent,
  PlanningRepository,
  PlanningRationale,
  WeeklyPlan,
} from '@/lib/planning';
import {
  assertValidDailyLesson,
  assertValidLessonExecutionEvent,
  assertValidWeeklyPlan,
} from '@/lib/planning';
import { createNeonDatabase } from './db';
import type { MathMagicsDatabase } from './db';
import {
  dailyLessons,
  lessonBriefs,
  lessonExecutionEvents,
  weeklyPlans,
} from './schema';

function requireNonEmpty(value: string, field: string): void {
  if (!value.trim()) throw new Error(`${field} must be non-empty`);
}

function requireTimestamp(value: string, field: string): void {
  if (!value || Number.isNaN(Date.parse(value))) throw new Error(`${field} must be a valid ISO date-time string`);
}

function toPlan(row: typeof weeklyPlans.$inferSelect): WeeklyPlan {
  return {
    id: row.id,
    studentId: row.studentId,
    weekStart: row.weekStart,
    sessionsPerWeek: row.sessionsPerWeek,
    minutesPerSession: row.minutesPerSession,
    createdAt: row.createdAt,
  };
}

function toLesson(row: typeof dailyLessons.$inferSelect): DailyLesson {
  return {
    id: row.id,
    weeklyPlanId: row.weeklyPlanId,
    studentId: row.studentId,
    sequence: row.sequence,
    intent: row.intent as LessonIntent,
    objectiveIds: structuredClone(row.objectiveIds),
    estimatedMinutes: row.estimatedMinutes,
    rationale: structuredClone(row.rationale as PlanningRationale[]),
    createdAt: row.createdAt,
  };
}

function toEvent(row: typeof lessonExecutionEvents.$inferSelect): LessonExecutionEvent {
  return {
    id: row.id,
    lessonId: row.lessonId,
    studentId: row.studentId,
    type: row.type as LessonExecutionEventType,
    occurredAt: row.occurredAt,
    actualMinutes: row.actualMinutes ?? undefined,
  };
}

function toBrief(row: typeof lessonBriefs.$inferSelect): LessonBriefRecord {
  return {
    id: row.id,
    lessonId: row.lessonId,
    studentId: row.studentId,
    generator: row.generator,
    model: row.model,
    contextVersion: row.contextVersion,
    content: structuredClone(row.content as GeneratedLessonBriefContent),
    createdAt: row.createdAt,
  };
}

export class NeonPlanningRepository implements PlanningRepository {
  constructor(private readonly db: MathMagicsDatabase = createNeonDatabase()) {}

  async createWeeklyPlan(plan: WeeklyPlan, lessons: DailyLesson[]): Promise<void> {
    assertValidWeeklyPlan(plan);
    const [sameId] = await this.db.select({ id: weeklyPlans.id }).from(weeklyPlans)
      .where(eq(weeklyPlans.id, plan.id)).limit(1);
    if (sameId) throw new Error('weekly plan id already exists');
    const existingWeek = await this.findWeeklyPlan(plan.studentId, plan.weekStart);
    if (existingWeek) throw new Error('weekly plan already exists for student and week');

    const lessonIds = new Set<string>();
    const sequences = new Set<number>();
    for (const lesson of lessons) {
      assertValidDailyLesson(lesson);
      if (lessonIds.has(lesson.id)) throw new Error('daily lesson id must be unique');
      if (sequences.has(lesson.sequence)) throw new Error('daily lesson sequence must be unique within weekly plan');
      if (lesson.weeklyPlanId !== plan.id) throw new Error('daily lesson weeklyPlanId must match weekly plan id');
      if (lesson.studentId !== plan.studentId) throw new Error('daily lesson studentId must match weekly plan studentId');
      const [existingLesson] = await this.db.select({ id: dailyLessons.id }).from(dailyLessons)
        .where(eq(dailyLessons.id, lesson.id)).limit(1);
      if (existingLesson) throw new Error('daily lesson id must be unique');
      lessonIds.add(lesson.id);
      sequences.add(lesson.sequence);
    }

    const planInsert = this.db.insert(weeklyPlans).values({
      id: plan.id,
      studentId: plan.studentId,
      weekStart: plan.weekStart,
      sessionsPerWeek: plan.sessionsPerWeek,
      minutesPerSession: plan.minutesPerSession,
      createdAt: plan.createdAt,
    });

    if (lessons.length === 0) {
      await planInsert;
      return;
    }

    const lessonInsert = this.db.insert(dailyLessons).values(lessons.map((lesson) => ({
      id: lesson.id,
      weeklyPlanId: lesson.weeklyPlanId,
      studentId: lesson.studentId,
      sequence: lesson.sequence,
      intent: lesson.intent,
      objectiveIds: lesson.objectiveIds,
      estimatedMinutes: lesson.estimatedMinutes,
      rationale: lesson.rationale,
      createdAt: lesson.createdAt,
    })));
    await this.db.batch([planInsert, lessonInsert]);
  }

  async getWeeklyPlan(planId: string): Promise<WeeklyPlan | undefined> {
    const [row] = await this.db.select().from(weeklyPlans).where(eq(weeklyPlans.id, planId)).limit(1);
    return row ? toPlan(row) : undefined;
  }

  async findWeeklyPlan(studentId: string, weekStart: string): Promise<WeeklyPlan | undefined> {
    const [row] = await this.db.select().from(weeklyPlans)
      .where(and(eq(weeklyPlans.studentId, studentId), eq(weeklyPlans.weekStart, weekStart))).limit(1);
    return row ? toPlan(row) : undefined;
  }

  async listWeeklyPlansForStudent(studentId: string): Promise<WeeklyPlan[]> {
    const rows = await this.db.select().from(weeklyPlans)
      .where(eq(weeklyPlans.studentId, studentId))
      .orderBy(asc(weeklyPlans.weekStart), asc(weeklyPlans.createdAt), asc(weeklyPlans.id));
    return rows.map(toPlan);
  }

  async getDailyLesson(lessonId: string): Promise<DailyLesson | undefined> {
    const [row] = await this.db.select().from(dailyLessons).where(eq(dailyLessons.id, lessonId)).limit(1);
    return row ? toLesson(row) : undefined;
  }

  async listDailyLessonsForPlan(planId: string): Promise<DailyLesson[]> {
    const rows = await this.db.select().from(dailyLessons)
      .where(eq(dailyLessons.weeklyPlanId, planId))
      .orderBy(asc(dailyLessons.sequence), asc(dailyLessons.id));
    return rows.map(toLesson);
  }

  async appendExecutionEvent(event: LessonExecutionEvent): Promise<void> {
    assertValidLessonExecutionEvent(event);
    const [duplicate] = await this.db.select({ id: lessonExecutionEvents.id }).from(lessonExecutionEvents)
      .where(eq(lessonExecutionEvents.id, event.id)).limit(1);
    if (duplicate) throw new Error('lesson execution event id already exists');
    const lesson = await this.getDailyLesson(event.lessonId);
    if (!lesson) throw new Error(`Unknown daily lesson id: ${event.lessonId}`);
    if (event.studentId !== lesson.studentId) throw new Error('execution event studentId must match lesson studentId');
    const existing = await this.listExecutionEvents(event.lessonId);
    deriveLessonExecutionState(event.lessonId, [...existing, event]);
    await this.db.insert(lessonExecutionEvents).values({
      id: event.id,
      lessonId: event.lessonId,
      studentId: event.studentId,
      type: event.type,
      occurredAt: event.occurredAt,
      actualMinutes: event.actualMinutes,
    });
  }

  async listExecutionEvents(lessonId: string): Promise<LessonExecutionEvent[]> {
    const rows = await this.db.select().from(lessonExecutionEvents)
      .where(eq(lessonExecutionEvents.lessonId, lessonId))
      .orderBy(asc(lessonExecutionEvents.occurredAt), asc(lessonExecutionEvents.id));
    return rows.map(toEvent);
  }

  async appendLessonBrief(record: LessonBriefRecord): Promise<void> {
    requireNonEmpty(record.id, 'lesson brief id');
    requireNonEmpty(record.lessonId, 'lesson brief lessonId');
    requireNonEmpty(record.studentId, 'lesson brief studentId');
    requireNonEmpty(record.generator, 'lesson brief generator');
    requireNonEmpty(record.model, 'lesson brief model');
    requireNonEmpty(record.contextVersion, 'lesson brief contextVersion');
    requireTimestamp(record.createdAt, 'createdAt');
    const [duplicate] = await this.db.select({ id: lessonBriefs.id }).from(lessonBriefs)
      .where(eq(lessonBriefs.id, record.id)).limit(1);
    if (duplicate) throw new Error('lesson brief id already exists');
    const lesson = await this.getDailyLesson(record.lessonId);
    if (!lesson) throw new Error(`Unknown daily lesson id: ${record.lessonId}`);
    if (record.studentId !== lesson.studentId) throw new Error('lesson brief studentId must match lesson studentId');
    await this.db.insert(lessonBriefs).values({
      id: record.id,
      lessonId: record.lessonId,
      studentId: record.studentId,
      generator: record.generator,
      model: record.model,
      contextVersion: record.contextVersion,
      content: record.content,
      createdAt: record.createdAt,
    });
  }

  async listLessonBriefs(lessonId: string): Promise<LessonBriefRecord[]> {
    const rows = await this.db.select().from(lessonBriefs)
      .where(eq(lessonBriefs.lessonId, lessonId))
      .orderBy(asc(lessonBriefs.createdAt), asc(lessonBriefs.id));
    return rows.map(toBrief);
  }
}
