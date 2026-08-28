export type PilotStudentFlow = 'ACTIVE_LESSON' | 'CORRECTION' | 'NEXT_LESSON' | 'COMPLETE';

export interface PilotStudentFlowInput {
  hasStartedLesson: boolean;
  hasNextLesson: boolean;
  mistakeState: 'OBSERVED' | 'CONFIRMED' | 'CORRECTING' | 'RESOLVED' | null;
  correctionActive: boolean;
}

export function derivePilotStudentFlow(input: PilotStudentFlowInput): PilotStudentFlow {
  if (input.correctionActive) return 'CORRECTION';
  if (input.hasStartedLesson) return 'ACTIVE_LESSON';
  if (input.mistakeState && input.mistakeState !== 'RESOLVED') return 'CORRECTION';
  if (input.hasNextLesson) return 'NEXT_LESSON';
  return 'COMPLETE';
}
