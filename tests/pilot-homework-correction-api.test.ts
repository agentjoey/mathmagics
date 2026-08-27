import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createPilotHomeworkPostHandler } from '@/app/api/pilot/homework/handler';
import {
  createPilotCorrectionGetHandler,
  createPilotCorrectionPostHandler,
} from '@/app/api/pilot/correction/handler';
import { issueSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';

const SECRET = 'phase8-homework-correction-secret-that-is-long-enough';
const NOW = '2026-08-27T11:00:00.000Z';

async function authorizedHeaders() {
  const token = await issueSessionToken(SECRET);
  return { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' };
}

function request(url: string, headers: HeadersInit | undefined, body: unknown) {
  return new NextRequest(url, { method: 'POST', headers, body: JSON.stringify(body) });
}

function homeworkDeps() {
  return {
    sessionSecret: () => SECRET,
    now: () => NOW,
    studentExists: vi.fn(async (studentId: string) => studentId === 'student-1'),
    submitHomework: vi.fn(async (_studentId: string, bytes: Uint8Array, mimeType: string, _at: string) => ({
      submission: { id: 'submission-1', byteLength: bytes.byteLength, mimeType },
      problems: [],
    })),
    confirmHomeworkProblem: vi.fn(async () => ({ trustState: 'CONFIRMED' })),
    gradeHomeworkProblem: vi.fn(async () => ({ attempt: { id: 'attempt-1', outcome: 'INCORRECT' }, evidenceId: 'evidence-1' })),
  };
}

function correctionDeps() {
  return {
    sessionSecret: () => SECRET,
    now: () => NOW,
    studentExists: vi.fn(async (studentId: string) => studentId === 'student-1'),
    listOpenMistakes: vi.fn(async () => [{ mistakeId: 'mistake-1', state: 'CONFIRMED' }]),
    getMistake: vi.fn(async () => ({ mistakeId: 'mistake-1', state: 'CONFIRMED' })),
    proposeDiagnosis: vi.fn(async () => ({ target: { kind: 'GENERIC', code: 'PROCEDURE_ERROR' }, rationale: 'candidate' })),
    confirmDiagnosis: vi.fn(async () => ({ mistakeId: 'mistake-1', state: 'CONFIRMED' })),
    startCorrection: vi.fn(async () => ({ mistake: { mistakeId: 'mistake-1' }, item: { id: 'retry-1', prompt: 'Try again' }, reasoningChecks: [] })),
    submitCorrectionRetry: vi.fn(async () => ({ id: 'retry-attempt', outcome: 'CORRECT' })),
    revealReasoningHelp: vi.fn(async () => undefined),
    submitReasoningCheck: vi.fn(async () => ({ id: 'reasoning-1', outcome: 'PASS' })),
    prepareTransfer: vi.fn(async () => ({ id: 'transfer-1', prompt: 'Apply it here' })),
    submitTransferAttempt: vi.fn(async () => ({ id: 'transfer-attempt', outcome: 'CORRECT' })),
  };
}

describe('pilot homework API', () => {
  it('rejects unauthenticated requests before student lookup', async () => {
    const deps = homeworkDeps();
    const handler = createPilotHomeworkPostHandler(deps);
    const response = await handler(request('http://localhost/api/pilot/homework', undefined, {
      command: 'SUBMIT', studentId: 'student-1', bytesBase64: 'AQID', mimeType: 'image/png',
    }));
    expect(response.status).toBe(401);
    expect(deps.studentExists).not.toHaveBeenCalled();
    expect(deps.submitHomework).not.toHaveBeenCalled();
  });

  it('decodes upload bytes server-side and rejects client-authored sha256 or unknown fields', async () => {
    const headers = await authorizedHeaders();
    const deps = homeworkDeps();
    const handler = createPilotHomeworkPostHandler(deps);

    const valid = await handler(request('http://localhost/api/pilot/homework', headers, {
      command: 'SUBMIT', studentId: 'student-1', bytesBase64: 'AQID', mimeType: 'image/png',
    }));
    expect(valid.status).toBe(200);
    expect(deps.submitHomework).toHaveBeenCalledWith(
      'student-1',
      expect.any(Uint8Array),
      'image/png',
      NOW,
    );
    expect((deps.submitHomework.mock.calls[0]![1] as Uint8Array)).toEqual(new Uint8Array([1, 2, 3]));

    for (const extra of [{ sha256: 'client-hash' }, { outcome: 'CORRECT' }, { arbitraryFutureAuthority: true }]) {
      const response = await handler(request('http://localhost/api/pilot/homework', headers, {
        command: 'SUBMIT', studentId: 'student-1', bytesBase64: 'AQID', mimeType: 'image/png', ...extra,
      }));
      expect(response.status).toBe(400);
    }
    expect(deps.submitHomework).toHaveBeenCalledTimes(1);
  });

  it('dispatches only CONFIRM and GRADE trusted coordinate inputs', async () => {
    const headers = await authorizedHeaders();
    const deps = homeworkDeps();
    const handler = createPilotHomeworkPostHandler(deps);

    expect((await handler(request('http://localhost/api/pilot/homework', headers, {
      command: 'CONFIRM', studentId: 'student-1', problemId: 'problem-1', corrections: { answer: '12' }, confirmerRole: 'PARENT',
    }))).status).toBe(200);
    expect((await handler(request('http://localhost/api/pilot/homework', headers, {
      command: 'GRADE', studentId: 'student-1', problemId: 'problem-1', attemptId: 'attempt-1',
    }))).status).toBe(200);
    expect(deps.confirmHomeworkProblem).toHaveBeenCalledWith('student-1', 'problem-1', { answer: '12' }, 'PARENT', NOW);
    expect(deps.gradeHomeworkProblem).toHaveBeenCalledWith('student-1', 'problem-1', 'attempt-1', NOW);
  });
});

describe('pilot correction API', () => {
  it('returns only authenticated student-owned correction reads', async () => {
    const deps = correctionDeps();
    const handler = createPilotCorrectionGetHandler(deps);
    expect((await handler(new NextRequest('http://localhost/api/pilot/correction?studentId=student-1'))).status).toBe(401);

    const headers = await authorizedHeaders();
    const list = await handler(new NextRequest('http://localhost/api/pilot/correction?studentId=student-1', { headers }));
    const one = await handler(new NextRequest('http://localhost/api/pilot/correction?studentId=student-1&mistakeId=mistake-1', { headers }));
    expect(list.status).toBe(200);
    await expect(list.json()).resolves.toEqual({ mistakes: [{ mistakeId: 'mistake-1', state: 'CONFIRMED' }] });
    expect(one.status).toBe(200);
    await expect(one.json()).resolves.toEqual({ mistakeId: 'mistake-1', state: 'CONFIRMED' });
  });

  it('dispatches the existing correction command inputs and rejects client authority fields', async () => {
    const headers = await authorizedHeaders();
    const deps = correctionDeps();
    const handler = createPilotCorrectionPostHandler(deps);

    const commands = [
      { command: 'PROPOSE_DIAGNOSIS', studentId: 'student-1', mistakeId: 'mistake-1' },
      { command: 'CONFIRM_DIAGNOSIS', studentId: 'student-1', mistakeId: 'mistake-1', target: { kind: 'GENERIC', code: 'PROCEDURE_ERROR' }, confirmerRole: 'PARENT' },
      { command: 'START', studentId: 'student-1', mistakeId: 'mistake-1' },
      { command: 'SUBMIT_RETRY', studentId: 'student-1', mistakeId: 'mistake-1', correctionItemId: 'retry-1', attemptId: 'retry-attempt', answerText: '12' },
      { command: 'REVEAL_REASONING_HELP', studentId: 'student-1', mistakeId: 'mistake-1', checkId: 'reasoning-1' },
      { command: 'SUBMIT_REASONING', studentId: 'student-1', mistakeId: 'mistake-1', checkId: 'reasoning-1', submissionId: 'reasoning-submit', response: { optionId: 'SMALLER' } },
      { command: 'PREPARE_TRANSFER', studentId: 'student-1', mistakeId: 'mistake-1' },
      { command: 'SUBMIT_TRANSFER', studentId: 'student-1', mistakeId: 'mistake-1', correctionItemId: 'transfer-1', attemptId: 'transfer-attempt', answerText: '>' },
    ];
    for (const body of commands) {
      const response = await handler(request('http://localhost/api/pilot/correction', headers, body));
      expect(response.status).toBe(200);
    }

    for (const authority of [
      { diagnosis: { code: 'anything' } },
      { mistakeState: 'RESOLVED' },
      { resolved: true },
      { evidence: { type: 'application_correct' } },
      { outcome: 'CORRECT' },
      { mastery: 'MASTERED' },
      { arbitraryFutureAuthority: true },
    ]) {
      const response = await handler(request('http://localhost/api/pilot/correction', headers, {
        command: 'START', studentId: 'student-1', mistakeId: 'mistake-1', ...authority,
      }));
      expect(response.status).toBe(400);
    }
    expect(deps.startCorrection).toHaveBeenCalledTimes(1);
  });

  it('exposes the approved route methods only', async () => {
    const homeworkRoute = await import('@/app/api/pilot/homework/route');
    const correctionRoute = await import('@/app/api/pilot/correction/route');
    expect(typeof homeworkRoute.POST).toBe('function');
    expect(homeworkRoute.runtime).toBe('nodejs');
    expect(typeof correctionRoute.GET).toBe('function');
    expect(typeof correctionRoute.POST).toBe('function');
    expect(correctionRoute.runtime).toBe('nodejs');
    for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) expect(method in homeworkRoute).toBe(false);
    for (const method of ['PUT', 'PATCH', 'DELETE']) expect(method in correctionRoute).toBe(false);
  });
});
