import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth/session';
import type { DiagnosisTarget } from '@/lib/correction';

export interface PilotCorrectionHandlerDependencies {
  sessionSecret(): string | undefined;
  now(): string;
  studentExists(studentId: string): Promise<boolean>;
  listOpenMistakes(studentId: string): Promise<unknown>;
  getMistake(studentId: string, mistakeId: string): Promise<unknown>;
  proposeDiagnosis(studentId: string, mistakeId: string, at: string): Promise<unknown>;
  confirmDiagnosis(
    studentId: string,
    input: { mistakeId: string; target: DiagnosisTarget; confirmerRole: 'STUDENT' | 'PARENT' },
    at: string,
  ): Promise<unknown>;
  startCorrection(studentId: string, mistakeId: string, at: string): Promise<unknown>;
  submitCorrectionRetry(
    studentId: string,
    input: { mistakeId: string; correctionItemId: string; attemptId: string; answerText: string },
    at: string,
  ): Promise<unknown>;
  revealReasoningHelp(studentId: string, mistakeId: string, checkId: string, at: string): Promise<void>;
  submitReasoningCheck(
    studentId: string,
    input: { mistakeId: string; checkId: string; submissionId: string; response: Record<string, string> },
    at: string,
  ): Promise<unknown>;
  prepareTransfer(studentId: string, mistakeId: string, at: string): Promise<unknown>;
  submitTransferAttempt(
    studentId: string,
    input: { mistakeId: string; correctionItemId: string; attemptId: string; answerText: string },
    at: string,
  ): Promise<unknown>;
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

function stringRecord(value: unknown): value is Record<string, string> {
  const candidate = record(value);
  return candidate !== null && Object.values(candidate).every((entry) => typeof entry === 'string');
}

const GENERIC_CODES = new Set(['FACT_ERROR', 'PROCEDURE_ERROR', 'REPRESENTATION_ERROR', 'UNKNOWN']);

function diagnosisTarget(value: unknown): DiagnosisTarget | null {
  const candidate = record(value);
  if (!candidate || candidate.kind === 'MISCONCEPTION') {
    if (!candidate
      || Object.keys(candidate).some((key) => key !== 'kind' && key !== 'misconceptionId')
      || !nonEmptyString(candidate.misconceptionId)) return null;
    return { kind: 'MISCONCEPTION', misconceptionId: candidate.misconceptionId };
  }
  if (candidate.kind === 'GENERIC') {
    if (Object.keys(candidate).some((key) => key !== 'kind' && key !== 'code')
      || typeof candidate.code !== 'string'
      || !GENERIC_CODES.has(candidate.code)) return null;
    return { kind: 'GENERIC', code: candidate.code as Extract<DiagnosisTarget, { kind: 'GENERIC' }>['code'] };
  }
  return null;
}

async function authorizedStudent(
  req: NextRequest,
  dependencies: PilotCorrectionHandlerDependencies,
): Promise<{ studentId: string } | NextResponse> {
  if (!(await authorized(req, dependencies.sessionSecret()))) return error('Unauthorized', 401);
  const studentId = req.nextUrl.searchParams.get('studentId')?.trim();
  if (!studentId) return error('studentId is required', 400);
  if (!(await dependencies.studentExists(studentId))) return error('Student not found', 404);
  return { studentId };
}

export function createPilotCorrectionGetHandler(dependencies: PilotCorrectionHandlerDependencies) {
  return async function pilotCorrectionGet(req: NextRequest) {
    const auth = await authorizedStudent(req, dependencies);
    if (auth instanceof NextResponse) return auth;
    const allowed = new Set(['studentId', 'mistakeId']);
    if ([...req.nextUrl.searchParams.keys()].some((key) => !allowed.has(key))) return error('Unsupported query parameter', 400);
    const mistakeId = req.nextUrl.searchParams.get('mistakeId')?.trim();
    if (mistakeId) return NextResponse.json(await dependencies.getMistake(auth.studentId, mistakeId));
    return NextResponse.json({ mistakes: await dependencies.listOpenMistakes(auth.studentId) });
  };
}

export function createPilotCorrectionPostHandler(dependencies: PilotCorrectionHandlerDependencies) {
  return async function pilotCorrectionPost(req: NextRequest) {
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
      if (body.command === 'PROPOSE_DIAGNOSIS' || body.command === 'START' || body.command === 'PREPARE_TRANSFER') {
        if (!hasExactKeys(body, ['command', 'studentId', 'mistakeId']) || !nonEmptyString(body.mistakeId)) {
          return error(`Invalid ${body.command} command`, 400);
        }
        if (body.command === 'PROPOSE_DIAGNOSIS') return NextResponse.json(await dependencies.proposeDiagnosis(studentId, body.mistakeId, at));
        if (body.command === 'START') return NextResponse.json(await dependencies.startCorrection(studentId, body.mistakeId, at));
        return NextResponse.json(await dependencies.prepareTransfer(studentId, body.mistakeId, at));
      }

      if (body.command === 'CONFIRM_DIAGNOSIS') {
        const target = diagnosisTarget(body.target);
        if (!hasExactKeys(body, ['command', 'studentId', 'mistakeId', 'target', 'confirmerRole'])
          || !nonEmptyString(body.mistakeId)
          || !target
          || (body.confirmerRole !== 'STUDENT' && body.confirmerRole !== 'PARENT')) {
          return error('Invalid CONFIRM_DIAGNOSIS command', 400);
        }
        return NextResponse.json(await dependencies.confirmDiagnosis(studentId, {
          mistakeId: body.mistakeId,
          target,
          confirmerRole: body.confirmerRole,
        }, at));
      }

      if (body.command === 'SUBMIT_RETRY' || body.command === 'SUBMIT_TRANSFER') {
        if (!hasExactKeys(body, ['command', 'studentId', 'mistakeId', 'correctionItemId', 'attemptId', 'answerText'])
          || !nonEmptyString(body.mistakeId)
          || !nonEmptyString(body.correctionItemId)
          || !nonEmptyString(body.attemptId)
          || typeof body.answerText !== 'string') {
          return error(`Invalid ${body.command} command`, 400);
        }
        const input = {
          mistakeId: body.mistakeId,
          correctionItemId: body.correctionItemId,
          attemptId: body.attemptId,
          answerText: body.answerText,
        };
        return NextResponse.json(body.command === 'SUBMIT_RETRY'
          ? await dependencies.submitCorrectionRetry(studentId, input, at)
          : await dependencies.submitTransferAttempt(studentId, input, at));
      }

      if (body.command === 'REVEAL_REASONING_HELP') {
        if (!hasExactKeys(body, ['command', 'studentId', 'mistakeId', 'checkId'])
          || !nonEmptyString(body.mistakeId)
          || !nonEmptyString(body.checkId)) {
          return error('Invalid REVEAL_REASONING_HELP command', 400);
        }
        await dependencies.revealReasoningHelp(studentId, body.mistakeId, body.checkId, at);
        return NextResponse.json({ ok: true });
      }

      if (body.command === 'SUBMIT_REASONING') {
        if (!hasExactKeys(body, ['command', 'studentId', 'mistakeId', 'checkId', 'submissionId', 'response'])
          || !nonEmptyString(body.mistakeId)
          || !nonEmptyString(body.checkId)
          || !nonEmptyString(body.submissionId)
          || !stringRecord(body.response)) {
          return error('Invalid SUBMIT_REASONING command', 400);
        }
        return NextResponse.json(await dependencies.submitReasoningCheck(studentId, {
          mistakeId: body.mistakeId,
          checkId: body.checkId,
          submissionId: body.submissionId,
          response: body.response,
        }, at));
      }

      return error('Unsupported correction command', 400);
    } catch {
      return error('订正暂时无法处理', 500);
    }
  };
}
