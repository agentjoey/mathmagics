import { describe, expect, it, vi } from 'vitest';
import { MemoryAdaptiveRepository } from '@/lib/adaptation';
import { PilotSessionService } from '@/lib/pilot';
import { MemoryPlanningRepository } from '@/lib/planning';
import type { DailyLesson, WeeklyPlan } from '@/lib/planning';
import type { PracticeItem, PracticeService, PracticeSession } from '@/lib/practice';

const STUDENT = 'pilot-student';
const NOW = '2026-08-28T08:00:00.000Z';

const plan: WeeklyPlan = {
  id: 'pilot-plan', studentId: STUDENT, weekStart: '2026-08-24', sessionsPerWeek: 5, minutesPerSession: 30,
  createdAt: '2026-08-24T00:00:00.000Z',
};
const lesson: DailyLesson = {
  id: 'lesson-1', weeklyPlanId: plan.id, studentId: STUDENT, sequence: 1, intent: 'PRACTICE',
  objectiveIds: ['P2-MD-001'], estimatedMinutes: 30,
  rationale: [{ code: 'CURRENT_POSITION', objectiveId: 'P2-MD-001' }], createdAt: plan.createdAt,
};
const session: PracticeSession = {
  id: 'session-1', studentId: STUDENT, lessonId: lesson.id, objectiveId: lesson.objectiveIds[0],
  policyVersion: 'practice-v1', createdAt: NOW,
};
const item: PracticeItem = {
  id: 'item-1', sessionId: session.id, studentId: STUDENT, objectiveId: lesson.objectiveIds[0], sequence: 1,
  difficultyBand: 'CORE',
  problemSpec: { kind: 'ARITHMETIC', operation: 'MULTIPLY', left: 3, right: 4 },
  answerSpec: { kind: 'INTEGER', value: '12' },
  prompt: '3 × 4 = ?',
  hint: '想一想 3 组 4。',
  solutionOutline: ['3 × 4 = 12'],
  generator: 'fixture', generatorVersion: 'fixture-v1', createdAt: NOW,
};

describe('pilot practice session transport', () => {
  it('returns generated items through the existing student-safe practice projection only', async () => {
    const planning = new MemoryPlanningRepository();
    await planning.createWeeklyPlan(plan, [lesson]);
    const practice: PracticeService = {
      preparePractice: vi.fn(),
      createPracticeSession: vi.fn(async () => session),
      revealHint: vi.fn(),
      submitAttempt: vi.fn(),
    };
    const service = new PilotSessionService({
      planning,
      adaptive: new MemoryAdaptiveRepository(planning),
      practice,
      practiceOwnership: {
        getPracticeSession: async () => session,
        getPracticeItem: async () => item,
        listPracticeItems: async () => [item],
      },
      clock: { now: () => NOW },
      ids: { executionEventId: (lessonId, type, at) => `${lessonId}:${type}:${at}` },
    });

    const view = await service.createPracticeSession(STUDENT, lesson.id, lesson.objectiveIds[0], NOW);
    expect(view).toEqual({
      session: {
        id: session.id,
        lessonId: session.lessonId,
        objectiveId: session.objectiveId,
        createdAt: session.createdAt,
      },
      items: [{
        id: item.id,
        sessionId: item.sessionId,
        objectiveId: item.objectiveId,
        sequence: item.sequence,
        difficultyBand: item.difficultyBand,
        prompt: item.prompt,
      }],
    });
    expect(JSON.stringify(view)).not.toMatch(/answerSpec|solutionOutline|problemSpec|generatorVersion/);
  });
});
