import { describe, expect, it } from 'vitest';
import { assertValidLessonExecutionEvent } from '@/lib/planning';

describe('lesson execution event rules', () => {
  it('rejects actualMinutes on STARTED events', () => {
    expect(() =>
      assertValidLessonExecutionEvent({
        id: 'start-1',
        lessonId: 'lesson-1',
        studentId: 'student-1',
        type: 'STARTED',
        occurredAt: '2026-08-24T09:00:00.000Z',
        actualMinutes: 1,
      }),
    ).toThrow('actualMinutes is not allowed on STARTED events');
  });
});
