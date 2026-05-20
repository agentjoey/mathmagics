import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '@/lib/prompts';
import { loadQuestion } from '@/lib/questions';

describe('buildSystemPrompt', () => {
  it('injects question metadata into template', () => {
    const q = loadQuestion('Q05');
    const prompt = buildSystemPrompt(q);

    expect(prompt).toContain('骰子之谜');
    expect(prompt).toContain('相对两面之和 = 7');
    expect(prompt).toContain(q.feynman_trap.agent_statement);
    expect(prompt).toContain('pictorial');
    // Must NOT contain unfilled placeholders
    expect(prompt).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it('lists all 3 socratic steps with their intents', () => {
    const q = loadQuestion('Q05');
    const prompt = buildSystemPrompt(q);
    for (const step of q.socratic_path) {
      expect(prompt).toContain(step.intent);
    }
  });

  it('does not leak the correct answer outside the explicit answer line', () => {
    const q = loadQuestion('Q05');
    const prompt = buildSystemPrompt(q);
    // correct_answer appears in metadata block but NOT in user-facing instructions
    const occurrences = prompt.match(/正确答案/g) || [];
    expect(occurrences.length).toBeLessThanOrEqual(2);  // metadata + "不要直接说出来" reminder
  });
});
