import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth/session';
import type { SubmitAttemptInput } from '@/lib/practice';

export interface PilotPracticePostDependencies {
  sessionSecret(): string | undefined;
  now(): string;
  studentExists(studentId: string): Promise<boolean>;
  createPracticeSession(studentId: string, lessonId: string, objectiveId: string, at: string): Promise<unknown>;
  revealHint(studentId: string, sessionId: string, itemId: string, at: string): Promise<unknown>;
  submitPracticeAttempt(studentId: string, input: SubmitAttemptInput, at: string): Promise<unknown>;
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
  if (reason instanceof Error && reason.message.startsWith('Unsupported practice objective:')) {
    return error('本节暂无系统练习题', 409);
  }
  return error('练习暂时无法处理', 500);
}

export function createPilotPracticePostHandler(dependencies: PilotPracticePostDependencies) {
  return async function pilotPracticePost(req: NextRequest) {
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
      if (body.command === 'CREATE_SESSION') {
        if (!hasExactKeys(body, ['command', 'studentId', 'lessonId', 'objectiveId'])
          || !nonEmptyString(body.lessonId)
          || !nonEmptyString(body.objectiveId)) return error('Invalid CREATE_SESSION command', 400);
        return NextResponse.json(await dependencies.createPracticeSession(studentId, body.lessonId, body.objectiveId, at));
      }
      if (body.command === 'REVEAL_HINT') {
        if (!hasExactKeys(body, ['command', 'studentId', 'sessionId', 'itemId'])
          || !nonEmptyString(body.sessionId)
          || !nonEmptyString(body.itemId)) return error('Invalid REVEAL_HINT command', 400);
        return NextResponse.json({ hint: await dependencies.revealHint(studentId, body.sessionId, body.itemId, at) });
      }
      if (body.command === 'SUBMIT_ATTEMPT') {
        if (!hasExactKeys(body, ['command', 'studentId', 'attemptId', 'sessionId', 'itemId', 'answerText'], ['retryOfAttemptId'])
          || !nonEmptyString(body.attemptId)
          || !nonEmptyString(body.sessionId)
          || !nonEmptyString(body.itemId)
          || typeof body.answerText !== 'string'
          || (body.retryOfAttemptId !== undefined && !nonEmptyString(body.retryOfAttemptId))) {
          return error('Invalid SUBMIT_ATTEMPT command', 400);
        }
        const input: SubmitAttemptInput = {
          attemptId: body.attemptId,
          sessionId: body.sessionId,
          itemId: body.itemId,
          answerText: body.answerText,
          ...(body.retryOfAttemptId ? { retryOfAttemptId: body.retryOfAttemptId as string } : {}),
        };
        return NextResponse.json(await dependencies.submitPracticeAttempt(studentId, input, at));
      }
      return error('Unsupported practice command', 400);
    } catch (reason) {
      return serviceError(reason);
    }
  };
}
