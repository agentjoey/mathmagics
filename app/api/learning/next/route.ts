import { NextRequest } from 'next/server';
import { createPhase7Runtime } from '@/lib/adaptation/runtime';
import { findNextEffectiveLesson, toStudentNextLessonView } from '@/lib/adaptation';
import { createNextGetHandler } from './handler';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const services = createPhase7Runtime();
  return createNextGetHandler({
    sessionSecret: () => process.env.SESSION_SECRET,
    now: services.clock.now,
    studentExists: async (studentId) => (await services.learning.getStudent(studentId)) !== undefined,
    getNext: async (studentId, evaluatedAt) => {
      const projection = await findNextEffectiveLesson(services.planning, services.adaptive, studentId, evaluatedAt);
      return projection ? toStudentNextLessonView({ effectiveLesson: projection.effectiveLesson }) : null;
    },
  })(req);
}
