import { getPrerequisites } from '@/lib/curriculum';
import type { DiagnosisTarget, MistakeState } from '@/lib/correction';
import type { MistakePriority } from './types';

export interface MistakePriorityInput {
  state: MistakeState;
  diagnosisTarget: DiagnosisTarget | null;
  mistakeObjectiveId: string;
  forwardObjectiveId?: string;
  recurrent: boolean;
  masteredBeforeMistake: boolean;
}

function hasConfirmedTarget(target: DiagnosisTarget | null): boolean {
  return target !== null && !(target.kind === 'GENERIC' && target.code === 'UNKNOWN');
}

function isDirectPrerequisite(mistakeObjectiveId: string, forwardObjectiveId?: string): boolean {
  if (!forwardObjectiveId || forwardObjectiveId === mistakeObjectiveId) return false;
  return getPrerequisites(forwardObjectiveId).some((objective) => objective.id === mistakeObjectiveId);
}

export function deriveMistakePriority(input: MistakePriorityInput): MistakePriority {
  if (input.state === 'RESOLVED' || input.state === 'OBSERVED' || !hasConfirmedTarget(input.diagnosisTarget)) {
    return 'LOW';
  }

  if (
    input.recurrent
    || input.masteredBeforeMistake
    || isDirectPrerequisite(input.mistakeObjectiveId, input.forwardObjectiveId)
  ) {
    return 'BLOCKING';
  }

  return 'NORMAL';
}
