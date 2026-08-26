import { describe, expect, it } from 'vitest';
import {
  AdaptiveLearningService,
  MemoryAdaptiveRepository,
} from '@/lib/adaptation';
import type { AdaptiveServiceDependencies } from '@/lib/adaptation';
import { MemoryMistakeRepository } from '@/lib/correction';
import { MemoryLearningStateRepository } from '@/lib/learning';
import { MemoryPlanningRepository } from '@/lib/planning';
import type { DailyLesson, WeeklyPlan } from '@/lib/planning';
import { MemoryPracticeRepository } from '@/lib/practice';
import { MemoryStrategyRepository } from '@/lib/strategy';
import type { PerformanceRiskFacts } from '@/lib/progress';

const NOW = '2026-08-26T12:00:00.000Z';

const noRisk: PerformanceRiskFacts = {
  recurrenceCount: async () => 0,
  hasBlockingMistake: async () => false,
};

describe('Phase 7 adaptive lesson service E2E', () => {
  it('turns a trusted blocking mistake into one immutable correction replacement', async () => {
    const studentId = 'student-adaptive-e2e';
    const plan: WeeklyPlan = {
      id: 'plan-adaptive-e2e',
      studentId,
      weekStart: '2026-08-24',
      sessionsPerWeek: 5,
      minutesPerSession: 30,
      createdAt: '2026-08-26T08:00:00.000Z',
    };
    const source: DailyLesson = {
      id: 'lesson-adaptive-e2e',
      weeklyPlanId: plan.id,
      studentId,
      sequence: 1,
      intent: 'PRACTICE',
      objectiveIds: ['P2-AS-002'],
      estimatedMinutes: 30,
      rationale: [{ code: 'CURRENT_POSITION', objectiveId: 'P2-AS-002' }],
      createdAt: plan.createdAt,
    };

    const learning = new MemoryLearningStateRepository();
    const planning = new MemoryPlanningRepository();
    const practice = new MemoryPracticeRepository();
    const mistakes = new MemoryMistakeRepository();
    const strategy = new MemoryStrategyRepository();
    const adaptive = new MemoryAdaptiveRepository(planning);

    await learning.saveStudent({
      id: studentId,
      displayName: 'Learner',
      levelId: 'P2',
      learningMode: 'STRUCTURED_HOME_LEARNING',
      sessionsPerWeek: 5,
      minutesPerSession: 30,
      createdAt: plan.createdAt,
      updatedAt: plan.createdAt,
    });
    await learning.setCurrentPosition({
      studentId,
      levelId: 'P2',
      objectiveId: 'P2-AS-002',
      recordedAt: plan.createdAt,
      source: 'MANUAL_SETUP',
    });
    await planning.createWeeklyPlan(plan, [source]);

    await mistakes.appendMistake({
      id: 'mistake-prerequisite-e2e',
      studentId,
      objectiveId: 'P2-AS-001',
      initialAttemptId: 'attempt-prerequisite-e2e',
      initialDiagnosisTarget: { kind: 'GENERIC', code: 'PROCEDURE_ERROR' },
      diagnosisPolicyVersion: 'mistake-diagnosis-v1',
      firstObservedAt: '2026-08-26T11:00:00.000Z',
      createdAt: '2026-08-26T11:00:00.000Z',
    });
    await mistakes.appendEvent({
      id: 'event-confirm-prerequisite-e2e',
      mistakeId: 'mistake-prerequisite-e2e',
      type: 'DIAGNOSIS_CONFIRMED',
      payload: { target: { kind: 'GENERIC', code: 'PROCEDURE_ERROR' } },
      actorKind: 'SYSTEM',
      policyVersion: 'mistake-diagnosis-v1',
      occurredAt: '2026-08-26T11:01:00.000Z',
    });

    const dependencies: AdaptiveServiceDependencies = {
      learningRepository: learning,
      practiceRepository: practice,
      planningRepository: planning,
      mistakeRepository: mistakes,
      strategyRepository: strategy,
      adaptiveRepository: adaptive,
      performanceRiskFacts: noRisk,
      clock: { now: () => NOW },
      ids: {
        decisionId: (sourceLessonId, cutoff) => `decision:${sourceLessonId}:${cutoff}`,
        replacementLessonId: (sourceLessonId, cutoff) => `replacement:${sourceLessonId}:${cutoff}`,
        supersessionId: (sourceLessonId) => `supersession:${sourceLessonId}`,
      },
    };
    const service = new AdaptiveLearningService(dependencies);

    const first = await service.evaluateLesson(source.id, studentId);
    expect(first.decision.action).toBe('SUPERSEDE');
    expect(first.decision.selectedIntent).toBe('CORRECTION');
    expect(first.decision.targetMistakeId).toBe('mistake-prerequisite-e2e');
    expect(first.effectiveLesson.adapted).toBe(true);
    expect(first.effectiveLesson.lesson.sequence).toBe(source.sequence);

    const replacementId = first.effectiveLesson.lesson.id;
    const fromReplacement = await service.evaluateLesson(replacementId, studentId);
    const fromOriginal = await service.evaluateLesson(source.id, studentId);
    expect(fromReplacement).toEqual(first);
    expect(fromOriginal).toEqual(first);
    expect(await adaptive.listDecisionsForSourceLesson(source.id)).toHaveLength(1);
    expect(await adaptive.listDecisionsForSourceLesson(replacementId)).toEqual([]);
    expect((await planning.listDailyLessonsForPlan(plan.id)).map((lesson) => lesson.id))
      .toEqual([source.id, replacementId]);
  });
});
