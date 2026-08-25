import { describe, expect, it } from 'vitest';
import { toStudentPracticeItem } from '@/lib/practice';
import type { PracticeItem } from '@/lib/practice';

const fullItem: PracticeItem = {
  id: 'i1', sessionId: 'ps1', studentId: 's1', objectiveId: 'P3-FRA-003', sequence: 1,
  difficultyBand: 'APPLICATION',
  problemSpec: {
    kind: 'FRACTION_COMPARE', leftNumerator: 1, leftDenominator: 2,
    rightNumerator: 2, rightDenominator: 3,
  },
  prompt: '1/2 ? 2/3',
  answerSpec: { kind: 'EXACT_TEXT', acceptedValues: ['<'], caseSensitive: false },
  hint: 'Use cross multiplication.',
  solutionOutline: ['1×3 < 2×2'],
  generator: 'p3-fractions', generatorVersion: 'p3-fractions-v1',
  createdAt: '2026-08-25T00:00:00.000Z',
};

describe('student practice projection', () => {
  it('exposes only the allowed pre-answer fields', () => {
    const view = toStudentPracticeItem(fullItem);
    expect(Object.keys(view).sort()).toEqual([
      'difficultyBand', 'id', 'objectiveId', 'prompt', 'sequence', 'sessionId',
    ]);
    expect(view).toEqual({
      id: 'i1', sessionId: 'ps1', objectiveId: 'P3-FRA-003', sequence: 1,
      difficultyBand: 'APPLICATION', prompt: '1/2 ? 2/3',
    });
  });
});
