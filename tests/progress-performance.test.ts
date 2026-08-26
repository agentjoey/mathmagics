import { describe, expect, it } from 'vitest';
import { derivePerformance } from '@/lib/progress/performance';
import type { Attempt } from '@/lib/practice';

const NOW = '2026-08-26T08:00:00.000Z';
const OBJ = 'P2-AS-002';

function a(id: string, daysAgo: number, outcome: 'CORRECT' | 'INCORRECT', hintUsed = false, kind: 'PRACTICE' | 'HOMEWORK' | 'CORRECTION' = 'PRACTICE'): Attempt {
  const submittedAt = new Date(Date.parse(NOW) - daysAgo * 86_400_000).toISOString();
  const source = kind === 'PRACTICE'
    ? { kind, sessionId: 's', itemId: id } as const
    : kind === 'HOMEWORK'
      ? { kind, submissionId: 'h', problemId: id } as const
      : { kind, mistakeId: 'm', correctionItemId: id } as const;
  return { id, source, studentId: 'student', objectiveId: OBJ, answerText: '1', outcome, hintUsed, gradingPolicyVersion: 'v1', submittedAt, recordedAt: submittedAt };
}

describe('derivePerformance', () => {
  it('uses the 7-day/latest-12 root window and deterministic thresholds', () => {
    expect(derivePerformance({ attempts: [a('1',0,'CORRECT'), a('2',0,'CORRECT')], evaluatedAt: NOW, recurrenceCount: 0, hasBlockingMistake: false }).state).toBe('INSUFFICIENT_DATA');
    expect(derivePerformance({ attempts: [a('1',0,'INCORRECT'), a('2',0,'CORRECT'), a('3',0,'INCORRECT')], evaluatedAt: NOW, recurrenceCount: 0, hasBlockingMistake: false }).state).toBe('STRUGGLING');
    expect(derivePerformance({ attempts: [a('1',0,'CORRECT'), a('2',0,'CORRECT'), a('3',0,'CORRECT'), a('4',0,'CORRECT'), a('5',0,'CORRECT')], evaluatedAt: NOW, recurrenceCount: 0, hasBlockingMistake: false }).state).toBe('STABLE');
    expect(derivePerformance({ attempts: [a('1',0,'CORRECT'), a('2',0,'CORRECT'), a('3',0,'CORRECT'), a('4',0,'CORRECT'), a('5',0,'CORRECT')], evaluatedAt: NOW, recurrenceCount: 0, hasBlockingMistake: true }).state).toBe('UNSTABLE');
  });

  it('excludes CORRECTION and attempts older than seven days and caps at twelve newest', () => {
    const attempts = [a('old',8,'INCORRECT'), a('correction',0,'INCORRECT',false,'CORRECTION')];
    for (let i = 0; i < 13; i += 1) attempts.push(a(`new-${String(i).padStart(2,'0')}`,0,'CORRECT'));
    const snapshot = derivePerformance({ attempts, evaluatedAt: NOW, recurrenceCount: 0, hasBlockingMistake: false });
    expect(snapshot.attemptCount).toBe(12);
    expect(snapshot.incorrectRate).toBe(0);
    expect(snapshot.state).toBe('STABLE');
  });

  it('uses recurrence with current incorrect and recent incorrect streak as struggling signals', () => {
    expect(derivePerformance({ attempts: [a('1',0,'CORRECT'), a('2',0,'INCORRECT'), a('3',0,'INCORRECT')], evaluatedAt: NOW, recurrenceCount: 0, hasBlockingMistake: false }).state).toBe('STRUGGLING');
    expect(derivePerformance({ attempts: [a('1',0,'CORRECT'), a('2',0,'CORRECT'), a('3',0,'INCORRECT')], evaluatedAt: NOW, recurrenceCount: 1, hasBlockingMistake: false }).state).toBe('STRUGGLING');
  });
});
