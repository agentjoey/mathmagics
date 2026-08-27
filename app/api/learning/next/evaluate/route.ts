import { NextRequest } from 'next/server';
import { createPhase7Runtime } from '@/lib/adaptation/runtime';
import { toStudentNextLessonView } from '@/lib/adaptation';
import { createNextEvaluatePostHandler } from './handler';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const services = createPhase7Runtime();
  return createNextEvaluatePostHandler({
    sessionSecret: () => process.env.SESSION_SECRET,
    studentExists: async (studentId) => (await services.learning.getStudent(studentId)) !== undefined,
    evaluate: async (studentId) => {
      const result = await services.adaptiveService.evaluateNextPlannedLesson(studentId);
      return result ? toStudentNextLessonView({ effectiveLesson: result.effectiveLesson }) : null;
    },
  })(req);
}
