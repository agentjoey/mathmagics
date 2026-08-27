import { Buffer } from 'node:buffer';
import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth/session';
import type { HomeworkMimeType } from '@/lib/homework';

export interface PilotHomeworkPostDependencies {
  sessionSecret(): string | undefined;
  now(): string;
  studentExists(studentId: string): Promise<boolean>;
  submitHomework(studentId: string, bytes: Uint8Array, mimeType: HomeworkMimeType, at: string): Promise<unknown>;
  confirmHomeworkProblem(
    studentId: string,
    problemId: string,
    corrections: Record<string, string>,
    confirmerRole: 'STUDENT' | 'PARENT',
    at: string,
  ): Promise<unknown>;
  gradeHomeworkProblem(studentId: string, problemId: string, attemptId: string, at: string): Promise<unknown>;
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

function hasExactKeys(body: Record<string, unknown>, required: string[]): boolean {
  const allowed = new Set(required);
  return required.every((key) => key in body) && Object.keys(body).every((key) => allowed.has(key));
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function homeworkMimeType(value: unknown): value is HomeworkMimeType {
  return value === 'image/jpeg' || value === 'image/png' || value === 'image/webp';
}

function stringRecord(value: unknown): value is Record<string, string> {
  const candidate = record(value);
  return candidate !== null && Object.values(candidate).every((entry) => typeof entry === 'string');
}

function decodeBase64(value: unknown): Uint8Array | null {
  if (!nonEmptyString(value) || !/^[A-Za-z0-9+/]*={0,2}$/u.test(value) || value.length % 4 !== 0) return null;
  const buffer = Buffer.from(value, 'base64');
  if (buffer.length === 0 || buffer.toString('base64') !== value) return null;
  return new Uint8Array(buffer);
}

export function createPilotHomeworkPostHandler(dependencies: PilotHomeworkPostDependencies) {
  return async function pilotHomeworkPost(req: NextRequest) {
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

    if (body.command === 'SUBMIT') {
      if (!hasExactKeys(body, ['command', 'studentId', 'bytesBase64', 'mimeType'])) {
        return error('Unsupported request field', 400);
      }
      const bytes = decodeBase64(body.bytesBase64);
      if (!bytes || !homeworkMimeType(body.mimeType)) return error('Invalid SUBMIT command', 400);
      return NextResponse.json(await dependencies.submitHomework(studentId, bytes, body.mimeType, at));
    }

    if (body.command === 'CONFIRM') {
      if (!hasExactKeys(body, ['command', 'studentId', 'problemId', 'corrections', 'confirmerRole'])
        || !nonEmptyString(body.problemId)
        || !stringRecord(body.corrections)
        || (body.confirmerRole !== 'STUDENT' && body.confirmerRole !== 'PARENT')) {
        return error('Invalid CONFIRM command', 400);
      }
      return NextResponse.json(await dependencies.confirmHomeworkProblem(
        studentId,
        body.problemId,
        body.corrections,
        body.confirmerRole,
        at,
      ));
    }

    if (body.command === 'GRADE') {
      if (!hasExactKeys(body, ['command', 'studentId', 'problemId', 'attemptId'])
        || !nonEmptyString(body.problemId)
        || !nonEmptyString(body.attemptId)) {
        return error('Invalid GRADE command', 400);
      }
      return NextResponse.json(await dependencies.gradeHomeworkProblem(studentId, body.problemId, body.attemptId, at));
    }

    return error('Unsupported homework command', 400);
  };
}
