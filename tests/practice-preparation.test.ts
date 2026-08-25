import { describe, expect, it } from 'vitest';
import { MemoryLearningStateRepository } from '@/lib/learning';
import type { EvidenceRecord, StudentProfile } from '@/lib/learning';
import { MemoryPlanningRepository } from '@/lib/planning';
import type { DailyLesson, WeeklyPlan } from '@/lib/planning';
import { buildPracticePreparationContext } from '@/lib/practice';

const NOW = '2026-08-25T01:00:00.000Z';
const student: StudentProfile = {
  id: 's1', displayName: 'Alex', levelId: 'P3', learningMode: 'STRUCTURED_HOME_LEARNING',
  sessionsPerWeek: 4, minutesPerSession: 30,
  createdAt: '2026-08-25T00:00:00.000Z', updatedAt: '2026-08-25T00:00:00.000Z',
};

async function setupLesson(
  intent: DailyLesson['intent'] = 'PRACTICE',
  objectiveIds = ['P3-FRA-003'],
): Promise<{ learning: MemoryLearningStateRepository; planning: MemoryPlanningRepository }> {
  const learning = new MemoryLearningStateRepository();
  const planning = new MemoryPlanningRepository();
  await learning.saveStudent(student);
  const plan: WeeklyPlan = {
    id: 'wp1', studentId: student.id, weekStart: '2026-08-24', sessionsPerWeek: 4,
    minutesPerSession: 30, createdAt: '2026-08-25T00:00:00.000Z',
  };
  const lesson: DailyLesson = {
    id: 'lesson-1', weeklyPlanId: plan.id, studentId: student.id, sequence: 1,
    intent, objectiveIds, estimatedMinutes: 30,
    rationale: [{ code: 'CURRENT_POSITION', objectiveId: objectiveIds[0]! }],
    createdAt: '2026-08-25T00:00:00.000Z',
  };
  await planning.createWeeklyPlan(plan, [lesson]);
  return { learning, planning };
}

async function master(
  learning: MemoryLearningStateRepository,
  objectiveId: string,
  offset: number,
): Promise<void> {
  const types: EvidenceRecord['type'][] = ['independent_correct', 'independent_correct', 'application_correct'];
  for (let index = 0; index < types.length; index += 1) {
    await learning.appendEvidence({
      id: `ev-${objectiveId}-${index}`,
      studentId: student.id,
      objectiveId,
      type: types[index]!,
      observedAt: `2026-08-25T00:${String(offset + index).padStart(2, '0')}:00.000Z`,
      recordedAt: `2026-08-25T00:${String(offset + index).padStart(2, '0')}:00.000Z`,
      origin: { kind: 'LESSON', refId: 'seed' },
    });
  }
}

describe('practice preparation context', () => {
  it('rejects an unknown daily lesson', async () => {
    const { learning, planning } = await setupLesson();
    await expect(buildPracticePreparationContext(learning, planning, 'missing', 'P3-FRA-003', NOW))
      .rejects.toThrow('Unknown daily lesson id: missing');
  });

  it('rejects an objective that is not on the daily lesson', async () => {
    const { learning, planning } = await setupLesson();
    await expect(buildPracticePreparationContext(learning, planning, 'lesson-1', 'P3-FRA-004', NOW))
      .rejects.toThrow('practice objective must belong to daily lesson');
  });

  it('rejects non-practice/review lesson intents', async () => {
    const { learning, planning } = await setupLesson('LEARN');
    await expect(buildPracticePreparationContext(learning, planning, 'lesson-1', 'P3-FRA-003', NOW))
      .rejects.toThrow('practice requires PRACTICE or REVIEW daily lesson intent');
  });

  it('rejects a blocked objective', async () => {
    const { learning, planning } = await setupLesson();
    await expect(buildPracticePreparationContext(learning, planning, 'lesson-1', 'P3-FRA-003', NOW))
      .rejects.toThrow('practice objective readiness must not be BLOCKED');
  });

  it('returns trusted curriculum and derived learning facts for a ready P3 fraction objective', async () => {
    const { learning, planning } = await setupLesson('REVIEW');
    await master(learning, 'P2-FRA-003', 1);
    await master(learning, 'P3-FRA-001', 10);

    const context = await buildPracticePreparationContext(
      learning, planning, 'lesson-1', 'P3-FRA-003', NOW,
    );

    expect(context.student.id).toBe('s1');
    expect(context.lesson.id).toBe('lesson-1');
    expect(context.objective.id).toBe('P3-FRA-003');
    expect(context.mastery.objectiveId).toBe('P3-FRA-003');
    expect(context.readiness.state).toBe('READY');
    expect(context.representations.map((item) => item.id)).toContain('REP-FRACTION-STRIP');
    expect(context.strategies.map((item) => item.id)).toContain('STRAT-DRAW-DIAGRAM');
    expect(context.misconceptions.length).toBeGreaterThan(0);
    expect(context.policyVersion).toBe('practice-v1');
    expect(context.preparedAt).toBe(NOW);
  });
});
