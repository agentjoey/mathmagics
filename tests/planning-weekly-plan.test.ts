import { describe, expect, it } from 'vitest';
import type { StudentProfile } from '@/lib/learning';
import { generateWeeklyPlan, type LearningCandidate } from '@/lib/planning';

const student: StudentProfile = {
  id: 'student-p3',
  displayName: 'Alex',
  levelId: 'P3',
  learningMode: 'STRUCTURED_HOME_LEARNING',
  sessionsPerWeek: 4,
  minutesPerSession: 30,
  createdAt: '2026-08-24T09:00:00.000Z',
  updatedAt: '2026-08-24T09:00:00.000Z',
};

function candidate(overrides: Partial<LearningCandidate> & Pick<LearningCandidate, 'objectiveId' | 'reason'>): LearningCandidate {
  return {
    objectiveId: overrides.objectiveId,
    reason: overrides.reason,
    readiness: 'READY',
    mastery: 'NOT_STARTED',
    reviewDue: false,
    curriculumOrder: 0,
    ...overrides,
  };
}

const baseInput = {
  student,
  weekStart: '2026-08-24',
  now: '2026-08-24T09:00:00.000Z',
  planId: 'plan-1',
  lessonIds: ['lesson-1', 'lesson-2', 'lesson-3', 'lesson-4'],
};

describe('deterministic weekly plan generation', () => {
  it('allocates one early review, then learn/practice, then the next teachable objective within schedule', () => {
    const result = generateWeeklyPlan({
      ...baseInput,
      candidates: [
        candidate({
          objectiveId: 'P3-FRA-001',
          reason: 'REVIEW_DUE',
          mastery: 'MASTERED',
          reviewDue: true,
          curriculumOrder: 10,
        }),
        candidate({
          objectiveId: 'P3-FRA-003',
          reason: 'CURRENT_POSITION',
          curriculumOrder: 12,
        }),
        candidate({
          objectiveId: 'P3-FRA-004',
          reason: 'NEXT_IN_SEQUENCE',
          curriculumOrder: 13,
        }),
      ],
    });

    expect(result.plan).toEqual({
      id: 'plan-1',
      studentId: student.id,
      weekStart: '2026-08-24',
      sessionsPerWeek: 4,
      minutesPerSession: 30,
      createdAt: '2026-08-24T09:00:00.000Z',
    });
    expect(result.lessons.map((lesson) => [lesson.intent, lesson.objectiveIds[0]])).toEqual([
      ['REVIEW', 'P3-FRA-001'],
      ['LEARN', 'P3-FRA-003'],
      ['PRACTICE', 'P3-FRA-003'],
      ['LEARN', 'P3-FRA-004'],
    ]);
    expect(result.lessons).toHaveLength(student.sessionsPerWeek);
    expect(result.lessons.every((lesson) => lesson.estimatedMinutes === student.minutesPerSession)).toBe(true);
    expect(result.lessons.every((lesson) => lesson.objectiveIds.length >= 1 && lesson.objectiveIds.length <= 2)).toBe(true);
    expect(result.lessons.some((lesson) => lesson.intent === 'CORRECTION' || lesson.intent === 'ASSESSMENT')).toBe(false);
  });

  it('schedules prerequisite support before a blocked target and never emits the blocked target as LEARN', () => {
    const result = generateWeeklyPlan({
      ...baseInput,
      candidates: [
        candidate({
          objectiveId: 'P3-FRA-001',
          reason: 'PREREQUISITE_SUPPORT',
          mastery: 'DEVELOPING',
          targetObjectiveId: 'P3-FRA-003',
          curriculumOrder: 10,
        }),
        candidate({
          objectiveId: 'P3-FRA-003',
          reason: 'CURRENT_POSITION',
          readiness: 'BLOCKED',
          curriculumOrder: 12,
        }),
      ],
    });

    expect(result.lessons[0]).toMatchObject({ intent: 'LEARN', objectiveIds: ['P3-FRA-001'] });
    expect(result.lessons[0]?.rationale[0]).toEqual({
      code: 'PREREQUISITE_SUPPORT',
      objectiveId: 'P3-FRA-001',
      targetObjectiveId: 'P3-FRA-003',
    });
    expect(result.lessons.some((lesson) => lesson.intent === 'LEARN' && lesson.objectiveIds.includes('P3-FRA-003'))).toBe(false);
  });

  it('uses StudentProfile schedule values instead of caller-invented schedule fields', () => {
    const result = generateWeeklyPlan({
      ...baseInput,
      student: { ...student, sessionsPerWeek: 2, minutesPerSession: 45 },
      candidates: [candidate({ objectiveId: 'P3-FRA-003', reason: 'CURRENT_POSITION' })],
    });

    expect(result.plan.sessionsPerWeek).toBe(2);
    expect(result.plan.minutesPerSession).toBe(45);
    expect(result.lessons).toHaveLength(2);
    expect(result.lessons.every((lesson) => lesson.estimatedMinutes === 45)).toBe(true);
  });

  it('rejects insufficient or duplicate injected lesson IDs', () => {
    expect(() =>
      generateWeeklyPlan({
        ...baseInput,
        lessonIds: ['lesson-1'],
        candidates: [candidate({ objectiveId: 'P3-FRA-003', reason: 'CURRENT_POSITION' })],
      }),
    ).toThrow('lessonIds must provide at least sessionsPerWeek unique ids');

    expect(() =>
      generateWeeklyPlan({
        ...baseInput,
        lessonIds: ['lesson-1', 'lesson-1', 'lesson-3', 'lesson-4'],
        candidates: [candidate({ objectiveId: 'P3-FRA-003', reason: 'CURRENT_POSITION' })],
      }),
    ).toThrow('lessonIds must provide at least sessionsPerWeek unique ids');
  });

  it('is repeatable for identical structured inputs', () => {
    const input = {
      ...baseInput,
      candidates: [candidate({ objectiveId: 'P3-FRA-003', reason: 'CURRENT_POSITION' })],
    };
    expect(generateWeeklyPlan(input)).toEqual(generateWeeklyPlan(input));
  });
});
