import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createPilotStudentGetHandler } from '@/app/api/pilot/student/handler';
import { issueSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';

const SECRET = 'phase8-pilot-student-profile-secret-that-is-long-enough';

async function authorizedHeaders() {
  const token = await issueSessionToken(SECRET);
  return { cookie: `${SESSION_COOKIE_NAME}=${token}` };
}

describe('pilot student profile API', () => {
  it('rejects unauthenticated requests before reading student data', async () => {
    const getStudent = vi.fn();
    const handler = createPilotStudentGetHandler({ sessionSecret: () => SECRET, getStudent });

    const response = await handler(new NextRequest('http://localhost/api/pilot/student?studentId=student-1'));

    expect(response.status).toBe(401);
    expect(getStudent).not.toHaveBeenCalled();
  });

  it('returns only family-safe student identity fields', async () => {
    const headers = await authorizedHeaders();
    const handler = createPilotStudentGetHandler({
      sessionSecret: () => SECRET,
      getStudent: async (studentId) => studentId === 'student-1'
        ? { displayName: 'Mia', levelId: 'P3' as const }
        : undefined,
    });

    expect((await handler(new NextRequest('http://localhost/api/pilot/student', { headers }))).status).toBe(400);
    expect((await handler(new NextRequest('http://localhost/api/pilot/student?studentId=unknown', { headers }))).status).toBe(404);

    const response = await handler(new NextRequest('http://localhost/api/pilot/student?studentId=student-1', { headers }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ displayName: 'Mia', levelId: 'P3' });
  });

  it('exports only the read-only GET route surface', async () => {
    const route = await import('@/app/api/pilot/student/route');
    expect(typeof route.GET).toBe('function');
    expect(route.runtime).toBe('nodejs');
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) expect(method in route).toBe(false);
  });
});
