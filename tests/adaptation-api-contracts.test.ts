import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { issueSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { createProgressGetHandler } from '@/app/api/progress/handler';
import { createNextGetHandler } from '@/app/api/learning/next/handler';
import { createNextEvaluatePostHandler } from '@/app/api/learning/next/evaluate/handler';

const SECRET = 'phase7-api-contract-secret-that-is-long-enough';
const NOW = '2026-08-26T10:40:00.000Z';

async function authorizedHeaders() {
  const token = await issueSessionToken(SECRET);
  return { cookie: `${SESSION_COOKIE_NAME}=${token}` };
}

const studentView = {
  lessonId: 'lesson-2',
  intent: 'CORRECTION' as const,
  objectiveSummary: 'Solve comparison word problems',
  adapted: true,
};

const parentView = {
  studentId: 'student-1',
  levelId: 'P2' as const,
  evaluatedAt: NOW,
  summary: {
    objectivesIntroduced: 1,
    objectivesPractised: 1,
    objectivesMastered: 0,
    strugglingObjectives: 1,
    reviewDueObjectives: 0,
    activeMistakes: 1,
    recurrentMistakes: 1,
    observedStrategies: 1,
    developingStrategies: 1,
    reliableStrategies: 0,
  },
  topics: [],
  strategies: [],
  mistakes: { active: [], resolved: [], recurring: [] },
  nextLesson: null,
};

describe('Phase 7 adaptive API contracts', () => {
  it('rejects unsigned progress and next-lesson requests before reading student state', async () => {
    const studentExists = vi.fn(async () => true);
    const progress = createProgressGetHandler({
      sessionSecret: () => SECRET,
      now: () => NOW,
      studentExists,
      getView: async () => parentView,
    });
    const next = createNextGetHandler({
      sessionSecret: () => SECRET,
      now: () => NOW,
      studentExists,
      getNext: async () => studentView,
    });

    expect((await progress(new NextRequest('http://localhost/api/progress?studentId=student-1'))).status).toBe(401);
    expect((await next(new NextRequest('http://localhost/api/learning/next?studentId=student-1'))).status).toBe(401);
    expect(studentExists).not.toHaveBeenCalled();
  });

  it('validates explicit student selection and returns the parent progress projection', async () => {
    const headers = await authorizedHeaders();
    const handler = createProgressGetHandler({
      sessionSecret: () => SECRET,
      now: () => NOW,
      studentExists: async (studentId) => studentId === 'student-1',
      getView: async (studentId, evaluatedAt) => ({ ...parentView, studentId, evaluatedAt }),
    });

    const missing = await handler(new NextRequest('http://localhost/api/progress', { headers }));
    const unknown = await handler(new NextRequest('http://localhost/api/progress?studentId=unknown', { headers }));
    const valid = await handler(new NextRequest('http://localhost/api/progress?studentId=student-1', { headers }));

    expect(missing.status).toBe(400);
    expect(unknown.status).toBe(404);
    expect(valid.status).toBe(200);
    await expect(valid.json()).resolves.toEqual(parentView);
  });

  it('returns only the thin student next-lesson projection', async () => {
    const headers = await authorizedHeaders();
    const handler = createNextGetHandler({
      sessionSecret: () => SECRET,
      now: () => NOW,
      studentExists: async () => true,
      getNext: async () => studentView,
    });

    const response = await handler(new NextRequest('http://localhost/api/learning/next?studentId=student-1', { headers }));
    expect(response.status).toBe(200);
    const serialized = await response.clone().text();
    await expect(response.json()).resolves.toEqual({ nextLesson: studentView });
    expect(serialized).not.toContain('policyVersion');
    expect(serialized).not.toContain('rationaleCodes');
    expect(serialized).not.toContain('MistakePriority');
  });

  it('rejects client-authored adaptive authority and accepts an empty reevaluation request', async () => {
    const headers = { ...(await authorizedHeaders()), 'content-type': 'application/json' };
    const evaluate = vi.fn(async () => studentView);
    const handler = createNextEvaluatePostHandler({
      sessionSecret: () => SECRET,
      studentExists: async () => true,
      evaluate,
    });

    for (const body of [
      { intent: 'CORRECTION' },
      { objectiveId: 'P2-AS-002' },
      { priority: 'BLOCKING' },
      { mastery: 'MASTERED' },
      { rationale: ['because'] },
      { evaluatedAt: NOW },
      { inputFactCutoff: NOW },
    ]) {
      const response = await handler(new NextRequest('http://localhost/api/learning/next/evaluate?studentId=student-1', {
        method: 'POST', headers, body: JSON.stringify(body),
      }));
      expect(response.status).toBe(400);
    }
    expect(evaluate).not.toHaveBeenCalled();

    const response = await handler(new NextRequest('http://localhost/api/learning/next/evaluate?studentId=student-1', {
      method: 'POST', headers, body: '{}',
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ nextLesson: studentView });
    expect(evaluate).toHaveBeenCalledOnce();
  });
});
