import { describe, expect, it } from 'vitest';
import {
  PassthroughPracticeContentRenderer,
  type LockedPracticeRenderInput,
} from '@/lib/practice';

describe('safe optional practice rendering boundary', () => {
  it('accepts only locked non-authoritative render input and returns no mathematical truth', async () => {
    const input = {
      itemId: 'item-1',
      objectiveId: 'P2-MD-001',
      difficultyBand: 'CORE',
      promptFrame: 'What is {{left}} × {{right}}?',
      lockedTokens: { left: '3', right: '4' },
      hintFrame: 'Think in equal groups.',
    } satisfies LockedPracticeRenderInput;

    const renderer = new PassthroughPracticeContentRenderer();
    const result = await renderer.render(input);
    expect(result).toEqual({});
    expect(Object.keys(input).sort()).toEqual([
      'difficultyBand', 'hintFrame', 'itemId', 'lockedTokens', 'objectiveId', 'promptFrame',
    ]);
    expect(Object.keys(result)).not.toEqual(expect.arrayContaining([
      'answerSpec', 'problemSpec', 'outcome', 'evidence', 'mastery', 'readiness',
    ]));
  });
});
