import { describe, expect, it } from 'vitest';
import { MemoryAdaptiveRepository } from '@/lib/adaptation';
import type { AdaptiveDecision, LessonSupersession } from '@/lib/adaptation';
import { PilotReviewService } from '@/lib/pilot';
import { MemoryPlanningRepository } from '@/lib/planning';
import type { DailyLesson, WeeklyPlan } from '@/lib/planning';
import type { ParentProgressView } from '@/lib/progress';

const STUDENT_ID = 'pilot-student';
const CUTOFF = '2026-08-26T10:00:00.000Z';

type ReviewLesson = {
  lessonId: string;
  adapted: boolean;
  execution: { status: string; actualMinutes?: number };
};

type ReviewDecision = {
  decisionId: string;
  createdAt: string;
};

type ReviewShape = {
  evaluatedAt: string;
  progress: { evaluatedAt: string };
  lessons: ReviewLesson[];
  recentAdaptiveDecisions: ReviewDecision[];
};

const plan: WeeklyPlan = {
  id: 'pilot-plan',
  studentId: STUDENT_ID,
  weekStart: '2026-08-24',
  sessionsPerWeek: 5,
  minutesPerSession: 30,
  createdAt: '2026-08-24T00:00:00.000Z',
};

const lesson1: DailyLesson = {
  id: 'lesson-1',
  weeklyPlanId: plan.id,
  studentId: STUDENT_ID,
  sequence: 1,
  intent: 'PRACTICE',
  objectiveIds: ['P2-AS-002'],
  estimatedMinutes: 30,
  rationale: [{ code: 'CURRENT_POSITION', objectiveId: 'P2-AS-002' }],
  createdAt: '2026-08-24T00:00:00.000Z',
};

const lesson2: DailyLesson = {
  ...lesson1,
  id: 'lesson-2',
  sequence: 2,
};

const futureLesson: DailyLesson = {
  ...lesson1,
  id: 'future-created-lesson',
  sequence: 3,
  createdAt: '2026-08-26T11:00:00.000Z',
};

const replacement: DailyLesson = {
  ...lesson2,
  id: 'replacement-lesson',
  intent: 'CORRECTION',
  createdAt: '2026-08-26T09:00:00.000Z',
};

function keepDecision(id: string, cutoff: string): AdaptiveDecision {
  return {
    id,
    studentId: STUDENT_ID,
    sourceLessonId: lesson1.id,
    action: 'KEEP',
    selectedIntent: lesson1.intent,
    selectedObjectiveIds: [...lesson1.objectiveIds],
    rationaleCodes: ['NO_HIGHER_PRIORITY_NEED'],
    policyVersion: 'adaptive-policy-v1',
    evaluatedAt: cutoff,
    inputFactCutoff: cutoff,
    createdAt: cutoff,
  };
}

const supersedeDecision: AdaptiveDecision = {
  id: 'decision-supersede',
  studentId: STUDENT_ID,
  sourceLessonId: lesson2.id,
  action: 'SUPERSEDE',
  selectedIntent: 'CORRECTION',
  selectedObjectiveIds: [...lesson2.objectiveIds],
  targetMistakeId: 'mistake-1',
  rationaleCodes: ['BLOCKING_MISTAKE'],
  policyVersion: 'adaptive-policy-v1',
  evaluatedAt: '2026-08-26T09:00:00.000Z',
  inputFactCutoff: '2026-08-26T09:00:00.000Z',
  createdAt: '2026-08-26T09:00:00.000Z',
};

const supersession: LessonSupersession = {
  id: 'supersession-1',
  studentId: STUDENT_ID,
  sourceLessonId: lesson2.id,
  replacementLessonId: replacement.id,
  adaptiveDecisionId: supersedeDecision.id,
  createdAt: supersedeDecision.createdAt,
};

function parentView(evaluatedAt: string): ParentProgressView {
  return {
    studentId: STUDENT_ID,
    levelId: 'P2',
    evaluatedAt,
    summary: {
      objectivesIntroduced: 0,
      objectivesPractised: 0,
      objectivesMastered: 0,
      strugglingObjectives: 0,
      reviewDueObjectives: 0,
      activeMistakes: 0,
      recurrentMistakes: 0,
      observedStrategies: 0,
      developingStrategies: 0,
      reliableStrategies: 0,
    },
    topics: [],
    strategies: [],
    mistakes: { active: [], resolved: [], recurring: [] },
    nextLesson: null,
  };
}

async function harness() {
  const planning = new MemoryPlanningRepository();
  await planning.createWeeklyPlan(plan, [lesson1, lesson2, futureLesson]);
  await planning.appendExecutionEvent({
    id: 'event-start', lessonId: lesson1.id, studentId: STUDENT_ID,
    type: 'STARTED', occurredAt: '2026-08-26T08:00:00.000Z',
  });
  await planning.appendExecutionEvent({
    id: 'event-complete', lessonId: lesson1.id, studentId: STUDENT_ID,
    type: 'COMPLETED', occurredAt: '2026-08-26T09:00:00.000Z', actualMinutes: 27,
  });

  const adaptive = new MemoryAdaptiveRepository(planning);
  await adaptive.appendKeepDecision(keepDecision('decision-before', '2026-08-26T08:30:00.000Z'));
  await adaptive.commitSupersession({
    decision: supersedeDecision,
    replacementLesson: replacement,
    supersession,
  });
  await adaptive.appendKeepDecision(keepDecision('decision-after', '2026-08-26T11:00:00.000Z'));

  const service = new PilotReviewService({
    parentProgress: { getView: async (_studentId: string, evaluatedAt: string) => parentView(evaluatedAt) },
    planning,
    adaptive,
  });
  return { service };
}

describe('PilotReviewService', () => {
  it('reconstructs only facts available at the historical cutoff', async () => {
    const { service } = await harness();
    const review = await service.getReview(STUDENT_ID, CUTOFF) as ReviewShape;

    expect(review.progress.evaluatedAt).toBe(review.evaluatedAt);
    expect(review.lessons.find((lesson: ReviewLesson) => lesson.lessonId === lesson1.id)?.execution).toMatchObject({
      status: 'COMPLETED',
      actualMinutes: 27,
    });
    expect(review.lessons.some((lesson: ReviewLesson) => lesson.lessonId === futureLesson.id)).toBe(false);
    expect(review.lessons.find((lesson: ReviewLesson) => lesson.lessonId === replacement.id)?.adapted).toBe(true);
    expect(review.recentAdaptiveDecisions.map((decision: ReviewDecision) => decision.decisionId)).toEqual([
      'decision-before',
      'decision-supersede',
    ]);
    expect(review.recentAdaptiveDecisions.every((decision: ReviewDecision) => decision.createdAt <= review.evaluatedAt)).toBe(true);
  });

  it('returns a read-only shaped payload without private authority fields', async () => {
    const { service } = await harness();
    const serialized = JSON.stringify(await service.getReview(STUDENT_ID, CUTOFF));

    for (const forbidden of ['answerSpec', 'solutionOutline', 'rawAttempt', 'providerReasoning', 'submitAttempt', 'appendExecutionEvent']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('rejects an invalid historical cutoff', async () => {
    const { service } = await harness();
    await expect(service.getReview(STUDENT_ID, 'not-a-date')).rejects.toThrow('evaluatedAt must be a valid ISO date-time string');
  });
});
