import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth/session';
import type { PilotSetupInput, PilotSetupResult } from '@/lib/pilot/setup';
import { PilotSetupValidationError } from '@/lib/pilot/setup';

export interface PilotSetupPostDependencies {
  sessionSecret(): string | undefined;
  now(): string;
  setup(input: PilotSetupInput, now: string): Promise<PilotSetupResult>;
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

function hasExactKeys(body: Record<string, unknown>): boolean {
  const required = ['displayName', 'levelId', 'currentObjectiveId', 'sessionsPerWeek', 'minutesPerSession'];
  const allowed = new Set(required);
  return required.every((key) => key in body) && Object.keys(body).every((key) => allowed.has(key));
}

export function createPilotSetupPostHandler(dependencies: PilotSetupPostDependencies) {
  return async function pilotSetupPost(req: NextRequest) {
    if (!(await authorized(req, dependencies.sessionSecret()))) return error('Unauthorized', 401);
    let body: Record<string, unknown> | null;
    try {
      body = record(await req.json());
    } catch {
      return error('Invalid JSON body', 400);
    }
    if (!body || !hasExactKeys(body)) return error('Invalid setup request', 400);
    if (typeof body.displayName !== 'string'
      || (body.levelId !== 'P2' && body.levelId !== 'P3')
      || typeof body.currentObjectiveId !== 'string'
      || !Number.isInteger(body.sessionsPerWeek)
      || !Number.isInteger(body.minutesPerSession)) {
      return error('Invalid setup request', 400);
    }

    try {
      const result = await dependencies.setup({
        displayName: body.displayName,
        levelId: body.levelId,
        currentObjectiveId: body.currentObjectiveId,
        sessionsPerWeek: body.sessionsPerWeek as number,
        minutesPerSession: body.minutesPerSession as number,
      }, dependencies.now());
      return NextResponse.json(result);
    } catch (reason) {
      if (reason instanceof PilotSetupValidationError) return error(reason.message, 400);
      throw reason;
    }
  };
}
