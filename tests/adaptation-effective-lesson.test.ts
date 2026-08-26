import { describe, expect, it } from 'vitest';
import { resolveEffectiveLesson } from '@/lib/adaptation/effective-lesson';
import { MemoryAdaptiveRepository } from '@/lib/adaptation/memory-repository';
import type { AdaptiveDecision, LessonSupersession } from '@/lib/adaptation/types';
import { MemoryPlanningRepository } from '@/lib/planning';
import type { DailyLesson, WeeklyPlan } from '@/lib/planning';

const plan: WeeklyPlan = {
  id: 'plan-effective', studentId: 'student-1', weekStart: '2026-08-24', sessionsPerWeek: 5, minutesPerSession: 30,
  createdAt: '2026-08-24T00:00:00.000Z',
};
const original: DailyLesson = {
  id: 'original', weeklyPlanId: plan.id, studentId: plan.studentId, sequence: 1, intent: 'PRACTICE',
  objectiveIds: ['P2-AS-002'], estimatedMinutes: 30,
  rationale: [{ code: 'CURRENT_POSITION', objectiveId: 'P2-AS-002' }], createdAt: plan.createdAt,
};
const replacement: DailyLesson = {
  ...original, id: 'replacement', intent: 'CORRECTION', createdAt: '2026-08-26T10:00:00.000Z',
};
const decision: AdaptiveDecision = {
  id: 'decision-effective', studentId: plan.studentId, sourceLessonId: original.id, action: 'SUPERSEDE',
  selectedIntent: 'CORRECTION', selectedObjectiveIds: ['P2-AS-002'], targetMistakeId: 'mistake-1',
  rationaleCodes: ['BLOCKING_MISTAKE'], policyVersion: 'adaptive-policy-v1',
  evaluatedAt: '2026-08-26T10:00:00.000Z', inputFactCutoff: '2026-08-26T10:00:00.000Z', createdAt: '2026-08-26T10:00:00.000Z',
};
const supersession: LessonSupersession = {
  id: 'sup-effective', studentId: plan.studentId, sourceLessonId: original.id, replacementLessonId: replacement.id,
  adaptiveDecisionId: decision.id, createdAt: decision.createdAt,
};

async function harness() {
  const planning = new MemoryPlanningRepository();
  await planning.createWeeklyPlan(plan, [original]);
  const adaptive = new MemoryAdaptiveRepository(planning);
  return { planning, adaptive };
}

describe('resolveEffectiveLesson', () => {
  it('returns a normal lesson unchanged when there is no supersession', async () => {
    const { planning, adaptive } = await harness();
    await expect(resolveEffectiveLesson(planning, adaptive, original.id)).resolves.toEqual({
      lesson: original, originalLessonId: original.id, adapted: false,
    });
  });

  it('resolves an original lesson to its replacement with audit identity', async () => {
    const { planning, adaptive } = await harness();
    await adaptive.commitSupersession({ decision, replacementLesson: replacement, supersession });
    await expect(resolveEffectiveLesson(planning, adaptive, original.id)).resolves.toEqual({
      lesson: replacement, originalLessonId: original.id, adapted: true, adaptiveDecisionId: decision.id,
    });
  });

  it('resolves direct replacement lookup to the same original/replacement pair', async () => {
    const { planning, adaptive } = await harness();
    await adaptive.commitSupersession({ decision, replacementLesson: replacement, supersession });
    await expect(resolveEffectiveLesson(planning, adaptive, replacement.id)).resolves.toEqual({
      lesson: replacement, originalLessonId: original.id, adapted: true, adaptiveDecisionId: decision.id,
    });
  });

  it('fails closed for an unknown lesson id', async () => {
    const { planning, adaptive } = await harness();
    await expect(resolveEffectiveLesson(planning, adaptive, 'missing')).rejects.toThrow('Unknown daily lesson id: missing');
  });
});
