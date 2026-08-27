import { describe, expect, it, vi } from 'vitest';
import { MemoryAdaptiveRepository } from '@/lib/adaptation';
import { PilotSessionService } from '@/lib/pilot';
import { MemoryPlanningRepository } from '@/lib/planning';
import type { DailyLesson, WeeklyPlan } from '@/lib/planning';
import type { Attempt, PracticeService, PracticeSession, SubmitAttemptInput } from '@/lib/practice';

const STUDENT = 'pilot-student';
const OTHER = 'other-student';
const START_AT = '2026-08-27T08:00:00.000Z';
const COMPLETE_AT = '2026-08-27T08:30:00.000Z';

const plan: WeeklyPlan = {
  id: 'pilot-plan', studentId: STUDENT, weekStart: '2026-08-24', sessionsPerWeek: 5, minutesPerSession: 30,
  createdAt: '2026-08-24T00:00:00.000Z',
};
const lesson: DailyLesson = {
  id: 'lesson-1', weeklyPlanId: plan.id, studentId: STUDENT, sequence: 1, intent: 'PRACTICE',
  objectiveIds: ['P2-AS-002'], estimatedMinutes: 30,
  rationale: [{ code: 'CURRENT_POSITION', objectiveId: 'P2-AS-002' }], createdAt: plan.createdAt,
};
const lesson2: DailyLesson = {
  ...lesson, id: 'lesson-2', sequence: 2,
};

function practiceSession(): PracticeSession {
  return {
    id: 'session-1', studentId: STUDENT, lessonId: lesson.id, objectiveId: lesson.objectiveIds[0],
    policyVersion: 'practice-v1', createdAt: START_AT,
  };
}

function attempt(input: SubmitAttemptInput): Attempt {
  return {
    id: input.attemptId,
    source: { kind: 'PRACTICE', sessionId: input.sessionId, itemId: input.itemId },
    studentId: STUDENT,
    objectiveId: lesson.objectiveIds[0],
    answerText: input.answerText,
    outcome: 'CORRECT',
    hintUsed: false,
    retryOfAttemptId: input.retryOfAttemptId,
    gradingPolicyVersion: 'grading-v1',
    submittedAt: COMPLETE_AT,
    recordedAt: COMPLETE_AT,
  };
}

async function harness() {
  const planning = new MemoryPlanningRepository();
  await planning.createWeeklyPlan(plan, [lesson, lesson2]);
  const adaptive = new MemoryAdaptiveRepository(planning);
  const createPracticeSession = vi.fn(async () => practiceSession());
  const revealHint = vi.fn(async () => 'trusted hint');
  const submitAttempt = vi.fn(async (input: SubmitAttemptInput) => attempt(input));
  const practice: PracticeService = {
    preparePractice: vi.fn(),
    createPracticeSession,
    revealHint,
    submitAttempt,
  };
  const service = new PilotSessionService({
    planning,
    adaptive,
    practice,
    practiceOwnership: {
      getPracticeSession: async (sessionId: string) => sessionId === 'session-1'
        ? { id: 'session-1', studentId: STUDENT }
        : undefined,
      getPracticeItem: async (itemId: string) => itemId === 'item-1'
        ? { id: 'item-1', sessionId: 'session-1', studentId: STUDENT }
        : undefined,
    },
    clock: { now: () => START_AT },
    ids: { executionEventId: (lessonId: string, type: string, at: string) => `${lessonId}:${type}:${at}` },
  });
  return { service, planning, createPracticeSession, revealHint, submitAttempt };
}

describe('PilotSessionService', () => {
  it('starts the trusted next lesson and returns the same STARTED lesson idempotently', async () => {
    const { service, planning } = await harness();

    const started = await service.startNextLesson(STUDENT, START_AT);
    expect(started).toMatchObject({ lessonId: lesson.id, execution: { status: 'STARTED' } });

    const repeated = await service.startNextLesson(STUDENT, '2026-08-27T08:05:00.000Z');
    expect(repeated).toMatchObject({ lessonId: lesson.id, execution: { status: 'STARTED' } });
    expect(await planning.listExecutionEvents(lesson.id)).toHaveLength(1);
  });

  it('completes only the owning student lesson and rejects repeated terminal transitions', async () => {
    const { service } = await harness();
    await service.startNextLesson(STUDENT, START_AT);

    await expect(service.completeLesson(OTHER, lesson.id, 30, COMPLETE_AT)).rejects.toThrow('lesson does not belong to student');
    await expect(service.completeLesson(STUDENT, lesson.id, 30, COMPLETE_AT)).resolves.toMatchObject({
      lessonId: lesson.id,
      status: 'COMPLETED',
      actualMinutes: 30,
    });
    await expect(service.completeLesson(STUDENT, lesson.id, 30, '2026-08-27T08:31:00.000Z')).rejects.toThrow();
  });

  it('delegates practice creation only for a lesson objective owned by the student', async () => {
    const { service, createPracticeSession } = await harness();

    await expect(service.createPracticeSession(OTHER, lesson.id, lesson.objectiveIds[0], START_AT))
      .rejects.toThrow('lesson does not belong to student');
    await expect(service.createPracticeSession(STUDENT, lesson.id, 'P2-AS-999', START_AT))
      .rejects.toThrow('objective does not belong to lesson');
    await expect(service.createPracticeSession(STUDENT, lesson.id, lesson.objectiveIds[0], START_AT))
      .resolves.toEqual(practiceSession());
    expect(createPracticeSession).toHaveBeenCalledWith(lesson.id, lesson.objectiveIds[0], START_AT);
  });

  it('checks session/item ownership before revealing a hint or submitting an attempt', async () => {
    const { service, revealHint, submitAttempt } = await harness();
    const input: SubmitAttemptInput = {
      attemptId: 'attempt-1', sessionId: 'session-1', itemId: 'item-1', answerText: '12',
    };

    await expect(service.revealHint(OTHER, 'session-1', 'item-1', START_AT)).rejects.toThrow('practice session does not belong to student');
    expect(revealHint).not.toHaveBeenCalled();
    await expect(service.submitPracticeAttempt(OTHER, input, COMPLETE_AT)).rejects.toThrow('practice session does not belong to student');
    expect(submitAttempt).not.toHaveBeenCalled();

    await expect(service.revealHint(STUDENT, 'session-1', 'item-1', START_AT)).resolves.toBe('trusted hint');
    await expect(service.submitPracticeAttempt(STUDENT, input, COMPLETE_AT)).resolves.toEqual(attempt(input));
    expect(revealHint).toHaveBeenCalledWith('session-1', 'item-1', START_AT);
    expect(submitAttempt).toHaveBeenCalledWith(input, COMPLETE_AT);
  });
});
