import type { ObjectiveReadiness, PrerequisiteStatus, ReadinessState } from './types';

function cloneStatus(status: PrerequisiteStatus): PrerequisiteStatus {
  return { ...status };
}

export function classifyReadiness(
  studentId: string,
  objectiveId: string,
  prerequisites: PrerequisiteStatus[],
): ObjectiveReadiness {
  const state: ReadinessState = prerequisites.some((item) => item.mastery === 'NOT_STARTED')
    ? 'BLOCKED'
    : prerequisites.some((item) => item.mastery !== 'MASTERED')
      ? 'NEEDS_SUPPORT'
      : 'READY';

  return {
    studentId,
    objectiveId,
    state,
    ready: state === 'READY',
    prerequisites: prerequisites.map(cloneStatus),
    blockingPrerequisites: prerequisites.filter((item) => item.mastery !== 'MASTERED').map(cloneStatus),
  };
}
