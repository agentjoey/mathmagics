import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createPilotLessonGetHandler, createPilotLessonPostHandler } from '@/app/api/pilot/lesson/handler';
import { createPilotPracticePostHandler } from '@/app/api/pilot/practice/handler';
import { issueSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';

const SECRET = 'phase8-pilot-session-secret-that-is-long-enough';
const NOW = '2026-08-27T10:00:00.000Z';

async function authorizedHeaders() {
  const token = await issueSessionToken(SECRET);
  return { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' };
}

function request(url: string, headers: HeadersInit | undefined, body: unknown) {
  return new NextRequest(url, { method: 'POST', headers, body: JSON.stringify(body) });
}

describe('pilot lesson and practice API', () => {
  it('rejects unauthenticated commands before reading student state', async () => {
    const studentExists = vi.fn(async () => true);
    const startNextLesson = vi.fn();
    const lesson = createPilotLessonPostHandler({
      sessionSecret: () => SECRET,
      now: () => NOW,
      studentExists,
      startNextLesson,
      completeLesson: vi.fn(),
      skipLesson: vi.fn(),
    });
    const createPracticeSession = vi.fn();
    const practice = createPilotPracticePostHandler({
      sessionSecret: () => SECRET,
      now: () => NOW,
      studentExists,
      createPracticeSession,
      revealHint: vi.fn(),
      submitPracticeAttempt: vi.fn(),
    });

    expect((await lesson(request('http://localhost/api/pilot/lesson', undefined, { command: 'START', studentId: 'student-1' }))).status).toBe(401);
    expect((await practice(request('http://localhost/api/pilot/practice', undefined, { command: 'CREATE_SESSION', studentId: 'student-1', lessonId: 'lesson-1', objectiveId: 'P2-AS-002' }))).status).toBe(401);
    expect(studentExists).not.toHaveBeenCalled();
    expect(startNextLesson).not.toHaveBeenCalled();
    expect(createPracticeSession).not.toHaveBeenCalled();
  });

  it('reads the current STARTED lesson without mutating lesson execution', async () => {
    const headers = await authorizedHeaders();
    const getStartedLesson = vi.fn(async (studentId: string) => studentId === 'student-1'
      ? { lessonId: 'lesson-1', intent: 'LEARN', objectiveIds: ['P2-WN-005'], adapted: false, execution: { status: 'STARTED' } }
      : null);
    const handler = createPilotLessonGetHandler({
      sessionSecret: () => SECRET,
      studentExists: async (studentId: string) => studentId === 'student-1',
      getStartedLesson,
    });

    expect((await handler(new NextRequest('http://localhost/api/pilot/lesson?studentId=student-1'))).status).toBe(401);
    expect((await handler(new NextRequest('http://localhost/api/pilot/lesson', { headers }))).status).toBe(400);
    const response = await handler(new NextRequest('http://localhost/api/pilot/lesson?studentId=student-1', { headers }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ lesson: { lessonId: 'lesson-1', execution: { status: 'STARTED' } } });
    expect(getStartedLesson).toHaveBeenCalledWith('student-1');
  });

  it('dispatches only the approved lesson command union', async () => {
    const headers = await authorizedHeaders();
    const startNextLesson = vi.fn(async () => ({ lessonId: 'lesson-1', execution: { lessonId: 'lesson-1', status: 'STARTED' } }));
    const completeLesson = vi.fn(async () => ({ lessonId: 'lesson-1', status: 'COMPLETED' }));
    const skipLesson = vi.fn(async () => ({ lessonId: 'lesson-2', status: 'SKIPPED' }));
    const handler = createPilotLessonPostHandler({
      sessionSecret: () => SECRET,
      now: () => NOW,
      studentExists: async (studentId: string) => studentId === 'student-1',
      startNextLesson,
      completeLesson,
      skipLesson,
    });

    expect((await handler(request('http://localhost/api/pilot/lesson', headers, { command: 'START', studentId: 'student-1' }))).status).toBe(200);
    expect((await handler(request('http://localhost/api/pilot/lesson', headers, { command: 'COMPLETE', studentId: 'student-1', lessonId: 'lesson-1', actualMinutes: 30 }))).status).toBe(200);
    expect((await handler(request('http://localhost/api/pilot/lesson', headers, { command: 'SKIP', studentId: 'student-1', lessonId: 'lesson-2' }))).status).toBe(200);
    expect(startNextLesson).toHaveBeenCalledWith('student-1', NOW);
    expect(completeLesson).toHaveBeenCalledWith('student-1', 'lesson-1', 30, NOW);
    expect(skipLesson).toHaveBeenCalledWith('student-1', 'lesson-2', undefined, NOW);
  });

  it('dispatches the approved practice commands without accepting client authority', async () => {
    const headers = await authorizedHeaders();
    const createPracticeSession = vi.fn(async () => ({ id: 'session-1' }));
    const revealHint = vi.fn(async () => 'hint');
    const submitPracticeAttempt = vi.fn(async () => ({ id: 'attempt-1', outcome: 'CORRECT' }));
    const handler = createPilotPracticePostHandler({
      sessionSecret: () => SECRET,
      now: () => NOW,
      studentExists: async (studentId: string) => studentId === 'student-1',
      createPracticeSession,
      revealHint,
      submitPracticeAttempt,
    });

    expect((await handler(request('http://localhost/api/pilot/practice', headers, {
      command: 'CREATE_SESSION', studentId: 'student-1', lessonId: 'lesson-1', objectiveId: 'P2-AS-002',
    }))).status).toBe(200);
    expect((await handler(request('http://localhost/api/pilot/practice', headers, {
      command: 'REVEAL_HINT', studentId: 'student-1', sessionId: 'session-1', itemId: 'item-1',
    }))).status).toBe(200);
    expect((await handler(request('http://localhost/api/pilot/practice', headers, {
      command: 'SUBMIT_ATTEMPT', studentId: 'student-1', attemptId: 'attempt-1', sessionId: 'session-1', itemId: 'item-1', answerText: '12',
    }))).status).toBe(200);

    for (const authority of [
      { outcome: 'CORRECT' },
      { answerSpec: { kind: 'INTEGER', value: '12' } },
      { hintUsed: false },
      { mastery: 'MASTERED' },
      { evidence: { type: 'CORRECT_INDEPENDENT' } },
      { arbitraryFutureAuthority: true },
    ]) {
      const response = await handler(request('http://localhost/api/pilot/practice', headers, {
        command: 'SUBMIT_ATTEMPT', studentId: 'student-1', attemptId: 'blocked', sessionId: 'session-1', itemId: 'item-1', answerText: '12',
        ...authority,
      }));
      expect(response.status).toBe(400);
    }
    expect(submitPracticeAttempt).toHaveBeenCalledTimes(1);
  });

  it('returns 400 for missing/unknown students and exposes bounded route modules', async () => {
    const headers = await authorizedHeaders();
    const lesson = createPilotLessonPostHandler({
      sessionSecret: () => SECRET,
      now: () => NOW,
      studentExists: async () => false,
      startNextLesson: vi.fn(), completeLesson: vi.fn(), skipLesson: vi.fn(),
    });
    expect((await lesson(request('http://localhost/api/pilot/lesson', headers, { command: 'START' }))).status).toBe(400);
    expect((await lesson(request('http://localhost/api/pilot/lesson', headers, { command: 'START', studentId: 'unknown' }))).status).toBe(404);

    const lessonRoute = await import('@/app/api/pilot/lesson/route');
    const practiceRoute = await import('@/app/api/pilot/practice/route');
    expect(typeof lessonRoute.GET).toBe('function');
    expect(typeof lessonRoute.POST).toBe('function');
    expect(lessonRoute.runtime).toBe('nodejs');
    for (const method of ['PUT', 'PATCH', 'DELETE']) expect(method in lessonRoute).toBe(false);

    expect(typeof practiceRoute.POST).toBe('function');
    expect(practiceRoute.runtime).toBe('nodejs');
    for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) expect(method in practiceRoute).toBe(false);
  });
});
