import { describe, expect, it } from 'vitest';
import {
  assertValidDailyLesson,
  assertValidLessonExecutionEvent,
  assertValidWeeklyPlan,
  deriveLessonExecutionState,
} from '@/lib/planning';
import type { DailyLesson, LessonExecutionEvent, WeeklyPlan } from '@/lib/planning';

const plan: WeeklyPlan = {
  id: 'plan-1',
  studentId: 'student-1',
  weekStart: '2026-08-24',
  sessionsPerWeek: 4,
  minutesPerSession: 30,
  createdAt: '2026-08-24T09:00:00.000Z',
};

const lesson: DailyLesson = {
  id: 'lesson-1',
  weeklyPlanId: plan.id,
  studentId: plan.studentId,
  sequence: 1,
  intent: 'LEARN',
  objectiveIds: ['P3-FRA-001'],
  estimatedMinutes: 30,
  rationale: [{ code: 'CURRENT_POSITION', objectiveId: 'P3-FRA-001' }],
  createdAt: '2026-08-24T09:00:00.000Z',
};

function event(
  id: string,
  type: LessonExecutionEvent['type'],
  occurredAt: string,
  overrides: Partial<LessonExecutionEvent> = {},
): LessonExecutionEvent {
  return {
    id,
    lessonId: lesson.id,
    studentId: lesson.studentId,
    type,
    occurredAt,
    ...overrides,
  };
}

describe('planning contract validation', () => {
  it('accepts exact weekly plan schedule boundaries', () => {
    expect(() => assertValidWeeklyPlan({ ...plan, sessionsPerWeek: 1, minutesPerSession: 10 })).not.toThrow();
    expect(() => assertValidWeeklyPlan({ ...plan, sessionsPerWeek: 7, minutesPerSession: 180 })).not.toThrow();
  });

  it('rejects invalid weekly plan schedule values and calendar dates', () => {
    for (const sessionsPerWeek of [0, 8, 1.5]) {
      expect(() => assertValidWeeklyPlan({ ...plan, sessionsPerWeek })).toThrow(
        'sessionsPerWeek must be an integer from 1 through 7',
      );
    }
    for (const minutesPerSession of [9, 181, 30.5]) {
      expect(() => assertValidWeeklyPlan({ ...plan, minutesPerSession })).toThrow(
        'minutesPerSession must be an integer from 10 through 180',
      );
    }
    expect(() => assertValidWeeklyPlan({ ...plan, weekStart: '2026/08/24' })).toThrow(
      'weekStart must be a valid YYYY-MM-DD calendar date',
    );
    expect(() => assertValidWeeklyPlan({ ...plan, weekStart: '2026-02-30' })).toThrow(
      'weekStart must be a valid YYYY-MM-DD calendar date',
    );
  });

  it('accepts one or two unique objectives and exact lesson intents', () => {
    expect(() => assertValidDailyLesson(lesson)).not.toThrow();
    expect(() =>
      assertValidDailyLesson({
        ...lesson,
        intent: 'REVIEW',
        objectiveIds: ['P3-FRA-001', 'P3-FRA-002'],
      }),
    ).not.toThrow();
  });

  it('rejects oversized, duplicate, or empty objective sets and invalid lesson values', () => {
    expect(() => assertValidDailyLesson({ ...lesson, objectiveIds: [] })).toThrow(
      'objectiveIds must contain one or two unique objective ids',
    );
    expect(() =>
      assertValidDailyLesson({ ...lesson, objectiveIds: ['P3-FRA-001', 'P3-FRA-001'] }),
    ).toThrow('objectiveIds must contain one or two unique objective ids');
    expect(() =>
      assertValidDailyLesson({
        ...lesson,
        objectiveIds: ['P3-FRA-001', 'P3-FRA-002', 'P3-FRA-003'],
      }),
    ).toThrow('objectiveIds must contain one or two unique objective ids');
    expect(() => assertValidDailyLesson({ ...lesson, estimatedMinutes: 0 })).toThrow(
      'estimatedMinutes must be a positive integer',
    );
    expect(() => assertValidDailyLesson({ ...lesson, estimatedMinutes: 30.5 })).toThrow(
      'estimatedMinutes must be a positive integer',
    );
    expect(() => assertValidDailyLesson({ ...lesson, intent: 'QUIZ' as DailyLesson['intent'] })).toThrow(
      'invalid lesson intent: QUIZ',
    );
  });

  it('validates execution event timestamps and actual minutes', () => {
    expect(() =>
      assertValidLessonExecutionEvent(event('start', 'STARTED', '2026-08-24T09:10:00.000Z')),
    ).not.toThrow();
    expect(() => assertValidLessonExecutionEvent(event('bad', 'STARTED', 'not-a-date'))).toThrow(
      'occurredAt must be a valid ISO date-time string',
    );
    expect(() =>
      assertValidLessonExecutionEvent(
        event('complete', 'COMPLETED', '2026-08-24T09:40:00.000Z', { actualMinutes: 0 }),
      ),
    ).toThrow('actualMinutes must be a positive integer when provided');
  });
});

