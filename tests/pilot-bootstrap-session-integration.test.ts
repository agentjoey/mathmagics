import { describe, expect, it, vi } from 'vitest';
import { MemoryAdaptiveRepository } from '@/lib/adaptation';
import { MemoryLearningStateRepository } from '@/lib/learning';
import { PilotSessionService } from '@/lib/pilot';
import { PilotSetupService } from '@/lib/pilot/setup';
import { MemoryPlanningRepository, TeachingPlannerServiceImpl } from '@/lib/planning';
import type { PracticeService, SubmitAttemptInput } from '@/lib/practice';

const NOW = '2026-08-28T08:00:00.000Z';

describe('fresh pilot bootstrap -> first lesson', () => {
  it('starts the first lesson for the same freshly bootstrapped P3 student contract used in production', async () => {
    const learning = new MemoryLearningStateRepository();
    const planning = new MemoryPlanningRepository();
    const planner = new TeachingPlannerServiceImpl(learning, planning, {
      planId: () => 'plan-1',
      lessonId: (sequence) => `lesson-${sequence}`,
    });
    const setup = new PilotSetupService({ learning, planner, studentId: () => 'student-1' });

    await setup.create({
      displayName: 'Mia',
      levelId: 'P3',
      currentObjectiveId: 'P3-FRA-003',
      sessionsPerWeek: 4,
      minutesPerSession: 30,
    }, NOW);

    const adaptive = new MemoryAdaptiveRepository(planning);
    const practice: PracticeService = {
      preparePractice: vi.fn(),
      createPracticeSession: vi.fn(),
      revealHint: vi.fn(),
      submitAttempt: vi.fn(async (_input: SubmitAttemptInput) => { throw new Error('not used'); }),
    };
    const service = new PilotSessionService({
      planning,
      adaptive,
      practice,
      practiceOwnership: {
        getPracticeSession: async () => undefined,
        getPracticeItem: async () => undefined,
        listPracticeItems: async () => [],
      },
      clock: { now: () => NOW },
      ids: { executionEventId: (lessonId, type, at) => `${lessonId}:${type}:${at}` },
    });

    const started = await service.startNextLesson('student-1', NOW);

    expect(started.execution.status).toBe('STARTED');
    expect(started.lessonId).toBeTruthy();
    expect(started.objectiveIds.length).toBeGreaterThan(0);
  });
});
