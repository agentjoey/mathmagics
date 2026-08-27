import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createPilotReviewGetHandler } from '@/app/api/pilot/review/handler';
import { issueSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import type { PilotReview } from '@/lib/pilot';

const SECRET = 'phase8-pilot-review-secret-that-is-long-enough';
const NOW = '2026-08-27T10:00:00.000Z';

async function authorizedHeaders() {
  const token = await issueSessionToken(SECRET);
  return { cookie: `${SESSION_COOKIE_NAME}=${token}` };
}

function review(studentId = 'student-1', evaluatedAt = NOW): PilotReview {
  return {
    studentId,
    evaluatedAt,
    progress: {
      studentId,
      levelId: 'P2',
      evaluatedAt,
      summary: {
        objectivesIntroduced: 0,
        objectivesPractised: 0,
        objectivesMastered: 0,
        strugglingObjectives: 0,
        reviewDueObjectives: 0,
        activeMistakes: 0,
        recurrentMistakes: 0,
        observedStrategies: 0,
        developingStrategies: 0,
        reliableStrategies: 0,
      },
      topics: [],
      strategies: [],
      mistakes: { active: [], resolved: [], recurring: [] },
      nextLesson: null,
    },
    lessons: [],
    recentAdaptiveDecisions: [],
    nextLesson: null,
  };
}

describe('pilot review API', () => {
  it('rejects unauthenticated requests before reading student state', async () => {
    const studentExists = vi.fn(async () => true);
    const getReview = vi.fn(async () => review());
    const handler = createPilotReviewGetHandler({
      sessionSecret: () => SECRET,
      now: () => NOW,
      studentExists,
      getReview,
    });

    const response = await handler(new NextRequest('http://localhost/api/pilot/review?studentId=student-1'));
    expect(response.status).toBe(401);
    expect(studentExists).not.toHaveBeenCalled();
    expect(getReview).not.toHaveBeenCalled();
  });

  it('validates student selection and returns the exact read-only review payload', async () => {
    const headers = await authorizedHeaders();
    const getReview = vi.fn(async (studentId: string, evaluatedAt: string) => review(studentId, evaluatedAt));
    const handler = createPilotReviewGetHandler({
      sessionSecret: () => SECRET,
      now: () => NOW,
      studentExists: async (studentId: string) => studentId === 'student-1',
      getReview,
    });

    const missing = await handler(new NextRequest('http://localhost/api/pilot/review', { headers }));
    const unknown = await handler(new NextRequest('http://localhost/api/pilot/review?studentId=unknown', { headers }));
    const valid = await handler(new NextRequest('http://localhost/api/pilot/review?studentId=student-1', { headers }));

    expect(missing.status).toBe(400);
    expect(unknown.status).toBe(404);
    expect(valid.status).toBe(200);
    await expect(valid.json()).resolves.toEqual(review());
    expect(getReview).toHaveBeenCalledWith('student-1', NOW);
  });

  it('exports only the read-only GET route surface', async () => {
    const route = await import('@/app/api/pilot/review/route');
    expect(typeof route.GET).toBe('function');
    expect(route.runtime).toBe('nodejs');
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(method in route).toBe(false);
    }
  });
});
