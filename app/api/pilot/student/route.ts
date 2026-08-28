import { NextRequest } from 'next/server';
import { createPilotSessionRuntime } from '@/lib/pilot/runtime';
import { createPilotStudentGetHandler } from './handler';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const services = createPilotSessionRuntime();
  return createPilotStudentGetHandler({
    sessionSecret: () => process.env.SESSION_SECRET,
    getStudent: async (studentId) => {
      const student = await services.learning.getStudent(studentId);
      return student ? { displayName: student.displayName, levelId: student.levelId } : undefined;
    },
  })(req);
}
