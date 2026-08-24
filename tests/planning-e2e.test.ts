import { describe, expect, it } from 'vitest';
import {
  MemoryLearningStateRepository,
  type EvidenceRecord,
  type EvidenceType,
  type StudentProfile,
} from '@/lib/learning';
import {
  MemoryPlanningRepository,
  TeachingPlannerServiceImpl,
  deriveLessonExecutionState,
  type IdFactory,
} from '@/lib/planning';

const BASE = Date.parse('2026-08-24T09:00:00.000Z');

function student(sessionsPerWeek = 3): StudentProfile {
  return {
    id: 'student-p3',
    displayName: 'Alex',
    levelId: 'P3',
    learningMode: 'STRUCTURED_HOME_LEARNING',
    sessionsPerWeek,
    minutesPerSession: 30,
    createdAt: new Date(BASE).toISOString(),
    updatedAt: new Date(BASE).toISOString(),
  };
}

function evidence(id: string, objectiveId: string, type: EvidenceType, minute: number): EvidenceRecord {
  const at = new Date(BASE + minute * 60_000).toISOString();
  return {
    id,
    studentId: 'student-p3',
    objectiveId,
    type,
    observedAt: at,
    recordedAt: at,
    origin: { kind: 'LESSON', refId: 'fixture' },
  };
}

async function addMastered(
  repository: MemoryLearningStateRepository,
  objectiveId: string,
  prefix: string,
  minute: number,
): Promise<void> {
  await repository.appendEvidence(evidence(`${prefix}-1`, objectiveId, 'independent_correct', minute));
  await repository.appendEvidence(evidence(`${prefix}-2`, objectiveId, 'explained_independently', minute + 1));
  await repository.appendEvidence(evidence(`${prefix}-3`, objectiveId, 'application_correct', minute + 2));
}

class ScenarioIds implements IdFactory {
  constructor(private readonly prefix: string) {}
  planId() { return `${this.prefix}-plan`; }
  lessonId(sequence: number) { return `${this.prefix}-lesson-${sequence}`; }
}

async function setup(anchor = 'P3-FRA-003', sessionsPerWeek = 3, prefix = 'scenario') {
  const learning = new MemoryLearningStateRepository();
  const planning = new MemoryPlanningRepository();
  const profile = student(sessionsPerWeek);
  await learning.saveStudent(profile);
  await learning.setCurrentPosition({
    studentId: profile.id,
    levelId: 'P3',
    objectiveId: anchor,
    recordedAt: new Date(BASE).toISOString(),
    source: 'MANUAL_SETUP',
  });
  const service = new TeachingPlannerServiceImpl(learning, planning, new ScenarioIds(prefix));
  return { learning, planning, profile, service };
}

