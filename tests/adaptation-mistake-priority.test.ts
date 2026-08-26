import { describe, expect, it } from 'vitest';
import { deriveMistakePriority } from '@/lib/adaptation/mistake-priority';
import type { MistakePriorityInput } from '@/lib/adaptation/mistake-priority';

function input(overrides: Partial<MistakePriorityInput> = {}): MistakePriorityInput {
  return {
    state: 'CONFIRMED',
    diagnosisTarget: { kind: 'GENERIC', code: 'FACT_ERROR' },
    mistakeObjectiveId: 'P2-AS-002',
    recurrent: false,
    masteredBeforeMistake: false,
    ...overrides,
  };
}

describe('deriveMistakePriority', () => {
  it('keeps pending or unknown diagnosis LOW', () => {
    expect(deriveMistakePriority(input({ state: 'OBSERVED', diagnosisTarget: null }))).toBe('LOW');
    expect(deriveMistakePriority(input({ diagnosisTarget: { kind: 'GENERIC', code: 'UNKNOWN' } }))).toBe('LOW');
  });

  it('classifies a confirmed unresolved mistake as NORMAL', () => {
    expect(deriveMistakePriority(input())).toBe('NORMAL');
    expect(deriveMistakePriority(input({ state: 'CORRECTING' }))).toBe('NORMAL');
  });

  it('makes a confirmed direct prerequisite mistake BLOCKING', () => {
    expect(deriveMistakePriority(input({
      mistakeObjectiveId: 'P2-AS-001',
      forwardObjectiveId: 'P2-AS-002',
    }))).toBe('BLOCKING');
  });

  it('makes recurrence BLOCKING', () => {
    expect(deriveMistakePriority(input({ recurrent: true }))).toBe('BLOCKING');
  });

  it('makes a regression on previously mastered material BLOCKING', () => {
    expect(deriveMistakePriority(input({ masteredBeforeMistake: true }))).toBe('BLOCKING');
  });

  it('does not keep resolved episodes active', () => {
    expect(deriveMistakePriority(input({ state: 'RESOLVED', recurrent: true, masteredBeforeMistake: true }))).toBe('LOW');
  });
});
