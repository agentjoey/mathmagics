import { describe, expect, it } from 'vitest';
import { MemoryLearningStateRepository } from '@/lib/learning';
import { PilotSetupService } from '@/lib/pilot/setup';
import { listLevelObjectivesInCurriculumOrder, MemoryPlanningRepository, TeachingPlannerServiceImpl } from '@/lib/planning';

const NOW = '2026-08-28T08:00:00.000Z';

describe('pilot setup objective coverage', () => {
  for (const levelId of ['P2', 'P3'] as const) {
    for (const objective of listLevelObjectivesInCurriculumOrder(levelId)) {
      it(`${levelId} ${objective.id} produces at least one first-week lesson`, async () => {
        const learning = new MemoryLearningStateRepository();
        const planning = new MemoryPlanningRepository();
        const planner = new TeachingPlannerServiceImpl(learning, planning, {
          planId: () => 'plan-1',
          lessonId: (sequence) => `lesson-${sequence}`,
        });
        const setup = new PilotSetupService({ learning, planner, studentId: () => 'student-1' });

        const result = await setup.create({
          displayName: 'Mia',
          levelId,
          currentObjectiveId: objective.id,
          sessionsPerWeek: 4,
          minutesPerSession: 30,
        }, NOW);

        const plan = await planning.findWeeklyPlan('student-1', result.weekStart);
        expect(plan).toBeDefined();
        expect(await planning.listDailyLessonsForPlan(plan!.id)).not.toHaveLength(0);
      });
    }
  }
});
