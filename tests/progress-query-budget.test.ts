import { describe, expect, it, vi } from 'vitest';
import { MemoryLearningStateRepository } from '@/lib/learning';
import type { StudentProfile } from '@/lib/learning';
import { MemoryPlanningRepository } from '@/lib/planning';
import { MemoryPracticeRepository } from '@/lib/practice';
import { ProgressService } from '@/lib/progress/service';
import type { PerformanceRiskFacts } from '@/lib/progress/types';

const NOW = '2026-08-28T12:00:00.000Z';
const student: StudentProfile = {
  id: 'query-budget-student',
  displayName: 'Query Budget Student',
  levelId: 'P3',
  learningMode: 'STRUCTURED_HOME_LEARNING',
  sessionsPerWeek: 4,
  minutesPerSession: 30,
  createdAt: '2026-08-28T08:00:00.000Z',
  updatedAt: '2026-08-28T08:00:00.000Z',
};

describe('ProgressService query budget', () => {
  it('shares student-level facts and one cutoff-scoped risk snapshot across objective projections', async () => {
    const learning = new MemoryLearningStateRepository();
    const planning = new MemoryPlanningRepository();
    const practice = new MemoryPracticeRepository();
    await learning.saveStudent(student);

    const getStudent = vi.spyOn(learning, 'getStudent');
    const listAttempts = vi.spyOn(practice, 'listAttemptsForStudent');
    const listPlans = vi.spyOn(planning, 'listWeeklyPlansForStudent');
    const snapshot = vi.fn(async () => ({
      recurrenceCount: (_objectiveId: string) => 0,
      hasBlockingMistake: (_objectiveId: string) => false,
    }));
    const riskFacts = {
      async recurrenceCount() { return 0; },
      async hasBlockingMistake() { return false; },
      snapshot,
    } satisfies PerformanceRiskFacts;

    const service = new ProgressService({ learning, planning, practice, riskFacts });
    const result = await service.getObjectivesProgress(
      student.id,
      ['P3-FRA-001', 'P3-FRA-002', 'P3-FRA-003'],
      NOW,
    );

    expect(result.map((entry) => entry.objectiveId)).toEqual([
      'P3-FRA-001',
      'P3-FRA-002',
      'P3-FRA-003',
    ]);
    expect(getStudent).toHaveBeenCalledTimes(1);
    expect(listAttempts).toHaveBeenCalledTimes(1);
    expect(listPlans).toHaveBeenCalledTimes(1);
    expect(snapshot).toHaveBeenCalledTimes(1);
    expect(snapshot).toHaveBeenCalledWith(student.id, NOW);
  });
});
