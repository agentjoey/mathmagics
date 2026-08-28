import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth/session';

export interface PilotLessonPostDependencies {
  sessionSecret(): string | undefined;
  now(): string;
  studentExists(studentId: string): Promise<boolean>;
  startNextLesson(studentId: string, at: string): Promise<unknown>;
  completeLesson(studentId: string, lessonId: string, actualMinutes: number, at: string): Promise<unknown>;
  skipLesson(studentId: string, lessonId: string, actualMinutes: number | undefined, at: string): Promise<unknown>;
}

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function authorized(req: NextRequest, secret: string | undefined): Promise<boolean> {
  if (!secret) return false;
  return verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value, secret);
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function hasExactKeys(body: Record<string, unknown>, required: string[], optional: string[] = []): boolean {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => key in body) && Object.keys(body).every((key) => allowed.has(key));
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function serviceError(reason: unknown) {
  if (reason instanceof Error && reason.message === 'No available lesson for student') {
    return error('当前没有可开始的学习安排', 409);
  }
  return error('学习安排暂时无法处理', 500);
}

export function createPilotLessonPostHandler(dependencies: PilotLessonPostDependencies) {
  return async function pilotLessonPost(req: NextRequest) {
    if (!(await authorized(req, dependencies.sessionSecret()))) return error('Unauthorized', 401);
    let body: Record<string, unknown> | null;
    try {
      body = record(await req.json());
    } catch {
      return error('Invalid JSON body', 400);
    }
    if (!body || !nonEmptyString(body.command)) return error('command is required', 400);
    if (!nonEmptyString(body.studentId)) return error('studentId is required', 400);
    const studentId = body.studentId;
    if (!(await dependencies.studentExists(studentId))) return error('Student not found', 404);
    const at = dependencies.now();

    try {
      if (body.command === 'START') {
        if (!hasExactKeys(body, ['command', 'studentId'])) return error('Unsupported request field', 400);
        return NextResponse.json(await dependencies.startNextLesson(studentId, at));
      }
      if (body.command === 'COMPLETE') {
        if (!hasExactKeys(body, ['command', 'studentId', 'lessonId', 'actualMinutes'])
          || !nonEmptyString(body.lessonId)
          || !Number.isInteger(body.actualMinutes)
          || (body.actualMinutes as number) <= 0) return error('Invalid COMPLETE command', 400);
        return NextResponse.json(await dependencies.completeLesson(studentId, body.lessonId, body.actualMinutes as number, at));
      }
      if (body.command === 'SKIP') {
        if (!hasExactKeys(body, ['command', 'studentId', 'lessonId'], ['actualMinutes'])
          || !nonEmptyString(body.lessonId)
          || (body.actualMinutes !== undefined && (!Number.isInteger(body.actualMinutes) || (body.actualMinutes as number) <= 0))) {
          return error('Invalid SKIP command', 400);
        }
        return NextResponse.json(await dependencies.skipLesson(studentId, body.lessonId, body.actualMinutes as number | undefined, at));
      }
      return error('Unsupported lesson command', 400);
    } catch (reason) {
      return serviceError(reason);
    }
  };
}
