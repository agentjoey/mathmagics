import { NextRequest } from 'next/server';
import { createPilotSetupRuntime } from '@/lib/pilot/setup-runtime';
import { createPilotSetupPostHandler } from './handler';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const setup = createPilotSetupRuntime();
  return createPilotSetupPostHandler({
    sessionSecret: () => process.env.SESSION_SECRET,
    now: () => new Date().toISOString(),
    setup: (input, now) => setup.create(input, now),
  })(req);
}
