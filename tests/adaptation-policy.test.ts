import { describe, expect, it } from 'vitest';
import { listAdaptiveCandidates } from '@/lib/adaptation/candidates';
import { selectAdaptiveRecommendation } from '@/lib/adaptation/policy';
import type { AdaptiveCandidateInput } from '@/lib/adaptation/candidates';
import type { DailyLesson } from '@/lib/planning';

const sourceLesson: DailyLesson = {
  id: 'lesson-source',
  weeklyPlanId: 'plan-1',
  studentId: 'student-1',
  sequence: 1,
  intent: 'LEARN',
  objectiveIds: ['P2-AS-002'],
  estimatedMinutes: 30,
  rationale: [{ code: 'CURRENT_POSITION', objectiveId: 'P2-AS-002' }],
  createdAt: '2026-08-26T00:00:00.000Z',
};

function baseInput(overrides: Partial<AdaptiveCandidateInput> = {}): AdaptiveCandidateInput {
  return {
    mistakes: [],
    prerequisites: [],
    reviews: [],
    current: undefined,
    next: [],
    ...overrides,
  };
}

describe('adaptive candidate construction and ranking', () => {
  it('orders exact Phase 7 priority classes', () => {
    const candidates = listAdaptiveCandidates(baseInput({
      mistakes: [
        { mistakeId: 'normal', objectiveId: 'P2-AS-002', priority: 'NORMAL', recurrent: false },
        { mistakeId: 'blocking', objectiveId: 'P2-AS-002', priority: 'BLOCKING', recurrent: true },
      ],
      prerequisites: [{ objectiveId: 'P2-AS-001', mastery: 'DEVELOPING', reviewDue: false, targetObjectiveId: 'P2-AS-002', targetReadiness: 'BLOCKED' }],
      reviews: [{ objectiveId: 'P2-MD-001', mastery: 'MASTERED', reviewDue: true, performance: 'STRUGGLING' }],
      current: { objectiveId: 'P2-MD-002', mastery: 'DEVELOPING', reviewDue: false, performance: 'STRUGGLING' },
      next: [{ objectiveId: 'P2-MD-003', mastery: 'NOT_STARTED', reviewDue: false, readiness: 'READY' }],
    }));

    expect(candidates.map((candidate) => candidate.reason)).toEqual([
      'BLOCKING_MISTAKE',
      'PREREQUISITE_GAP',
      'UNRESOLVED_MISTAKE',
      'REVIEW_DUE',
      'CURRENT_OBJECTIVE',
      'NEXT_READY_OBJECTIVE',
    ]);
  });

  it('maps prerequisite/current/next mastery to exact intents without mutating mastery', () => {
    const candidates = listAdaptiveCandidates(baseInput({
      prerequisites: [
        { objectiveId: 'P2-AS-001', mastery: 'INTRODUCED', reviewDue: false, targetObjectiveId: 'P2-AS-002', targetReadiness: 'NEEDS_SUPPORT' },
        { objectiveId: 'P2-MD-001', mastery: 'DEVELOPING', reviewDue: false, targetObjectiveId: 'P2-MD-002', targetReadiness: 'NEEDS_SUPPORT' },
        { objectiveId: 'P2-MD-004', mastery: 'MASTERED', reviewDue: true, targetObjectiveId: 'P2-MD-005', targetReadiness: 'NEEDS_SUPPORT' },
      ],
      current: { objectiveId: 'P2-AS-002', mastery: 'DEVELOPING', reviewDue: false, performance: 'STABLE', strategyNeedsDevelopment: true },
      next: [
        { objectiveId: 'P2-MD-005', mastery: 'NOT_STARTED', reviewDue: false, readiness: 'READY' },
        { objectiveId: 'P2-MD-006', mastery: 'DEVELOPING', reviewDue: false, readiness: 'READY' },
        { objectiveId: 'P2-MD-007', mastery: 'MASTERED', reviewDue: false, readiness: 'READY' },
      ],
    }));

    const byObjective = new Map(candidates.map((candidate) => [candidate.objectiveId, candidate]));
    expect(byObjective.get('P2-AS-001')?.intent).toBe('LEARN');
    expect(byObjective.get('P2-MD-001')?.intent).toBe('PRACTICE');
    expect(byObjective.get('P2-MD-004')?.intent).toBe('REVIEW');
    expect(byObjective.get('P2-AS-002')).toMatchObject({ intent: 'PRACTICE' });
    expect(byObjective.get('P2-AS-002')?.rationaleCodes).toContain('STRATEGY_DEVELOPMENT_NEEDED');
    expect(byObjective.get('P2-MD-005')?.intent).toBe('LEARN');
    expect(byObjective.get('P2-MD-006')?.intent).toBe('PRACTICE');
    expect(byObjective.has('P2-MD-007')).toBe(false);
  });
});

