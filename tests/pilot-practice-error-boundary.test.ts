import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { createPilotPracticePostHandler } from '@/app/api/pilot/practice/handler';
import { issueSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';

const SECRET = 'phase8-pilot-practice-error-secret-that-is-long-enough';

async function headers() {
  const token = await issueSessionToken(SECRET);
  return { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' };
}

describe('pilot practice API error boundary', () => {
  it('returns structured JSON for an unsupported practice objective instead of an empty 500', async () => {
    const handler = createPilotPracticePostHandler({
      sessionSecret: () => SECRET,
      now: () => '2026-08-28T08:00:00.000Z',
      studentExists: async () => true,
      createPracticeSession: async () => { throw new Error('Unsupported practice objective: P2-WN-001'); },
      revealHint: async () => '',
      submitPracticeAttempt: async () => { throw new Error('not used'); },
    });

    const response = await handler(new NextRequest('http://localhost/api/pilot/practice', {
      method: 'POST',
      headers: await headers(),
      body: JSON.stringify({
        command: 'CREATE_SESSION',
        studentId: 'student-1',
        lessonId: 'lesson-1',
        objectiveId: 'P2-WN-001',
      }),
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: '本节暂无系统练习题' });
  });
});
