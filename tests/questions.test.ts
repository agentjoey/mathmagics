import { describe, it, expect } from 'vitest';
import { loadQuestion, listQuestionIds } from '@/lib/questions';

describe('loadQuestion', () => {
  it('loads Q05 with required fields', () => {
    const q = loadQuestion('Q05');
    expect(q.id).toBe('Q05');
    expect(q.correct_answer).toBe('A');
    expect(q.socratic_path.length).toBe(3);
    expect(q.feynman_trap.agent_statement).toContain('为什么');
  });

  it('throws on unknown id', () => {
    expect(() => loadQuestion('XX')).toThrow(/unknown question/i);
  });
});

describe('listQuestionIds', () => {
  it('returns Q05 and Q18', () => {
    const ids = listQuestionIds();
    expect(ids).toEqual(expect.arrayContaining(['Q05', 'Q18']));
    expect(ids.length).toBe(2);
  });
});
