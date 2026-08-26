import { describe, expect, it } from 'vitest';
import {
  AdaptiveLearningService,
  CorrectionPerformanceRiskFacts,
  MemoryAdaptiveRepository,
} from '@/lib/adaptation';
import { MemoryMistakeRepository } from '@/lib/correction';
import { MemoryLearningStateRepository } from '@/lib/learning';
import { MemoryPlanningRepository } from '@/lib/planning';
import type { DailyLesson, WeeklyPlan } from '@/lib/planning';
import { MemoryPracticeRepository } from '@/lib/practice';
import { MemoryStrategyRepository } from '@/lib/strategy';

const STUDENT = 'student-starvation-service';
const OBJECTIVE = 'P2-AS-002';
const BASE = Date.parse('2026-08-26T09:00:00.000Z');
const at = (minute: number) => new Date(BASE + minute * 60_000).toISOString();

async function seedMastery(
  learning: MemoryLearningStateRepository,
  objectiveId: string,
): Promise<void> {
  const types = ['independent_correct', 'independent_correct', 'application_correct'] as const;
  for (const [index, type] of types.entries()) {
    await learning.appendEvidence({
      id: `mastery:${objectiveId}:${index + 1}`,
      studentId: STUDENT,
      objectiveId,
      type,
      observedAt: at(index),
      recordedAt: at(index),
      origin: { kind: 'PRACTICE', refId: `historical:${objectiveId}:${index + 1}` },
    });
  }
}

describe('AdaptiveLearningService starvation guard E2E', () => {
  it('resumes forward practice after two completed remediation lessons when the remaining mistake is not blocking', async () => {
    const learning = new MemoryLearningStateRepository();
    const planning = new MemoryPlanningRepository();
    const practice = new MemoryPracticeRepository();
    const mistakes = new MemoryMistakeRepository();
    const strategy = new MemoryStrategyRepository();
    const adaptive = new MemoryAdaptiveRepository(planning);

    await learning.saveStudent({
      id: STUDENT,
      displayName: 'Starvation Guard Learner',
      levelId: 'P2',
      learningMode: 'STRUCTURED_HOME_LEARNING',
      sessionsPerWeek: 3,
      minutesPerSession: 30,
      createdAt: at(0),
      updatedAt: at(0),
    });
    await learning.setCurrentPosition({
      studentId: STUDENT,
      levelId: 'P2',
      objectiveId: OBJECTIVE,
      recordedAt: at(0),
      source: 'MANUAL_SETUP',
    });
    await seedMastery(learning, 'P2-AS-001');
    await learning.appendEvidence({
      id: 'current-developing',
      studentId: STUDENT,
      objectiveId: OBJECTIVE,
      type: 'independent_correct',
      observedAt: at(3),
      recordedAt: at(3),
      origin: { kind: 'PRACTICE', refId: 'current-history' },
    });

    const plan: WeeklyPlan = {
      id: 'starvation-plan',
      studentId: STUDENT,
      weekStart: '2026-08-24',
      sessionsPerWeek: 3,
      minutesPerSession: 30,
      createdAt: at(4),
    };
    const lessons: DailyLesson[] = [
      { id: 'remediation-1', weeklyPlanId: plan.id, studentId: STUDENT, sequence: 1, intent: 'CORRECTION', objectiveIds: [OBJECTIVE], estimatedMinutes: 30, rationale: [{ code: 'CURRENT_POSITION', objectiveId: OBJECTIVE }], createdAt: at(4) },
      { id: 'remediation-2', weeklyPlanId: plan.id, studentId: STUDENT, sequence: 2, intent: 'REVIEW', objectiveIds: [OBJECTIVE], estimatedMinutes: 30, rationale: [{ code: 'CURRENT_POSITION', objectiveId: OBJECTIVE }], createdAt: at(4) },
      { id: 'source-review', weeklyPlanId: plan.id, studentId: STUDENT, sequence: 3, intent: 'REVIEW', objectiveIds: [OBJECTIVE], estimatedMinutes: 30, rationale: [{ code: 'CURRENT_POSITION', objectiveId: OBJECTIVE }], createdAt: at(4) },
    ];
    await planning.createWeeklyPlan(plan, lessons);
    for (const [index, lessonId] of ['remediation-1', 'remediation-2'].entries()) {
      await planning.appendExecutionEvent({ id: `start-${index}`, lessonId, studentId: STUDENT, type: 'STARTED', occurredAt: at(5 + index * 2) });
      await planning.appendExecutionEvent({ id: `complete-${index}`, lessonId, studentId: STUDENT, type: 'COMPLETED', occurredAt: at(6 + index * 2), actualMinutes: 20 });
    }

    await mistakes.appendMistake({
      id: 'normal-mistake',
      studentId: STUDENT,
      objectiveId: OBJECTIVE,
      initialAttemptId: 'unlinked-root-attempt',
      initialDiagnosisTarget: { kind: 'GENERIC', code: 'PROCEDURE_ERROR' },
      diagnosisPolicyVersion: 'mistake-diagnosis-v1',
      firstObservedAt: at(9),
      createdAt: at(9),
    });
    await mistakes.appendEvent({
      id: 'confirm-normal-mistake',
      mistakeId: 'normal-mistake',
      type: 'DIAGNOSIS_CONFIRMED',
      payload: { target: { kind: 'GENERIC', code: 'PROCEDURE_ERROR' } },
      actorKind: 'SYSTEM',
      policyVersion: 'mistake-diagnosis-v1',
      occurredAt: at(10),
    });

    const riskFacts = new CorrectionPerformanceRiskFacts({ mistakes, practice, learning });
    const service = new AdaptiveLearningService({
      learningRepository: learning,
      practiceRepository: practice,
      planningRepository: planning,
      mistakeRepository: mistakes,
      strategyRepository: strategy,
      adaptiveRepository: adaptive,
      performanceRiskFacts: riskFacts,
      clock: { now: () => at(11) },
      ids: {
        decisionId: (sourceLessonId, cutoff) => `decision:${sourceLessonId}:${cutoff}`,
        replacementLessonId: (sourceLessonId, cutoff) => `replacement:${sourceLessonId}:${cutoff}`,
        supersessionId: (sourceLessonId) => `supersession:${sourceLessonId}`,
      },
    });

    const result = await service.evaluateLesson('source-review', STUDENT);
    expect(result.decision).toMatchObject({
      action: 'SUPERSEDE',
      selectedIntent: 'PRACTICE',
      selectedObjectiveIds: [OBJECTIVE],
    });
    expect(result.decision.rationaleCodes).toEqual(expect.arrayContaining(['STARVATION_GUARD_FORWARD_PROGRESS']));
    expect(result.decision.targetMistakeId).toBeUndefined();
    expect(result.effectiveLesson.lesson.intent).toBe('PRACTICE');
  });
});
