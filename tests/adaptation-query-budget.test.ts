import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdaptiveLearningService, MemoryAdaptiveRepository } from '@/lib/adaptation';
import { MemoryMistakeRepository } from '@/lib/correction';
import { MemoryLearningStateRepository } from '@/lib/learning';
import { MemoryPlanningRepository } from '@/lib/planning';
import { MemoryPracticeRepository } from '@/lib/practice';
import { ProgressService } from '@/lib/progress';
import type { PerformanceRiskFacts, PerformanceRiskSnapshot } from '@/lib/progress';
import { MemoryStrategyRepository } from '@/lib/strategy';

const NOW = '2026-08-28T08:25:00.000Z';

class SnapshotRiskFacts implements PerformanceRiskFacts {
  snapshotCalls = 0;
  recurrenceCalls = 0;
  blockingCalls = 0;

  async snapshot(): Promise<PerformanceRiskSnapshot> {
    this.snapshotCalls += 1;
    return {
      recurrenceCount: () => 0,
      hasBlockingMistake: () => false,
    };
  }

  async recurrenceCount(): Promise<number> {
    this.recurrenceCalls += 1;
    return 0;
  }

  async hasBlockingMistake(): Promise<boolean> {
    this.blockingCalls += 1;
    return false;
  }
}

afterEach(() => vi.restoreAllMocks());

describe('AdaptiveLearningService query budget', () => {
  it('uses one batched progress projection and one cutoff-scoped risk snapshot for forward evaluation', async () => {
    const learning = new MemoryLearningStateRepository();
    const planning = new MemoryPlanningRepository();
    const practice = new MemoryPracticeRepository();
    const mistakes = new MemoryMistakeRepository();
    const strategy = new MemoryStrategyRepository();
    const adaptive = new MemoryAdaptiveRepository(planning);
    const riskFacts = new SnapshotRiskFacts();
    const studentId = 'adaptive-query-budget-student';
    const planId = 'adaptive-query-budget-plan';
    const lessonId = 'adaptive-query-budget-lesson';

    await learning.saveStudent({
      id: studentId,
      displayName: 'Query Budget Student',
      levelId: 'P2',
      learningMode: 'STRUCTURED_HOME_LEARNING',
      sessionsPerWeek: 1,
      minutesPerSession: 30,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await learning.setCurrentPosition({
      studentId,
      levelId: 'P2',
      objectiveId: 'P2-AS-001',
      recordedAt: NOW,
      source: 'MANUAL_SETUP',
    });
    await planning.createWeeklyPlan({
      id: planId,
      studentId,
      weekStart: '2026-08-24',
      sessionsPerWeek: 1,
      minutesPerSession: 30,
      createdAt: NOW,
    }, [{
      id: lessonId,
      weeklyPlanId: planId,
      studentId,
      sequence: 1,
      intent: 'LEARN',
      objectiveIds: ['P2-AS-001'],
      estimatedMinutes: 30,
      rationale: [{ code: 'CURRENT_POSITION', objectiveId: 'P2-AS-001' }],
      createdAt: NOW,
    }]);

    const batchSpy = vi.spyOn(ProgressService.prototype, 'getObjectivesProgress');
    const singleSpy = vi.spyOn(ProgressService.prototype, 'getObjectiveProgress');
    const service = new AdaptiveLearningService({
      learningRepository: learning,
      practiceRepository: practice,
      planningRepository: planning,
      mistakeRepository: mistakes,
      strategyRepository: strategy,
      adaptiveRepository: adaptive,
      performanceRiskFacts: riskFacts,
      clock: { now: () => NOW },
      ids: {
        decisionId: (sourceLessonId, cutoff) => `decision:${sourceLessonId}:${cutoff}`,
        replacementLessonId: (sourceLessonId, cutoff) => `replacement:${sourceLessonId}:${cutoff}`,
        supersessionId: (sourceLessonId) => `supersession:${sourceLessonId}`,
      },
    });

    const result = await service.evaluateNextPlannedLesson(studentId);

    expect(result?.decision.action).toBe('KEEP');
    expect(batchSpy).toHaveBeenCalledTimes(1);
    expect(singleSpy).not.toHaveBeenCalled();
    expect(riskFacts.snapshotCalls).toBe(1);
    expect(riskFacts.recurrenceCalls).toBe(0);
    expect(riskFacts.blockingCalls).toBe(0);
  });
});