describe('Phase 3 planner end-to-end', () => {
  it('Scenario A: advances to a READY P3 fractions objective and prepares trusted lesson context', async () => {
    const { learning, planning, profile, service } = await setup('P3-FRA-003', 2, 'forward');
    await addMastered(learning, 'P2-FRA-003', 'p2-fra3', 1);
    await addMastered(learning, 'P3-FRA-001', 'p3-fra1', 10);
    await addMastered(learning, 'P3-FRA-002', 'p3-fra2', 20);

    const candidates = await service.listCandidates(profile.id, '2026-08-24T10:00:00.000Z');
    expect(candidates).toContainEqual(expect.objectContaining({
      objectiveId: 'P3-FRA-003',
      reason: 'CURRENT_POSITION',
      readiness: 'READY',
    }));

    const plan = await service.createWeeklyPlan(profile.id, '2026-08-24', '2026-08-24T10:00:00.000Z');
    const lessons = await planning.listDailyLessonsForPlan(plan.id);
    expect(lessons[0]).toMatchObject({ intent: 'LEARN', objectiveIds: ['P3-FRA-003'] });

    const context = await service.prepareLesson(lessons[0]!.id);
    expect(context.objectives.map((item) => item.objective.id)).toEqual(['P3-FRA-003']);
    expect(context.objectives[0]?.readiness.state).toBe('READY');
  });

  it('Scenario B: schedules the direct P3 prerequisite before the blocked target', async () => {
    const { learning, planning, profile, service } = await setup('P3-FRA-003', 2, 'remediation');
    await addMastered(learning, 'P2-FRA-001', 'p2-fra1', 1);
    await addMastered(learning, 'P2-FRA-002', 'p2-fra2', 5);
    await addMastered(learning, 'P2-FRA-003', 'p2-fra3', 9);
    await learning.appendEvidence(evidence('p3-fra1-developing', 'P3-FRA-001', 'correct_with_hint', 20));

    const candidates = await service.listCandidates(profile.id, '2026-08-24T10:00:00.000Z');
    expect(candidates).toContainEqual(expect.objectContaining({
      objectiveId: 'P3-FRA-001',
      reason: 'PREREQUISITE_SUPPORT',
      targetObjectiveId: 'P3-FRA-003',
      readiness: 'READY',
      mastery: 'DEVELOPING',
    }));
    expect(candidates).toContainEqual(expect.objectContaining({
      objectiveId: 'P3-FRA-003',
      reason: 'CURRENT_POSITION',
      readiness: 'NEEDS_SUPPORT',
    }));

    const plan = await service.createWeeklyPlan(profile.id, '2026-08-24', '2026-08-24T10:00:00.000Z');
    const lessons = await planning.listDailyLessonsForPlan(plan.id);
    expect(lessons[0]).toMatchObject({ intent: 'LEARN', objectiveIds: ['P3-FRA-001'] });
    expect(lessons[0]?.rationale[0]).toEqual({
      code: 'PREREQUISITE_SUPPORT',
      objectiveId: 'P3-FRA-001',
      targetObjectiveId: 'P3-FRA-003',
    });
    expect(lessons.some((lesson) => lesson.intent === 'LEARN' && lesson.objectiveIds.includes('P3-FRA-003'))).toBe(false);
  });

  it('Scenario C: schedules review while still advancing to a READY objective', async () => {
    const { learning, planning, profile, service } = await setup('P3-FRA-003', 3, 'review-forward');
    await addMastered(learning, 'P2-FRA-003', 'p2-fra3', 1);
    await addMastered(learning, 'P3-FRA-001', 'p3-fra1', 10);
    await learning.appendEvidence(evidence('p3-fra1-review-due', 'P3-FRA-001', 'incorrect', 20));

    const plan = await service.createWeeklyPlan(profile.id, '2026-08-24', '2026-08-24T10:00:00.000Z');
    const lessons = await planning.listDailyLessonsForPlan(plan.id);
    expect(lessons.map((lesson) => [lesson.intent, lesson.objectiveIds[0]])).toEqual([
      ['REVIEW', 'P3-FRA-001'],
      ['LEARN', 'P3-FRA-003'],
      ['PRACTICE', 'P3-FRA-003'],
    ]);
  });

  it('execution history projects completion without creating learning Evidence', async () => {
    const { learning, planning, profile, service } = await setup('P3-FRA-003', 2, 'execution');
    await addMastered(learning, 'P2-FRA-003', 'p2-fra3', 1);
    await addMastered(learning, 'P3-FRA-001', 'p3-fra1', 10);
    const plan = await service.createWeeklyPlan(profile.id, '2026-08-24', '2026-08-24T10:00:00.000Z');
    const lesson = (await planning.listDailyLessonsForPlan(plan.id))[0]!;
    const evidenceBefore = await learning.listEvidenceForStudent(profile.id);

    await planning.appendExecutionEvent({
      id: 'exec-start',
      lessonId: lesson.id,
      studentId: profile.id,
      type: 'STARTED',
      occurredAt: '2026-08-24T10:05:00.000Z',
    });
    await planning.appendExecutionEvent({
      id: 'exec-complete',
      lessonId: lesson.id,
      studentId: profile.id,
      type: 'COMPLETED',
      occurredAt: '2026-08-24T10:35:00.000Z',
      actualMinutes: 30,
    });

    const state = deriveLessonExecutionState(lesson.id, await planning.listExecutionEvents(lesson.id));
    expect(state).toMatchObject({ status: 'COMPLETED', actualMinutes: 30 });
    await expect(learning.listEvidenceForStudent(profile.id)).resolves.toEqual(evidenceBefore);
  });
});
