import { randomUUID } from 'node:crypto';
import { createNeonDatabase } from '@/lib/persistence/db';
import { NeonLearningStateRepository } from '@/lib/persistence/neon-learning-state-repository';
import { NeonPlanningRepository } from '@/lib/persistence/neon-planning-repository';
import { TeachingPlannerServiceImpl } from '@/lib/planning';
import { PilotSetupService } from './setup';

export function createPilotSetupRuntime() {
  const db = createNeonDatabase();
  const learning = new NeonLearningStateRepository(db);
  const planning = new NeonPlanningRepository(db);
  const planner = new TeachingPlannerServiceImpl(learning, planning, {
    planId: () => `weekly-plan-${randomUUID()}`,
    lessonId: (sequence) => `daily-lesson-${sequence}-${randomUUID()}`,
  });
  return new PilotSetupService({
    learning,
    planner,
    studentId: () => `student-${randomUUID()}`,
  });
}
