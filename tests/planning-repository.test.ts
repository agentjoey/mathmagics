import { describe, expect, it } from 'vitest';
import {
  MemoryPlanningRepository,
  generateWeeklyPlan,
  type DailyLesson,
  type LessonBriefRecord,
  type LessonExecutionEvent,
  type WeeklyPlanBundle,
} from '@/lib/planning';
import type { StudentProfile } from '@/lib/learning';

const student: StudentProfile = {
  id: 'student-p3',
  displayName: 'Alex',
  levelId: 'P3',
  learningMode: 'STRUCTURED_HOME_LEARNING',
  sessionsPerWeek: 2,
  minutesPerSession: 30,
  createdAt: '2026-08-24T09:00:00.000Z',
  updatedAt: '2026-08-24T09:00:00.000Z',
};

function bundle(planId = 'plan-1', weekStart = '2026-08-24'): WeeklyPlanBundle {
  return generateWeeklyPlan({
    student,
    weekStart,
    now: '2026-08-24T09:00:00.000Z',
    planId,
    lessonIds: [`${planId}-lesson-1`, `${planId}-lesson-2`],
    candidates: [{
      objectiveId: 'P3-FRA-003',
      reason: 'CURRENT_POSITION',
      readiness: 'READY',
      mastery: 'NOT_STARTED',
      reviewDue: false,
      curriculumOrder: 12,
    }],
  });
}

function execution(
  id: string,
  lesson: DailyLesson,
  type: LessonExecutionEvent['type'],
  occurredAt: string,
  actualMinutes?: number,
): LessonExecutionEvent {
  return {
    id,
    lessonId: lesson.id,
    studentId: lesson.studentId,
    type,
    occurredAt,
    actualMinutes,
  };
}

function brief(id: string, lesson: DailyLesson, createdAt: string): LessonBriefRecord {
  return {
    id,
    lessonId: lesson.id,
    studentId: lesson.studentId,
    generator: 'minimax',
    model: 'MiniMax-M2.7-highspeed',
    contextVersion: 'phase3-v1',
    createdAt,
    content: {
      objectiveSummary: 'Compare fractions.',
      readinessCheck: ['Check prerequisite understanding.'],
      teachingSequence: [{ stage: 'PICTORIAL', guidance: 'Use fraction strips.' }],
      keyQuestions: ['Which is larger?'],
      workedExampleSuggestions: ['Compare 1/2 and 1/3.'],
      misconceptionWatchouts: ['A larger denominator does not mean a larger fraction.'],
      masteryCheck: ['Explain the comparison.'],
    },
  };
}

