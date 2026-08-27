import { NextRequest } from 'next/server';
import { createPhase7Runtime } from '@/lib/adaptation/runtime';
import { PilotReviewService } from '@/lib/pilot';
import { createPilotReviewGetHandler } from './handler';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const services = createPhase7Runtime();
  const pilotReview = new PilotReviewService({
    parentProgress: services.parentProgressService,
    planning: services.planning,
    adaptive: services.adaptive,
  });
  return createPilotReviewGetHandler({
    sessionSecret: () => process.env.SESSION_SECRET,
    now: services.clock.now,
    studentExists: async (studentId) => (await services.learning.getStudent(studentId)) !== undefined,
    getReview: (studentId, evaluatedAt) => pilotReview.getReview(studentId, evaluatedAt),
  })(req);
}
