import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth/session';
import { createPhase7Runtime } from '@/lib/adaptation/runtime';
import { findNextEffectiveLesson, toStudentNextLessonView } from '@/lib/adaptation';
import type { StudentNextLessonView } from '@/lib/adaptation';

export const runtime = 'nodejs';

export interface NextGetHandlerDependencies {
  sessionSecret(): string | undefined;
  now(): string;
  studentExists(studentId: string): Promise<boolean>;
  getNext(studentId: string, evaluatedAt: string): Promise<StudentNextLessonView | null>;
}

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function authorized(req: NextRequest, secret: string | undefined): Promise<boolean> {
  if (!secret) return false;
  return verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value, secret);
}

export function createNextGetHandler(dependencies: NextGetHandlerDependencies) {
  return async function nextGet(req: NextRequest) {
    if (!(await authorized(req, dependencies.sessionSecret()))) return error('Unauthorized', 401);
    const studentId = req.nextUrl.searchParams.get('studentId')?.trim();
    if (!studentId) return error('studentId is required', 400);
    if (!(await dependencies.studentExists(studentId))) return error('Student not found', 404);
    return NextResponse.json({ nextLesson: await dependencies.getNext(studentId, dependencies.now()) });
  };
}

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
