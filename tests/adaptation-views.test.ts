import { describe, expect, it } from 'vitest';
import { ADAPTIVE_RATIONALE_TEXT, toParentNextLessonView } from '@/lib/adaptation/rationale';
import { toStudentNextLessonView } from '@/lib/adaptation/student-view';
import type { AdaptiveRationaleCode } from '@/lib/adaptation';
import type { DailyLesson } from '@/lib/planning';

const CODES: AdaptiveRationaleCode[] = [
  'BLOCKING_MISTAKE', 'RECURRENT_MISTAKE', 'PREREQUISITE_GAP', 'URGENT_REVIEW', 'REVIEW_DUE',
  'PERFORMANCE_STRUGGLING', 'STRATEGY_DEVELOPMENT_NEEDED', 'CURRENT_OBJECTIVE_NOT_MASTERED',
  'NEXT_OBJECTIVE_READY', 'STARVATION_GUARD_FORWARD_PROGRESS', 'NO_HIGHER_PRIORITY_NEED',
  'SOURCE_LESSON_ALREADY_STARTED', 'REPLACEMENT_LESSON_IMMUTABLE',
];

const LESSON: DailyLesson = {
  id: 'replacement-1', weeklyPlanId: 'plan-1', studentId: 'student-1', sequence: 2, intent: 'CORRECTION',
  objectiveIds: ['P2-AS-002'], estimatedMinutes: 30,
  rationale: [{ code: 'CURRENT_POSITION', objectiveId: 'P2-AS-002' }], createdAt: '2026-08-26T12:00:00.000Z',
};

describe('adaptive rationale and views', () => {
  it('has a closed code-owned rationale for every adaptive code', () => {
    expect(Object.keys(ADAPTIVE_RATIONALE_TEXT).sort()).toEqual([...CODES].sort());
  });

  it('projects parent rationale without AI or raw policy fields', () => {
    const view = toParentNextLessonView({
      effectiveLesson: { lesson: LESSON, originalLessonId: 'original-1', adapted: true, adaptiveDecisionId: 'decision-1' },
      decision: {
        id: 'decision-1', studentId: 'student-1', sourceLessonId: 'original-1', action: 'SUPERSEDE',
        selectedIntent: 'CORRECTION', selectedObjectiveIds: ['P2-AS-002'], targetMistakeId: 'mistake-1',
        rationaleCodes: ['BLOCKING_MISTAKE', 'RECURRENT_MISTAKE'], policyVersion: 'adaptive-policy-v1',
        evaluatedAt: '2026-08-26T12:00:00.000Z', inputFactCutoff: '2026-08-26T12:00:00.000Z', createdAt: '2026-08-26T12:00:00.000Z',
      },
    });
    expect(view).toMatchObject({ lessonId: LESSON.id, adapted: true, originalLessonId: 'original-1', targetMistakeId: 'mistake-1' });
    expect(view.rationale).toHaveLength(2);
    expect(JSON.stringify(view)).not.toMatch(/policyVersion|inputFactCutoff|AI/iu);
  });

  it('keeps the student next-lesson view deliberately thin', () => {
    const view = toStudentNextLessonView({
      effectiveLesson: { lesson: LESSON, originalLessonId: 'original-1', adapted: true, adaptiveDecisionId: 'decision-1' },
    });
    expect(view).toEqual({
      lessonId: LESSON.id,
      intent: 'CORRECTION',
      objectiveSummary: 'Solve addition and subtraction word problems',
      adapted: true,
    });
    expect(JSON.stringify(view)).not.toMatch(/rate|priority|policyVersion|rationale|mistake/iu);
  });
});
