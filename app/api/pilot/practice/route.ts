import { NextRequest } from 'next/server';
import { createPilotSessionRuntime } from '@/lib/pilot/runtime';
import { createPilotPracticePostHandler } from './handler';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const services = createPilotSessionRuntime();
  return createPilotPracticePostHandler({
    sessionSecret: () => process.env.SESSION_SECRET,
    now: services.clock.now,
    studentExists: async (studentId) => (await services.learning.getStudent(studentId)) !== undefined,
    createPracticeSession: (studentId, lessonId, objectiveId, at) => services.pilotSession.createPracticeSession(studentId, lessonId, objectiveId, at),
    revealHint: (studentId, sessionId, itemId, at) => services.pilotSession.revealHint(studentId, sessionId, itemId, at),
    submitPracticeAttempt: (studentId, input, at) => services.pilotSession.submitPracticeAttempt(studentId, input, at),
  })(req);
}
