import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { StudentProfile } from '@/lib/learning';
import type { DailyLesson, LessonBriefRecord, LessonExecutionEvent, WeeklyPlan } from '@/lib/planning';
import { createNeonDatabase } from '@/lib/persistence/db';
import { NeonLearningStateRepository } from '@/lib/persistence/neon-learning-state-repository';
import { NeonPlanningRepository } from '@/lib/persistence/neon-planning-repository';
import { students } from '@/lib/persistence/schema';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)('Neon repository contract', () => {
  it('persists Phase 2 facts and Phase 3 immutable planning history without production fallback', async () => {
    if (!TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required for this integration test');
    const db = createNeonDatabase(TEST_DATABASE_URL);
    const learning = new NeonLearningStateRepository(db);
    const planning = new NeonPlanningRepository(db);
    const suffix = randomUUID();
    const studentId = `it-student-${suffix}`;
    const planId = `it-plan-${suffix}`;
    const lessonId = `it-lesson-${suffix}`;
    const now = '2026-08-24T12:00:00.000Z';

    const student: StudentProfile = {
      id: studentId,
      displayName: 'Integration Student',
      levelId: 'P3',
      learningMode: 'STRUCTURED_HOME_LEARNING',
      sessionsPerWeek: 1,
      minutesPerSession: 30,
      createdAt: now,
      updatedAt: now,
    };
    const plan: WeeklyPlan = {
      id: planId,
      studentId,
      weekStart: '2026-08-24',
      sessionsPerWeek: 1,
      minutesPerSession: 30,
      createdAt: now,
    };
    const lesson: DailyLesson = {
      id: lessonId,
      weeklyPlanId: planId,
      studentId,
      sequence: 1,
      intent: 'LEARN',
      objectiveIds: ['P3-FRA-003'],
      estimatedMinutes: 30,
      rationale: [{ code: 'CURRENT_POSITION', objectiveId: 'P3-FRA-003' }],
      createdAt: now,
    };
    const event: LessonExecutionEvent = {
      id: `it-event-${suffix}`,
      lessonId,
      studentId,
      type: 'STARTED',
      occurredAt: '2026-08-24T12:05:00.000Z',
    };
    const brief: LessonBriefRecord = {
      id: `it-brief-${suffix}`,
      lessonId,
      studentId,
      generator: 'integration-test',
      model: 'fake',
      contextVersion: 'phase3-v1',
      content: {
        objectiveSummary: 'Fixture',
        readinessCheck: [],
        teachingSequence: [],
        keyQuestions: [],
        workedExampleSuggestions: [],
        misconceptionWatchouts: [],
        masteryCheck: [],
      },
      createdAt: '2026-08-24T12:10:00.000Z',
    };

    try {
      await learning.saveStudent(student);
      await learning.setCurrentPosition({
        studentId,
        levelId: 'P3',
        objectiveId: 'P3-FRA-003',
        recordedAt: now,
        source: 'MANUAL_SETUP',
      });
      await learning.appendEvidence({
        id: `it-evidence-${suffix}`,
        studentId,
        objectiveId: 'P3-FRA-003',
        type: 'introduced',
        observedAt: now,
        recordedAt: now,
        origin: { kind: 'SETUP' },
      });
      await planning.createWeeklyPlan(plan, [lesson]);
      await planning.appendExecutionEvent(event);
      await planning.appendLessonBrief(brief);

      await expect(learning.getStudent(studentId)).resolves.toEqual(student);
      await expect(learning.getCurrentPosition(studentId)).resolves.toMatchObject({ objectiveId: 'P3-FRA-003' });
      await expect(learning.listEvidenceForObjective(studentId, 'P3-FRA-003')).resolves.toHaveLength(1);
      await expect(planning.getWeeklyPlan(planId)).resolves.toEqual(plan);
      await expect(planning.listDailyLessonsForPlan(planId)).resolves.toEqual([lesson]);
      await expect(planning.listExecutionEvents(lessonId)).resolves.toEqual([event]);
      await expect(planning.listLessonBriefs(lessonId)).resolves.toEqual([brief]);

      await expect(learning.appendEvidence({
        id: `it-evidence-${suffix}`,
        studentId,
        objectiveId: 'P3-FRA-003',
        type: 'introduced',
        observedAt: now,
        recordedAt: now,
        origin: { kind: 'SETUP' },
      })).rejects.toThrow('Duplicate evidence id');
      await expect(planning.createWeeklyPlan({ ...plan, id: `it-plan-duplicate-${suffix}` }, []))
        .rejects.toThrow('weekly plan already exists for student and week');
    } finally {
      await db.delete(students).where(eq(students.id, studentId));
    }
  });
});
