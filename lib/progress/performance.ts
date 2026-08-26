import type { Attempt } from '@/lib/practice';
import type { PerformanceSnapshot, PerformanceState } from './types';

export interface PerformanceInput {
  attempts: Attempt[];
  evaluatedAt: string;
  recurrenceCount: number;
  hasBlockingMistake: boolean;
}

function compareAttempts(left: Attempt, right: Attempt): number {
  return Date.parse(left.submittedAt) - Date.parse(right.submittedAt) || left.id.localeCompare(right.id);
}

export function derivePerformance(input: PerformanceInput): PerformanceSnapshot {
  const cutoffMs = Date.parse(input.evaluatedAt);
  const windowStartMs = cutoffMs - 7 * 86_400_000;
  const sample = input.attempts
    .filter((attempt) =>
      (attempt.source.kind === 'PRACTICE' || attempt.source.kind === 'HOMEWORK') &&
      Date.parse(attempt.submittedAt) >= windowStartMs &&
      Date.parse(attempt.submittedAt) <= cutoffMs)
    .sort(compareAttempts)
    .slice(-12);

  const attemptCount = sample.length;
  const correctCount = sample.filter((attempt) => attempt.outcome === 'CORRECT').length;
  const independentCorrectCount = sample.filter((attempt) => attempt.outcome === 'CORRECT' && !attempt.hintUsed).length;
  const hintCount = sample.filter((attempt) => attempt.hintUsed).length;
  const incorrectCount = sample.filter((attempt) => attempt.outcome === 'INCORRECT').length;
  let recentIncorrectStreak = 0;
  for (let index = sample.length - 1; index >= 0; index -= 1) {
    if (sample[index]!.outcome !== 'INCORRECT') break;
    recentIncorrectStreak += 1;
  }
  const correctRate = attemptCount ? correctCount / attemptCount : 0;
  const independentCorrectRate = attemptCount ? independentCorrectCount / attemptCount : 0;
  const hintRate = attemptCount ? hintCount / attemptCount : 0;
  const incorrectRate = attemptCount ? incorrectCount / attemptCount : 0;
  const hasCurrentIncorrect = sample.some((attempt) => attempt.outcome === 'INCORRECT');

  let state: PerformanceState;
  if (attemptCount < 3) state = 'INSUFFICIENT_DATA';
  else if (independentCorrectRate < 0.5 || recentIncorrectStreak >= 2 || (input.recurrenceCount >= 1 && hasCurrentIncorrect)) state = 'STRUGGLING';
  else if (attemptCount >= 5 && independentCorrectRate >= 0.8 && incorrectRate <= 0.2 && recentIncorrectStreak === 0 && !input.hasBlockingMistake) state = 'STABLE';
  else state = 'UNSTABLE';

  return {
    state,
    attemptCount,
    correctRate,
    independentCorrectRate,
    hintRate,
    incorrectRate,
    recentIncorrectStreak,
    recurrenceCount: input.recurrenceCount,
    windowStart: sample[0]?.submittedAt ?? null,
    windowEnd: sample.at(-1)?.submittedAt ?? null,
  };
}
