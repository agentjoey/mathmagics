import { NextRequest } from 'next/server';
import { createPilotSessionRuntime } from '@/lib/pilot/runtime';
import { createPilotLessonPostHandler } from './handler';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const services = createPilotSessionRuntime();
  return createPilotLessonPostHandler({
    sessionSecret: () => process.env.SESSION_SECRET,
    now: services.clock.now,
    studentExists: async (studentId) => (await services.learning.getStudent(studentId)) !== undefined,
    startNextLesson: (studentId, at) => services.pilotSession.startNextLesson(studentId, at),
    completeLesson: (studentId, lessonId, actualMinutes, at) => services.pilotSession.completeLesson(studentId, lessonId, actualMinutes, at),
    skipLesson: (studentId, lessonId, actualMinutes, at) => services.pilotSession.skipLesson(studentId, lessonId, actualMinutes, at),
  })(req);
}
