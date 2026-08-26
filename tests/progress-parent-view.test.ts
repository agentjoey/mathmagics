import { describe, expect, it } from 'vitest';
import { buildParentProgressView } from '@/lib/progress/parent-view';

const EMPTY_MISTAKES = { active: [], resolved: [], recurring: [] };

describe('ParentProgressView', () => {
  it('keeps coverage, mastery and performance independent without a combined score', () => {
    const view = buildParentProgressView({
      studentId: 'student-1',
      levelId: 'P2',
      evaluatedAt: '2026-08-26T12:00:00.000Z',
      topics: [{
        topicId: 'P2-WHOLE',
        title: 'Whole Numbers',
        objectives: [{
          objectiveId: 'P2-AS-002', title: 'Word problems', coverage: 'PRACTISED',
          mastery: 'DEVELOPING', performance: 'STRUGGLING', reviewDue: false,
        }, {
          objectiveId: 'P2-AS-001', title: 'Addition', coverage: 'PRACTISED',
          mastery: 'MASTERED', performance: 'STRUGGLING', reviewDue: true,
        }],
      }],
      strategies: [{
        strategyId: 'STRAT-BAR-PART-WHOLE', state: 'RELIABLE', evidenceCount: 5,
        independentUseCount: 3, independentTransferCount: 1, objectiveCount: 2,
        lastObservedAt: '2026-08-26T11:00:00.000Z',
      }],
      mistakes: EMPTY_MISTAKES,
      nextLesson: null,
    });

    expect(view.topics[0]!.objectives[0]).toMatchObject({
      coverage: 'PRACTISED', mastery: 'DEVELOPING', performance: 'STRUGGLING',
    });
    expect(view.topics[0]!.objectives[1]).toMatchObject({
      mastery: 'MASTERED', performance: 'STRUGGLING', reviewDue: true,
    });
    expect(view.summary).toMatchObject({ objectivesPractised: 2, objectivesMastered: 1, strugglingObjectives: 2, reviewDueObjectives: 1, reliableStrategies: 1 });
    const serialized = JSON.stringify(view);
    expect(serialized).not.toMatch(/combinedScore|overallScore|answerSpec|solutionOutline|payload|policyVersion/iu);
  });
});
