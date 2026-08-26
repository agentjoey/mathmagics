import { describe, expect, it } from 'vitest';
import { MemoryAdaptiveRepository } from '@/lib/adaptation/memory-repository';
import type { AdaptiveDecision, LessonSupersession } from '@/lib/adaptation/types';
import { MemoryPlanningRepository } from '@/lib/planning';
import type { DailyLesson, WeeklyPlan } from '@/lib/planning';

const PLAN: WeeklyPlan = {
  id: 'plan-1', studentId: 'student-1', weekStart: '2026-08-24', sessionsPerWeek: 5, minutesPerSession: 30,
  createdAt: '2026-08-24T00:00:00.000Z',
};
const SOURCE: DailyLesson = {
  id: 'lesson-source', weeklyPlanId: PLAN.id, studentId: PLAN.studentId, sequence: 1, intent: 'PRACTICE',
  objectiveIds: ['P2-AS-002'], estimatedMinutes: 30,
  rationale: [{ code: 'CURRENT_POSITION', objectiveId: 'P2-AS-002' }], createdAt: PLAN.createdAt,
};

function keepDecision(id: string, cutoff: string): AdaptiveDecision {
  return {
    id, studentId: PLAN.studentId, sourceLessonId: SOURCE.id, action: 'KEEP', selectedIntent: SOURCE.intent,
    selectedObjectiveIds: [...SOURCE.objectiveIds], rationaleCodes: ['NO_HIGHER_PRIORITY_NEED'],
    policyVersion: 'adaptive-policy-v1', evaluatedAt: cutoff, inputFactCutoff: cutoff, createdAt: cutoff,
  };
}

function supersedeDecision(id = 'decision-super'): AdaptiveDecision {
  return {
    id, studentId: PLAN.studentId, sourceLessonId: SOURCE.id, action: 'SUPERSEDE', selectedIntent: 'CORRECTION',
    selectedObjectiveIds: ['P2-AS-002'], targetMistakeId: 'mistake-1', rationaleCodes: ['BLOCKING_MISTAKE'],
    policyVersion: 'adaptive-policy-v1', evaluatedAt: '2026-08-26T10:00:00.000Z', inputFactCutoff: '2026-08-26T10:00:00.000Z',
    createdAt: '2026-08-26T10:00:00.000Z',
  };
}

function replacement(id = 'lesson-replacement'): DailyLesson {
  return {
    ...SOURCE, id, intent: 'CORRECTION', objectiveIds: ['P2-AS-002'],
    rationale: structuredClone(SOURCE.rationale), createdAt: '2026-08-26T10:00:00.000Z',
  };
}

function supersession(decisionId = 'decision-super', replacementId = 'lesson-replacement'): LessonSupersession {
  return {
    id: `sup-${decisionId}`, studentId: PLAN.studentId, sourceLessonId: SOURCE.id, replacementLessonId: replacementId,
    adaptiveDecisionId: decisionId, createdAt: '2026-08-26T10:00:00.000Z',
  };
}

async function harness() {
  const planning = new MemoryPlanningRepository();
  await planning.createWeeklyPlan(PLAN, [SOURCE]);
  const adaptive = new MemoryAdaptiveRepository(planning);
  return { planning, adaptive };
}

