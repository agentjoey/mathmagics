import { describe, expect, it } from 'vitest';
import { listAdaptiveCandidates } from '@/lib/adaptation/candidates';
import { selectAdaptiveRecommendation } from '@/lib/adaptation/policy';
import { deriveStarvationGuard } from '@/lib/adaptation/starvation';
import type { DailyLesson } from '@/lib/planning';

const reviewSource: DailyLesson = {
  id: 'review-source',
  weeklyPlanId: 'plan-1',
  studentId: 'student-1',
  sequence: 3,
  intent: 'REVIEW',
  objectiveIds: ['P2-MD-001'],
  estimatedMinutes: 30,
  rationale: [{ code: 'REVIEW_DUE', objectiveId: 'P2-MD-001' }],
  createdAt: '2026-08-26T00:00:00.000Z',
};

const twoCompletedRemediation = [
  { intent: 'CORRECTION' as const, status: 'COMPLETED' as const, effective: true },
  { intent: 'REVIEW' as const, status: 'COMPLETED' as const, effective: true },
];

describe('starvation guard', () => {
  it('forces a READY forward candidate after two completed effective remediation lessons', () => {
    const candidates = listAdaptiveCandidates({
      mistakes: [{ mistakeId: 'normal', objectiveId: 'P2-AS-002', priority: 'NORMAL', recurrent: false }],
      prerequisites: [],
      reviews: [],
      current: { objectiveId: 'P2-AS-002', mastery: 'DEVELOPING', reviewDue: false, performance: 'UNSTABLE' },
      next: [],
    });
    const guard = deriveStarvationGuard(twoCompletedRemediation, candidates);
    expect(guard).toBe(true);

    expect(selectAdaptiveRecommendation(reviewSource, candidates, guard)).toMatchObject({
      action: 'SUPERSEDE',
      intent: 'PRACTICE',
      objectiveIds: ['P2-AS-002'],
      rationaleCodes: expect.arrayContaining(['STARVATION_GUARD_FORWARD_PROGRESS']),
    });
  });

  it('allows BLOCKING correction to bypass the guard', () => {
    const candidates = listAdaptiveCandidates({
      mistakes: [{ mistakeId: 'blocking', objectiveId: 'P2-AS-002', priority: 'BLOCKING', recurrent: true }],
      prerequisites: [],
      reviews: [],
      current: { objectiveId: 'P2-AS-002', mastery: 'DEVELOPING', reviewDue: false, performance: 'UNSTABLE' },
      next: [],
    });
    const guard = deriveStarvationGuard(twoCompletedRemediation, candidates);
    expect(guard).toBe(false);
    expect(selectAdaptiveRecommendation(reviewSource, candidates, guard)).toMatchObject({
      action: 'SUPERSEDE', intent: 'CORRECTION', targetMistakeId: 'blocking',
    });
  });

  it('allows a BLOCKED prerequisite to bypass the guard', () => {
    const candidates = listAdaptiveCandidates({
      mistakes: [],
      prerequisites: [{ objectiveId: 'P2-AS-001', mastery: 'DEVELOPING', reviewDue: false, targetObjectiveId: 'P2-AS-002', targetReadiness: 'BLOCKED' }],
      reviews: [],
      current: { objectiveId: 'P2-AS-002', mastery: 'DEVELOPING', reviewDue: false, performance: 'UNSTABLE' },
      next: [],
    });
    expect(deriveStarvationGuard(twoCompletedRemediation, candidates)).toBe(false);
  });

  it('counts only effective COMPLETED lessons', () => {
    const candidates = listAdaptiveCandidates({
      mistakes: [{ mistakeId: 'normal', objectiveId: 'P2-AS-002', priority: 'NORMAL', recurrent: false }],
      prerequisites: [], reviews: [],
      current: { objectiveId: 'P2-AS-002', mastery: 'DEVELOPING', reviewDue: false, performance: 'UNSTABLE' }, next: [],
    });
    expect(deriveStarvationGuard([
      { intent: 'CORRECTION', status: 'COMPLETED', effective: true },
      { intent: 'REVIEW', status: 'SKIPPED', effective: true },
      { intent: 'REVIEW', status: 'COMPLETED', effective: false },
    ], candidates)).toBe(false);
  });
});
