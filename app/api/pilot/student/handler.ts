import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth/session';

export interface PilotStudentGetDependencies {
  sessionSecret(): string | undefined;
  getStudent(studentId: string): Promise<{ displayName: string; levelId: 'P2' | 'P3' } | undefined>;
}

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function authorized(req: NextRequest, secret: string | undefined): Promise<boolean> {
  if (!secret) return false;
  return verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value, secret);
}

export function createPilotStudentGetHandler(dependencies: PilotStudentGetDependencies) {
  return async function pilotStudentGet(req: NextRequest) {
    if (!(await authorized(req, dependencies.sessionSecret()))) return error('Unauthorized', 401);
    const studentId = req.nextUrl.searchParams.get('studentId')?.trim();
    if (!studentId) return error('studentId is required', 400);
    const student = await dependencies.getStudent(studentId);
    if (!student) return error('Student not found', 404);
    return NextResponse.json({ displayName: student.displayName, levelId: student.levelId });
  };
}