describe('material supersession policy', () => {
  it('always supersedes an unstarted lesson for BLOCKING correction', () => {
    const [blocking] = listAdaptiveCandidates(baseInput({
      mistakes: [{ mistakeId: 'm-block', objectiveId: 'P2-AS-002', priority: 'BLOCKING', recurrent: true }],
    }));
    expect(selectAdaptiveRecommendation(sourceLesson, [blocking!], false)).toMatchObject({
      action: 'SUPERSEDE', intent: 'CORRECTION', targetMistakeId: 'm-block',
    });
  });

  it('supersedes LEARN for direct prerequisite support', () => {
    const candidates = listAdaptiveCandidates(baseInput({
      prerequisites: [{ objectiveId: 'P2-AS-001', mastery: 'DEVELOPING', reviewDue: false, targetObjectiveId: 'P2-AS-002', targetReadiness: 'BLOCKED' }],
    }));
    expect(selectAdaptiveRecommendation(sourceLesson, candidates, false)).toMatchObject({ action: 'SUPERSEDE', intent: 'PRACTICE', objectiveIds: ['P2-AS-001'] });
  });

  it('supersedes LEARN for NORMAL correction only on same/direct-prerequisite objective and without starvation guard', () => {
    const same = listAdaptiveCandidates(baseInput({ mistakes: [{ mistakeId: 'm-same', objectiveId: 'P2-AS-002', priority: 'NORMAL', recurrent: false }] }));
    const prerequisite = listAdaptiveCandidates(baseInput({ mistakes: [{ mistakeId: 'm-prereq', objectiveId: 'P2-AS-001', priority: 'NORMAL', recurrent: false }] }));
    const unrelated = listAdaptiveCandidates(baseInput({ mistakes: [{ mistakeId: 'm-other', objectiveId: 'P2-MD-001', priority: 'NORMAL', recurrent: false }] }));

    expect(selectAdaptiveRecommendation(sourceLesson, same, false).action).toBe('SUPERSEDE');
    expect(selectAdaptiveRecommendation(sourceLesson, prerequisite, false).action).toBe('SUPERSEDE');
    expect(selectAdaptiveRecommendation(sourceLesson, unrelated, false).action).toBe('KEEP');
    expect(selectAdaptiveRecommendation(sourceLesson, same, true).action).toBe('KEEP');
  });

  it('keeps LEARN for normal REVIEW and keeps PRACTICE for normal REVIEW', () => {
    const review = listAdaptiveCandidates(baseInput({
      reviews: [{ objectiveId: 'P2-MD-001', mastery: 'MASTERED', reviewDue: true, performance: 'STABLE' }],
    }));
    const practiceLesson = { ...sourceLesson, intent: 'PRACTICE' as const };
    expect(selectAdaptiveRecommendation(sourceLesson, review, false).action).toBe('KEEP');
    expect(selectAdaptiveRecommendation(practiceLesson, review, false).action).toBe('KEEP');
  });
});
