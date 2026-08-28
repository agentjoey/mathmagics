import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { createPilotLessonPostHandler } from '@/app/api/pilot/lesson/handler';
import { issueSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';

const SECRET = 'phase8-pilot-lesson-error-secret-that-is-long-enough';

async function headers() {
  const token = await issueSessionToken(SECRET);
  return { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' };
}

describe('pilot lesson API error boundary', () => {
  it('returns structured JSON when no lesson is available instead of an empty 500', async () => {
    const handler = createPilotLessonPostHandler({
      sessionSecret: () => SECRET,
      now: () => '2026-08-28T08:00:00.000Z',
      studentExists: async () => true,
      startNextLesson: async () => { throw new Error('No available lesson for student'); },
      completeLesson: async () => undefined,
      skipLesson: async () => undefined,
    });

    const response = await handler(new NextRequest('http://localhost/api/pilot/lesson', {
      method: 'POST',
      headers: await headers(),
      body: JSON.stringify({ command: 'START', studentId: 'student-1' }),
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: '当前没有可开始的学习安排' });
  });
});
