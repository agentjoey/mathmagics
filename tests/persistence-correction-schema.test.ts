import { describe, expect, it } from 'vitest';
import {
  attempts,
  correctionItems,
  correctionReasoningChecks,
  mistakeAttemptLinks,
  mistakeEvents,
  mistakes,
} from '@/lib/persistence/schema';

describe('Phase 6 correction persistence schema', () => {
  it('defines five append-only correction fact tables and no mutable mistake state column', () => {
    expect(mistakes).toBeDefined();
    expect(mistakeAttemptLinks).toBeDefined();
    expect(mistakeEvents).toBeDefined();
    expect(correctionItems).toBeDefined();
    expect(correctionReasoningChecks).toBeDefined();

    const mistakeColumns = Object.keys(mistakes);
    expect(mistakeColumns).toEqual(expect.arrayContaining([
      'id', 'studentId', 'objectiveId', 'initialAttemptId', 'initialDiagnosisTarget',
      'diagnosisPolicyVersion', 'firstObservedAt', 'createdAt',
    ]));
    expect(mistakeColumns).not.toContain('state');
    expect(mistakeColumns).not.toContain('resolved');
  });

  it('extends canonical attempts with exclusive CORRECTION coordinates without renaming existing source fields', () => {
    expect(Object.keys(attempts)).toEqual(expect.arrayContaining([
      'sourceKind', 'sessionId', 'itemId',
      'homeworkSubmissionId', 'homeworkProblemId',
      'correctionMistakeId', 'correctionItemId',
    ]));
  });

  it('stores immutable correction snapshots and reasoning facts', () => {
    expect(Object.keys(correctionItems)).toEqual(expect.arrayContaining([
      'id', 'mistakeId', 'studentId', 'objectiveId', 'kind', 'sourceAttemptId', 'transferRound',
      'problemSpec', 'answerSpec', 'prompt', 'hint', 'solutionOutline', 'generator', 'generatorVersion', 'createdAt',
    ]));
    expect(Object.keys(correctionReasoningChecks)).toEqual(expect.arrayContaining([
      'id', 'mistakeId', 'studentId', 'objectiveId', 'checkSpec', 'response', 'outcome', 'assisted',
      'policyVersion', 'submittedAt', 'recordedAt',
    ]));
  });
});
