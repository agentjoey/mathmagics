import { NextRequest } from 'next/server';
import { createPilotSessionRuntime } from '@/lib/pilot/runtime';
import { createPilotHomeworkPostHandler } from './handler';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const services = createPilotSessionRuntime();
  return createPilotHomeworkPostHandler({
    sessionSecret: () => process.env.SESSION_SECRET,
    now: services.clock.now,
    studentExists: async (studentId) => (await services.learning.getStudent(studentId)) !== undefined,
    submitHomework: (studentId, bytes, mimeType, at) => services.pilotHomeworkCorrection.submitHomework(studentId, bytes, mimeType, at),
    confirmHomeworkProblem: (studentId, problemId, corrections, confirmerRole, at) => services.pilotHomeworkCorrection.confirmHomeworkProblem(studentId, problemId, corrections, confirmerRole, at),
    gradeHomeworkProblem: (studentId, problemId, attemptId, at) => services.pilotHomeworkCorrection.gradeHomeworkProblem(studentId, problemId, attemptId, at),
  })(req);
}
