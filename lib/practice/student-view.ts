import type { DifficultyBand } from '@/lib/curriculum';
import type { PracticeItem } from './types';

export interface StudentPracticeItem {
  id: string;
  sessionId: string;
  objectiveId: string;
  sequence: number;
  difficultyBand: DifficultyBand;
  prompt: string;
}

export function toStudentPracticeItem(item: PracticeItem): StudentPracticeItem {
  return {
    id: item.id,
    sessionId: item.sessionId,
    objectiveId: item.objectiveId,
    sequence: item.sequence,
    difficultyBand: item.difficultyBand,
    prompt: item.prompt,
  };
}
