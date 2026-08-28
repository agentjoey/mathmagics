import { describe, expect, it } from 'vitest';
import { derivePilotStudentFlow } from '@/lib/pilot/student-flow';

describe('pilot student primary flow', () => {
  it('keeps an active lesson primary even when an incorrect attempt has opened a mistake', () => {
    expect(derivePilotStudentFlow({
      hasStartedLesson: true,
      hasNextLesson: true,
      mistakeState: 'OBSERVED',
      correctionActive: false,
    })).toBe('ACTIVE_LESSON');
  });

  it('routes to correction after the current lesson ends when an unresolved mistake exists', () => {
    for (const mistakeState of ['OBSERVED', 'CONFIRMED', 'CORRECTING'] as const) {
      expect(derivePilotStudentFlow({
        hasStartedLesson: false,
        hasNextLesson: true,
        mistakeState,
        correctionActive: false,
      })).toBe('CORRECTION');
    }
  });

  it('uses the next planned lesson only when no active lesson or correction blocks it', () => {
    expect(derivePilotStudentFlow({
      hasStartedLesson: false,
      hasNextLesson: true,
      mistakeState: null,
      correctionActive: false,
    })).toBe('NEXT_LESSON');
  });

  it('projects a bounded complete state instead of a dead start action when nothing remains', () => {
    expect(derivePilotStudentFlow({
      hasStartedLesson: false,
      hasNextLesson: false,
      mistakeState: null,
      correctionActive: false,
    })).toBe('COMPLETE');
  });
});
