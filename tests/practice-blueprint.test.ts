import { describe, expect, it } from 'vitest';
import { derivePracticeBlueprint } from '@/lib/practice';
import type { MasterySnapshot } from '@/lib/learning';

function mastery(state: MasterySnapshot['state'], reviewDue: boolean): MasterySnapshot {
  return {
    studentId: 's1',
    objectiveId: 'P3-FRA-003',
    state,
    reviewDue,
    evidenceCount: 0,
    lastEvidenceAt: null,
  };
}

describe('practice-v1 blueprint', () => {
  it.each([
    ['NOT_STARTED', false, ['FOUNDATION', 'FOUNDATION', 'CORE', 'CORE']],
    ['INTRODUCED', false, ['FOUNDATION', 'FOUNDATION', 'CORE', 'CORE']],
    ['DEVELOPING', false, ['FOUNDATION', 'CORE', 'CORE', 'APPLICATION']],
    ['MASTERED', true, ['CORE', 'CORE', 'APPLICATION', 'APPLICATION']],
    ['MASTERED', false, ['CORE', 'APPLICATION', 'APPLICATION', 'CHALLENGE']],
  ] as const)('maps %s review=%s to deterministic slots', (state, reviewDue, slots) => {
    expect(derivePracticeBlueprint('P3-FRA-003', mastery(state, reviewDue))).toEqual({
      objectiveId: 'P3-FRA-003',
      policyVersion: 'practice-v1',
      slots,
    });
  });

  it('rejects mastery for another objective', () => {
    expect(() => derivePracticeBlueprint('P3-FRA-003', {
      ...mastery('DEVELOPING', false),
      objectiveId: 'P3-FRA-002',
    })).toThrow('practice blueprint mastery objectiveId must match objectiveId');
  });
});
