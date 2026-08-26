import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import {
  adaptiveDecisions,
  dailyLessons,
  lessonSupersessions,
  strategyEvidence,
  strategyInteractions,
} from '@/lib/persistence/schema';

function uniqueIndexNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).indexes.filter((index) => index.config.unique).map((index) => index.config.name);
}

describe('Phase 7 persistence schema', () => {
  it('defines exactly the four Phase 7 append-only fact tables', () => {
    expect(strategyInteractions).toBeDefined();
    expect(strategyEvidence).toBeDefined();
    expect(adaptiveDecisions).toBeDefined();
    expect(lessonSupersessions).toBeDefined();

    expect(Object.keys(strategyInteractions)).toEqual(expect.arrayContaining([
      'id', 'studentId', 'objectiveId', 'strategyId', 'sourceKind', 'sourceRefId',
      'interactionType', 'outcome', 'observedAt', 'recordedAt',
    ]));
    expect(Object.keys(strategyEvidence)).toEqual(expect.arrayContaining([
      'id', 'studentId', 'strategyId', 'objectiveId', 'type', 'interactionId', 'observedAt', 'recordedAt',
    ]));
    expect(Object.keys(adaptiveDecisions)).toEqual(expect.arrayContaining([
      'id', 'studentId', 'sourceLessonId', 'action', 'selectedIntent', 'selectedObjectiveIds',
      'targetMistakeId', 'rationaleCodes', 'policyVersion', 'evaluatedAt', 'inputFactCutoff', 'createdAt',
    ]));
    expect(Object.keys(lessonSupersessions)).toEqual(expect.arrayContaining([
      'id', 'studentId', 'sourceLessonId', 'replacementLessonId', 'adaptiveDecisionId', 'createdAt',
    ]));
  });

  it('enforces one evidence per interaction and one supersession edge per coordinate', () => {
    expect(uniqueIndexNames(strategyEvidence)).toContain('strategy_evidence_interaction_uq');
    expect(uniqueIndexNames(adaptiveDecisions)).toContain('adaptive_decision_evaluation_key_uq');
    expect(uniqueIndexNames(lessonSupersessions)).toEqual(expect.arrayContaining([
      'lesson_supersession_source_uq',
      'lesson_supersession_replacement_uq',
      'lesson_supersession_decision_uq',
    ]));
  });

  it('allows original and replacement lessons to share one logical plan sequence', () => {
    expect(uniqueIndexNames(dailyLessons)).not.toContain('daily_lesson_plan_sequence_uq');
  });

  it('does not persist mutable projection or recommendation state', () => {
    const forbidden = [
      'progressState', 'performanceScore', 'strategyMastery', 'currentRecommendation',
      'superseded', 'effective', 'mistakePriority',
    ];
    for (const table of [strategyInteractions, strategyEvidence, adaptiveDecisions, lessonSupersessions]) {
      const columns = Object.keys(table);
      for (const name of forbidden) expect(columns).not.toContain(name);
    }
  });
});