describe('MemoryPlanningRepository', () => {
  it('creates a weekly plan and returns lessons in sequence order', async () => {
    const repository = new MemoryPlanningRepository();
    const created = bundle();
    await repository.createWeeklyPlan(created.plan, [...created.lessons].reverse());

    await expect(repository.getWeeklyPlan(created.plan.id)).resolves.toEqual(created.plan);
    await expect(repository.findWeeklyPlan(student.id, created.plan.weekStart)).resolves.toEqual(created.plan);
    const lessons = await repository.listDailyLessonsForPlan(created.plan.id);
    expect(lessons.map((lesson) => lesson.sequence)).toEqual([1, 2]);
  });

  it('rejects duplicate plan/week/lesson IDs and leaves failed plan creation atomic', async () => {
    const repository = new MemoryPlanningRepository();
    const first = bundle();
    await repository.createWeeklyPlan(first.plan, first.lessons);

    await expect(repository.createWeeklyPlan(first.plan, first.lessons)).rejects.toThrow('weekly plan id already exists');
    const sameWeek = bundle('plan-2', first.plan.weekStart);
    await expect(repository.createWeeklyPlan(sameWeek.plan, sameWeek.lessons)).rejects.toThrow(
      'weekly plan already exists for student and week',
    );

    const invalid = bundle('plan-invalid', '2026-08-31');
    const duplicatedLessons = [invalid.lessons[0]!, { ...invalid.lessons[1]!, id: invalid.lessons[0]!.id }];
    await expect(repository.createWeeklyPlan(invalid.plan, duplicatedLessons)).rejects.toThrow(
      'daily lesson id must be unique',
    );
    await expect(repository.getWeeklyPlan(invalid.plan.id)).resolves.toBeUndefined();
  });

  it('rejects lesson student/plan mismatches atomically', async () => {
    const repository = new MemoryPlanningRepository();
    const invalid = bundle('plan-invalid', '2026-08-31');
    const mismatched = [{ ...invalid.lessons[0]!, studentId: 'other-student' }, invalid.lessons[1]!];

    await expect(repository.createWeeklyPlan(invalid.plan, mismatched)).rejects.toThrow(
      'daily lesson studentId must match weekly plan studentId',
    );
    await expect(repository.getWeeklyPlan(invalid.plan.id)).resolves.toBeUndefined();
  });

  it('returns defensive copies of plans, lessons, and nested rationale', async () => {
    const repository = new MemoryPlanningRepository();
    const created = bundle();
    await repository.createWeeklyPlan(created.plan, created.lessons);

    const fetchedPlan = await repository.getWeeklyPlan(created.plan.id);
    const fetchedLesson = await repository.getDailyLesson(created.lessons[0]!.id);
    fetchedPlan!.weekStart = '2099-01-01';
    fetchedLesson!.objectiveIds[0] = 'tampered';
    fetchedLesson!.rationale[0]!.objectiveId = 'tampered';

    expect((await repository.getWeeklyPlan(created.plan.id))?.weekStart).toBe('2026-08-24');
    expect((await repository.getDailyLesson(created.lessons[0]!.id))?.objectiveIds[0]).toBe('P3-FRA-003');
    expect((await repository.getDailyLesson(created.lessons[0]!.id))?.rationale[0]?.objectiveId).toBe('P3-FRA-003');
  });

  it('appends globally unique execution events, validates lifecycle, and lists them deterministically', async () => {
    const repository = new MemoryPlanningRepository();
    const created = bundle();
    await repository.createWeeklyPlan(created.plan, created.lessons);
    const lesson = created.lessons[0]!;
    const started = execution('event-start', lesson, 'STARTED', '2026-08-24T09:10:00.000Z');
    const completed = execution('event-complete', lesson, 'COMPLETED', '2026-08-24T09:40:00.000Z', 28);

    await repository.appendExecutionEvent(started);
    await repository.appendExecutionEvent(completed);
    expect((await repository.listExecutionEvents(lesson.id)).map((event) => event.id)).toEqual([
      'event-start',
      'event-complete',
    ]);
    await expect(repository.appendExecutionEvent(started)).rejects.toThrow('lesson execution event id already exists');
    await expect(
      repository.appendExecutionEvent(execution('event-late', lesson, 'SKIPPED', '2026-08-24T09:50:00.000Z')),
    ).rejects.toThrow('invalid lesson execution transition: COMPLETED -> SKIPPED');
  });

  it('rejects execution events and lesson briefs for unknown lessons or mismatched students', async () => {
    const repository = new MemoryPlanningRepository();
    const created = bundle();
    await repository.createWeeklyPlan(created.plan, created.lessons);
    const lesson = created.lessons[0]!;

    await expect(
      repository.appendExecutionEvent({ ...execution('unknown', lesson, 'STARTED', '2026-08-24T09:10:00.000Z'), lessonId: 'missing' }),
    ).rejects.toThrow('Unknown daily lesson id: missing');
    await expect(
      repository.appendExecutionEvent({ ...execution('wrong-student', lesson, 'STARTED', '2026-08-24T09:10:00.000Z'), studentId: 'other' }),
    ).rejects.toThrow('execution event studentId must match lesson studentId');
    await expect(repository.appendLessonBrief({ ...brief('brief-missing', lesson, '2026-08-24T09:30:00.000Z'), lessonId: 'missing' })).rejects.toThrow(
      'Unknown daily lesson id: missing',
    );
  });

  it('keeps lesson briefs append-only, version ordered, globally unique, and defensively cloned', async () => {
    const repository = new MemoryPlanningRepository();
    const created = bundle();
    await repository.createWeeklyPlan(created.plan, created.lessons);
    const lesson = created.lessons[0]!;
    const later = brief('brief-b', lesson, '2026-08-24T09:40:00.000Z');
    const earlier = brief('brief-a', lesson, '2026-08-24T09:30:00.000Z');

    await repository.appendLessonBrief(later);
    await repository.appendLessonBrief(earlier);
    const versions = await repository.listLessonBriefs(lesson.id);
    expect(versions.map((record) => record.id)).toEqual(['brief-a', 'brief-b']);
    versions[0]!.content.keyQuestions[0] = 'tampered';
    expect((await repository.listLessonBriefs(lesson.id))[0]?.content.keyQuestions[0]).toBe('Which is larger?');
    await expect(repository.appendLessonBrief(earlier)).rejects.toThrow('lesson brief id already exists');
    await expect(repository.appendLessonBrief({ ...brief('brief-wrong', lesson, '2026-08-24T09:50:00.000Z'), studentId: 'other' })).rejects.toThrow(
      'lesson brief studentId must match lesson studentId',
    );
  });
});
