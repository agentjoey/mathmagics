import { assertValidLessonExecutionEvent } from './validation';
import type { DailyLessonExecutionState, LessonExecutionEvent } from './types';

function transitionError(from: DailyLessonExecutionState['status'], to: LessonExecutionEvent['type']): never {
  throw new Error(`invalid lesson execution transition: ${from} -> ${to}`);
}

export function deriveLessonExecutionState(
  lessonId: string,
  events: LessonExecutionEvent[],
): DailyLessonExecutionState {
  if (!lessonId.trim()) throw new Error('lessonId must be non-empty');

  const ordered = [...events].sort((left, right) => {
    const timeDifference = Date.parse(left.occurredAt) - Date.parse(right.occurredAt);
    return timeDifference || left.id.localeCompare(right.id);
  });

  const state: DailyLessonExecutionState = { lessonId, status: 'PLANNED' };

  for (const event of ordered) {
    assertValidLessonExecutionEvent(event);
    if (event.lessonId !== lessonId) throw new Error('execution event lessonId must match projected lesson id');

    if (state.status === 'PLANNED') {
      if (event.type === 'STARTED') {
        state.status = 'STARTED';
        state.startedAt = event.occurredAt;
        continue;
      }
      if (event.type === 'SKIPPED') {
        state.status = 'SKIPPED';
        state.skippedAt = event.occurredAt;
        if (event.actualMinutes !== undefined) state.actualMinutes = event.actualMinutes;
        continue;
      }
      transitionError(state.status, event.type);
    }

    if (state.status === 'STARTED') {
      if (event.type === 'COMPLETED') {
        state.status = 'COMPLETED';
        state.completedAt = event.occurredAt;
        if (event.actualMinutes !== undefined) state.actualMinutes = event.actualMinutes;
        continue;
      }
      if (event.type === 'SKIPPED') {
        state.status = 'SKIPPED';
        state.skippedAt = event.occurredAt;
        if (event.actualMinutes !== undefined) state.actualMinutes = event.actualMinutes;
        continue;
      }
      transitionError(state.status, event.type);
    }

    transitionError(state.status, event.type);
  }

  return state;
}
