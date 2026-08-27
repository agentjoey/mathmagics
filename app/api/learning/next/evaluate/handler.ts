import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth/session';
import type { StudentNextLessonView } from '@/lib/adaptation';

export interface NextEvaluatePostHandlerDependencies {
  sessionSecret(): string | undefined;
  studentExists(studentId: string): Promise<boolean>;
  evaluate(studentId: string): Promise<StudentNextLessonView | null>;
}

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function authorized(req: NextRequest, secret: string | undefined): Promise<boolean> {
  if (!secret) return false;
  return verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value, secret);
}

async function hasClientAuthorityFields(req: NextRequest): Promise<boolean | 'INVALID_JSON'> {
  const raw = await req.text();
  if (!raw.trim()) return false;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') return 'INVALID_JSON';
    return Object.keys(parsed as Record<string, unknown>).length > 0;
  } catch {
    return 'INVALID_JSON';
  }
}

export function createNextEvaluatePostHandler(dependencies: NextEvaluatePostHandlerDependencies) {
  return async function nextEvaluatePost(req: NextRequest) {
    if (!(await authorized(req, dependencies.sessionSecret()))) return error('Unauthorized', 401);
    const studentId = req.nextUrl.searchParams.get('studentId')?.trim();
    if (!studentId) return error('studentId is required', 400);
    if (!(await dependencies.studentExists(studentId))) return error('Student not found', 404);
    const authorityFields = await hasClientAuthorityFields(req);
    if (authorityFields === 'INVALID_JSON') return error('Request body must be an empty JSON object', 400);
    if (authorityFields) return error('Adaptive authority fields are server-owned', 400);
    return NextResponse.json({ nextLesson: await dependencies.evaluate(studentId) });
  };
}