describe('MemoryAdaptiveRepository', () => {
  it('allows multiple KEEP decisions at distinct cutoffs and exact replay is idempotent', async () => {
    const { adaptive } = await harness();
    const first = keepDecision('keep-1', '2026-08-26T08:00:00.000Z');
    const second = keepDecision('keep-2', '2026-08-26T09:00:00.000Z');
    await adaptive.appendKeepDecision(first);
    await adaptive.appendKeepDecision(structuredClone(first));
    await adaptive.appendKeepDecision(second);

    expect((await adaptive.listDecisionsForSourceLesson(SOURCE.id)).map((item) => item.id)).toEqual(['keep-1', 'keep-2']);
    expect(await adaptive.getDecisionByEvaluationKey(PLAN.studentId, SOURCE.id, first.inputFactCutoff, first.policyVersion)).toEqual(first);
  });

  it('rejects conflicting reuse of an evaluation key', async () => {
    const { adaptive } = await harness();
    const first = keepDecision('keep-1', '2026-08-26T08:00:00.000Z');
    await adaptive.appendKeepDecision(first);
    await expect(adaptive.appendKeepDecision({ ...first, id: 'different-id', rationaleCodes: ['REVIEW_DUE'] }))
      .rejects.toThrow('adaptive evaluation key already exists with different content');
  });

  it('atomically adopts one replacement with the same logical sequence as its source', async () => {
    const { planning, adaptive } = await harness();
    const decision = supersedeDecision();
    const next = replacement();
    const link = supersession();
    await adaptive.commitSupersession({ decision, replacementLesson: next, supersession: link });

    expect(await adaptive.getSupersessionForSourceLesson(SOURCE.id)).toEqual(link);
    expect(await adaptive.getSupersessionByReplacementLesson(next.id)).toEqual(link);
    expect((await planning.listDailyLessonsForPlan(PLAN.id)).map((lesson) => [lesson.id, lesson.sequence]))
      .toEqual([[SOURCE.id, 1], [next.id, 1]]);
  });

  it('treats an exact SUPERSEDE replay as idempotent', async () => {
    const { planning, adaptive } = await harness();
    const decision = supersedeDecision();
    const next = replacement();
    const link = supersession();
    await adaptive.commitSupersession({ decision, replacementLesson: next, supersession: link });
    await adaptive.commitSupersession({
      decision: structuredClone(decision),
      replacementLesson: structuredClone(next),
      supersession: structuredClone(link),
    });

    expect(await adaptive.getSupersessionForSourceLesson(SOURCE.id)).toEqual(link);
    expect((await adaptive.listDecisionsForSourceLesson(SOURCE.id)).map((item) => item.id)).toEqual([decision.id]);
    expect((await planning.listDailyLessonsForPlan(PLAN.id)).map((lesson) => lesson.id)).toEqual([SOURCE.id, next.id]);
  });

  it('prevents a second replacement and prevents replacement chains', async () => {
    const { planning, adaptive } = await harness();
    const firstDecision = supersedeDecision();
    const firstReplacement = replacement();
    await adaptive.commitSupersession({ decision: firstDecision, replacementLesson: firstReplacement, supersession: supersession() });

    await expect(adaptive.commitSupersession({
      decision: { ...firstDecision, id: 'decision-second', inputFactCutoff: '2026-08-26T11:00:00.000Z', evaluatedAt: '2026-08-26T11:00:00.000Z', createdAt: '2026-08-26T11:00:00.000Z' },
      replacementLesson: replacement('lesson-second'),
      supersession: { ...supersession('decision-second', 'lesson-second'), id: 'sup-second', adaptiveDecisionId: 'decision-second' },
    })).rejects.toThrow('source lesson already has a supersession');

    const chainedDecision: AdaptiveDecision = {
      ...firstDecision, id: 'decision-chain', sourceLessonId: firstReplacement.id,
      inputFactCutoff: '2026-08-26T12:00:00.000Z', evaluatedAt: '2026-08-26T12:00:00.000Z', createdAt: '2026-08-26T12:00:00.000Z',
    };
    const chainedReplacement = { ...firstReplacement, id: 'lesson-chain', createdAt: '2026-08-26T12:00:00.000Z' };
    const chainedSupersession: LessonSupersession = {
      id: 'sup-chain', studentId: PLAN.studentId, sourceLessonId: firstReplacement.id, replacementLessonId: chainedReplacement.id,
      adaptiveDecisionId: chainedDecision.id, createdAt: chainedDecision.createdAt,
    };
    await expect(adaptive.commitSupersession({ decision: chainedDecision, replacementLesson: chainedReplacement, supersession: chainedSupersession }))
      .rejects.toThrow('replacement lesson cannot be superseded');
    expect(await planning.getDailyLesson('lesson-chain')).toBeUndefined();
  });

  it('returns defensive clones', async () => {
    const { adaptive } = await harness();
    const decision = keepDecision('keep-1', '2026-08-26T08:00:00.000Z');
    await adaptive.appendKeepDecision(decision);
    const returned = await adaptive.listDecisionsForSourceLesson(SOURCE.id);
    returned[0]!.selectedObjectiveIds[0] = 'tampered';
    expect((await adaptive.listDecisionsForSourceLesson(SOURCE.id))[0]!.selectedObjectiveIds[0]).toBe('P2-AS-002');
  });
});
