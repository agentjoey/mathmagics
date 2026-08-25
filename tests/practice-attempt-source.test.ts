import { describe, expect, it } from 'vitest';
import { assertValidAttempt, projectAttemptToEvidence } from '@/lib/practice';
import { projectHomeworkAttemptToEvidence } from '@/lib/homework';
import type { Attempt, PracticeItem } from '@/lib/practice';

const practiceAttempt = {
  id: 'a-practice',
  source: { kind: 'PRACTICE', sessionId: 'ps-1', itemId: 'pi-1' },
  studentId: 's1', objectiveId: 'P2-MD-001', answerText: '6', outcome: 'CORRECT', hintUsed: false,
  gradingPolicyVersion: 'grading-v1', submittedAt: '2026-08-25T00:01:00.000Z', recordedAt: '2026-08-25T00:01:00.000Z',
} as Attempt;

const homeworkAttempt = {
  id: 'a-homework',
  source: { kind: 'HOMEWORK', submissionId: 'hs-1', problemId: 'hp-1' },
  studentId: 's1', objectiveId: 'P2-MD-001', answerText: '6', outcome: 'CORRECT', hintUsed: false,
  gradingPolicyVersion: 'grading-v1', submittedAt: '2026-08-25T00:01:00.000Z', recordedAt: '2026-08-25T00:01:00.000Z',
} as Attempt;

const item: PracticeItem = {
  id: 'pi-1', sessionId: 'ps-1', studentId: 's1', objectiveId: 'P2-MD-001', sequence: 1,
  difficultyBand: 'CORE', problemSpec: { kind: 'ARITHMETIC', operation: 'MULTIPLY', left: 2, right: 3 },
  prompt: '2 × 3?', answerSpec: { kind: 'INTEGER', value: '6' }, solutionOutline: ['2 × 3 = 6'],
  generator: 'fixture', generatorVersion: '1', createdAt: '2026-08-25T00:00:00.000Z',
};

describe('canonical Attempt source', () => {
  it('validates both exclusive source variants', () => {
    expect(() => assertValidAttempt(practiceAttempt)).not.toThrow();
    expect(() => assertValidAttempt(homeworkAttempt)).not.toThrow();
  });

  it('keeps practice Evidence projection practice-only', () => {
    expect(projectAttemptToEvidence(practiceAttempt, item).origin.kind).toBe('PRACTICE');
    expect(() => projectAttemptToEvidence(homeworkAttempt, item)).toThrow('practice evidence requires a PRACTICE attempt source');
  });

  it.each([
    ['INCORRECT', 'CORE', 'incorrect'],
    ['CORRECT', 'CORE', 'independent_correct'],
    ['CORRECT', 'APPLICATION', 'application_correct'],
  ] as const)('projects HOMEWORK %s at %s to %s', (outcome, classification, evidenceType) => {
    const attempt = { ...homeworkAttempt, outcome } as Attempt;
    expect(projectHomeworkAttemptToEvidence(attempt, { classification })).toEqual({
      id: 'homework-attempt:a-homework',
      studentId: 's1', objectiveId: 'P2-MD-001', type: evidenceType,
      observedAt: '2026-08-25T00:01:00.000Z', recordedAt: '2026-08-25T00:01:00.000Z',
      origin: { kind: 'HOMEWORK', refId: 'a-homework' },
    });
  });

  it('rejects hints and practice-origin attempts at the homework Evidence boundary', () => {
    expect(() => projectHomeworkAttemptToEvidence({ ...homeworkAttempt, hintUsed: true } as Attempt, { classification: 'CORE' }))
      .toThrow('homework attempt must not record practice hint use');
    expect(() => projectHomeworkAttemptToEvidence(practiceAttempt, { classification: 'CORE' }))
      .toThrow('homework evidence requires a HOMEWORK attempt source');
  });
});
