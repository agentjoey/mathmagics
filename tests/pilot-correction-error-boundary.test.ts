import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { createPilotCorrectionPostHandler } from '@/app/api/pilot/correction/handler';
import { issueSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';

const SECRET = 'phase8-pilot-correction-error-secret-that-is-long-enough';

async function headers() {
  const token = await issueSessionToken(SECRET);
  return { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' };
}

describe('pilot correction API error boundary', () => {
  it('returns structured JSON when diagnosis support fails instead of an empty 500', async () => {
    const handler = createPilotCorrectionPostHandler({
      sessionSecret: () => SECRET,
      now: () => '2026-08-28T08:00:00.000Z',
      studentExists: async () => true,
      listOpenMistakes: async () => [],
      getMistake: async () => undefined,
      proposeDiagnosis: async () => { throw new Error('provider unavailable'); },
      confirmDiagnosis: async () => undefined,
      startCorrection: async () => undefined,
      submitCorrectionRetry: async () => undefined,
      revealReasoningHelp: async () => undefined,
      submitReasoningCheck: async () => undefined,
      prepareTransfer: async () => undefined,
      submitTransferAttempt: async () => undefined,
    });

    const response = await handler(new NextRequest('http://localhost/api/pilot/correction', {
      method: 'POST',
      headers: await headers(),
      body: JSON.stringify({ command: 'PROPOSE_DIAGNOSIS', studentId: 'student-1', mistakeId: 'mistake-1' }),
    }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: '订正暂时无法处理' });
  });
});
