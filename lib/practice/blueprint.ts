import type { MasterySnapshot } from '@/lib/learning';
import type { DifficultyBand } from '@/lib/curriculum';
import type { PracticeBlueprint } from './types';

const SLOTS: Record<string, DifficultyBand[]> = {
  NOT_STARTED: ['FOUNDATION', 'FOUNDATION', 'CORE', 'CORE'],
  INTRODUCED: ['FOUNDATION', 'FOUNDATION', 'CORE', 'CORE'],
  DEVELOPING: ['FOUNDATION', 'CORE', 'CORE', 'APPLICATION'],
  MASTERED_REVIEW: ['CORE', 'CORE', 'APPLICATION', 'APPLICATION'],
  MASTERED: ['CORE', 'APPLICATION', 'APPLICATION', 'CHALLENGE'],
};

export function derivePracticeBlueprint(
  objectiveId: string,
  mastery: MasterySnapshot,
): PracticeBlueprint {
  if (mastery.objectiveId !== objectiveId) {
    throw new Error('practice blueprint mastery objectiveId must match objectiveId');
  }
  const key = mastery.state === 'MASTERED'
    ? (mastery.reviewDue ? 'MASTERED_REVIEW' : 'MASTERED')
    : mastery.state;
  return {
    objectiveId,
    policyVersion: 'practice-v1',
    slots: [...SLOTS[key]!],
  };
}
