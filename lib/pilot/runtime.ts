import { createHash } from 'node:crypto';
import { NeonAdaptiveRepository } from '@/lib/persistence/neon-adaptive-repository';
import { createNeonDatabase } from '@/lib/persistence/db';
import { NeonLearningStateRepository } from '@/lib/persistence/neon-learning-state-repository';
import { NeonPlanningRepository } from '@/lib/persistence/neon-planning-repository';
import { NeonPracticeRepository } from '@/lib/persistence/neon-practice-repository';
import { PracticeServiceImpl } from '@/lib/practice';
import { PilotSessionService } from './session';

function stableId(prefix: string, ...parts: string[]): string {
  const digest = createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 24);
  return `${prefix}-${digest}`;
}

export function createPilotSessionRuntime() {
  const db = createNeonDatabase();
  const learning = new NeonLearningStateRepository(db);
  const planning = new NeonPlanningRepository(db);
  const practice = new NeonPracticeRepository(db);
  const adaptive = new NeonAdaptiveRepository(db);
  const practiceService = new PracticeServiceImpl(learning, planning, practice, {
    sessionId: (lessonId, objectiveId) => stableId('practice-session', lessonId, objectiveId),
    itemId: (sessionId, sequence) => stableId('practice-item', sessionId, String(sequence)),
  });
  const clock = { now: () => new Date().toISOString() };
  const pilotSession = new PilotSessionService({
    planning,
    adaptive,
    practice: practiceService,
    practiceOwnership: practice,
    clock,
    ids: {
      executionEventId: (lessonId, type, at) => stableId('lesson-execution', lessonId, type, at),
    },
  });
  return { learning, pilotSession, clock };
}
