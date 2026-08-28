import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { createPilotSetupPostHandler } from '@/app/api/pilot/setup/handler';
import { issueSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { MemoryLearningStateRepository } from '@/lib/learning';
import { MemoryPlanningRepository, TeachingPlannerServiceImpl } from '@/lib/planning';
import { PilotSetupService } from '@/lib/pilot/setup';

const SECRET = 'phase8-pilot-setup-secret-that-is-long-enough';
const NOW = '2026-08-28T08:00:00.000Z';

async function authorizedHeaders() {
  const token = await issueSessionToken(SECRET);
  return { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' };
}

function request(headers: HeadersInit | undefined, body: unknown) {
  return new NextRequest('http://localhost/api/pilot/setup', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function input() {
  return {
    displayName: 'Mia',
    levelId: 'P3' as const,
    currentObjectiveId: 'P3-FRA-003',
    sessionsPerWeek: 4,
    minutesPerSession: 30,
  };
}

describe('Phase 8 pilot student bootstrap', () => {
  it('rejects unauthenticated setup before creating anything', async () => {
    let calls = 0;
    const handler = createPilotSetupPostHandler({
      sessionSecret: () => SECRET,
      now: () => NOW,
      setup: async () => {
        calls += 1;
        return { studentId: 'server-generated', weekStart: '2026-08-24' };
      },
    });

    const response = await handler(request(undefined, input()));

    expect(response.status).toBe(401);
    expect(calls).toBe(0);
  });

  it('rejects client-owned student ids and level/objective mismatches', async () => {
    const headers = await authorizedHeaders();
    const learning = new MemoryLearningStateRepository();
    const planning = new MemoryPlanningRepository();
    const planner = new TeachingPlannerServiceImpl(learning, planning, {
      planId: () => 'plan-1',
      lessonId: (sequence) => `lesson-${sequence}`,
    });
    const setup = new PilotSetupService({ learning, planner, studentId: () => 'student-server' });
    const handler = createPilotSetupPostHandler({
      sessionSecret: () => SECRET,
      now: () => NOW,
      setup: (value, now) => setup.create(value, now),
    });

    const clientId = await handler(request(headers, { ...input(), studentId: 'client-chosen' }));
    expect(clientId.status).toBe(400);

    const mismatch = await handler(request(headers, { ...input(), levelId: 'P2' }));
    expect(mismatch.status).toBe(400);
    expect(await learning.getStudent('student-server')).toBeUndefined();
  });

  it('creates the server-owned Student, CurrentPosition and current-week WeeklyPlan', async () => {
    const headers = await authorizedHeaders();
    const learning = new MemoryLearningStateRepository();
    const planning = new MemoryPlanningRepository();
    const planner = new TeachingPlannerServiceImpl(learning, planning, {
      planId: () => 'plan-1',
      lessonId: (sequence) => `lesson-${sequence}`,
    });
    const setup = new PilotSetupService({ learning, planner, studentId: () => 'student-server' });
    const handler = createPilotSetupPostHandler({
      sessionSecret: () => SECRET,
      now: () => NOW,
      setup: (value, now) => setup.create(value, now),
    });

    const response = await handler(request(headers, input()));
    const payload = await response.json() as { studentId: string; weekStart: string };

    expect(response.status).toBe(200);
    expect(payload).toEqual({ studentId: 'student-server', weekStart: '2026-08-24' });
    expect(await learning.getStudent('student-server')).toMatchObject({
      id: 'student-server', displayName: 'Mia', levelId: 'P3',
      learningMode: 'STRUCTURED_HOME_LEARNING', sessionsPerWeek: 4, minutesPerSession: 30,
    });
    expect(await learning.getCurrentPosition('student-server')).toEqual({
      studentId: 'student-server', levelId: 'P3', objectiveId: 'P3-FRA-003', recordedAt: NOW, source: 'MANUAL_SETUP',
    });
    const plan = await planning.findWeeklyPlan('student-server', '2026-08-24');
    expect(plan).toMatchObject({ id: 'plan-1', studentId: 'student-server', sessionsPerWeek: 4 });
    expect((await planning.listDailyLessonsForPlan('plan-1')).length).toBeGreaterThan(0);
  });

  it('exposes POST-only setup route', async () => {
    const route = await import('@/app/api/pilot/setup/route');
    expect(typeof route.POST).toBe('function');
    expect(route.runtime).toBe('nodejs');
    for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) expect(method in route).toBe(false);
  });
});