describe('lesson execution projection', () => {
  it('projects empty history as PLANNED', () => {
    expect(deriveLessonExecutionState(lesson.id, [])).toEqual({
      lessonId: lesson.id,
      status: 'PLANNED',
    });
  });

  it('projects PLANNED -> STARTED -> COMPLETED and exposes terminal actual minutes', () => {
    const history = [
      event('started', 'STARTED', '2026-08-24T09:10:00.000Z'),
      event('completed', 'COMPLETED', '2026-08-24T09:40:00.000Z', { actualMinutes: 28 }),
    ];
    expect(deriveLessonExecutionState(lesson.id, history)).toEqual({
      lessonId: lesson.id,
      status: 'COMPLETED',
      startedAt: '2026-08-24T09:10:00.000Z',
      completedAt: '2026-08-24T09:40:00.000Z',
      actualMinutes: 28,
    });
  });

  it('supports PLANNED -> SKIPPED and STARTED -> SKIPPED', () => {
    expect(
      deriveLessonExecutionState(lesson.id, [
        event('skipped', 'SKIPPED', '2026-08-24T09:10:00.000Z', { actualMinutes: 5 }),
      ]),
    ).toEqual({
      lessonId: lesson.id,
      status: 'SKIPPED',
      skippedAt: '2026-08-24T09:10:00.000Z',
      actualMinutes: 5,
    });

    expect(
      deriveLessonExecutionState(lesson.id, [
        event('started', 'STARTED', '2026-08-24T09:10:00.000Z'),
        event('skipped', 'SKIPPED', '2026-08-24T09:20:00.000Z'),
      ]),
    ).toEqual({
      lessonId: lesson.id,
      status: 'SKIPPED',
      startedAt: '2026-08-24T09:10:00.000Z',
      skippedAt: '2026-08-24T09:20:00.000Z',
    });
  });

  it('sorts by occurredAt then id without mutating caller input', () => {
    const records = [
      event('b-completed', 'COMPLETED', '2026-08-24T09:20:00.000Z', { actualMinutes: 20 }),
      event('a-started', 'STARTED', '2026-08-24T09:10:00.000Z'),
    ];
    const idsBefore = records.map((record) => record.id);

    expect(deriveLessonExecutionState(lesson.id, records).status).toBe('COMPLETED');
    expect(records.map((record) => record.id)).toEqual(idsBefore);
  });

  it('rejects duplicate starts, events after terminal state, cross-lesson events, and terminal-before-start ties', () => {
    expect(() =>
      deriveLessonExecutionState(lesson.id, [
        event('start-1', 'STARTED', '2026-08-24T09:10:00.000Z'),
        event('start-2', 'STARTED', '2026-08-24T09:11:00.000Z'),
      ]),
    ).toThrow('invalid lesson execution transition: STARTED -> STARTED');

    expect(() =>
      deriveLessonExecutionState(lesson.id, [
        event('start', 'STARTED', '2026-08-24T09:10:00.000Z'),
        event('done', 'COMPLETED', '2026-08-24T09:20:00.000Z'),
        event('late', 'SKIPPED', '2026-08-24T09:21:00.000Z'),
      ]),
    ).toThrow('invalid lesson execution transition: COMPLETED -> SKIPPED');

    expect(() =>
      deriveLessonExecutionState(lesson.id, [
        event('other', 'STARTED', '2026-08-24T09:10:00.000Z', { lessonId: 'other-lesson' }),
      ]),
    ).toThrow('execution event lessonId must match projected lesson id');

    expect(() =>
      deriveLessonExecutionState(lesson.id, [
        event('a-completed', 'COMPLETED', '2026-08-24T09:10:00.000Z'),
        event('b-started', 'STARTED', '2026-08-24T09:10:00.000Z'),
      ]),
    ).toThrow('invalid lesson execution transition: PLANNED -> COMPLETED');
  });
});
