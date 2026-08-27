import { NextRequest } from 'next/server';
import { createPhase7Runtime } from '@/lib/adaptation/runtime';
import { createProgressGetHandler } from './handler';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const services = createPhase7Runtime();
  return createProgressGetHandler({
    sessionSecret: () => process.env.SESSION_SECRET,
    now: services.clock.now,
    studentExists: async (studentId) => (await services.learning.getStudent(studentId)) !== undefined,
    getView: (studentId, evaluatedAt) => services.parentProgressService.getView(studentId, evaluatedAt),
  })(req);
}
