import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth/session';
import type { ParentProgressView } from '@/lib/progress';
import { createPhase7Runtime } from '@/lib/adaptation/runtime';

export const runtime = 'nodejs';

export interface ProgressGetHandlerDependencies {
  sessionSecret(): string | undefined;
  now(): string;
  studentExists(studentId: string): Promise<boolean>;
  getView(studentId: string, evaluatedAt: string): Promise<ParentProgressView>;
}

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function authorized(req: NextRequest, secret: string | undefined): Promise<boolean> {
  if (!secret) return false;
  return verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value, secret);
}

export function createProgressGetHandler(dependencies: ProgressGetHandlerDependencies) {
  return async function progressGet(req: NextRequest) {
    if (!(await authorized(req, dependencies.sessionSecret()))) return error('Unauthorized', 401);
    const studentId = req.nextUrl.searchParams.get('studentId')?.trim();
    if (!studentId) return error('studentId is required', 400);
    if (!(await dependencies.studentExists(studentId))) return error('Student not found', 404);
    const view = await dependencies.getView(studentId, dependencies.now());
    return NextResponse.json(view);
  };
}

export async function GET(req: NextRequest) {
  const services = createPhase7Runtime();
  return createProgressGetHandler({
    sessionSecret: () => process.env.SESSION_SECRET,
    now: services.clock.now,
    studentExists: async (studentId) => (await services.learning.getStudent(studentId)) !== undefined,
    getView: (studentId, evaluatedAt) => services.parentProgressService.getView(studentId, evaluatedAt),
  })(req);
}
