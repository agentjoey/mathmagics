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
  buildLessonPreparationContext,
  type IdFactory,
  type LessonBriefGenerator,
} from '@/lib/planning';

const BASE = Date.parse('2026-08-24T09:00:00.000Z');

function student(overrides: Partial<StudentProfile> = {}): StudentProfile {
  return {
    id: 'student-p3',
    displayName: 'Alex',
    levelId: 'P3',
    learningMode: 'STRUCTURED_HOME_LEARNING',
    sessionsPerWeek: 2,
    minutesPerSession: 45,
    createdAt: new Date(BASE).toISOString(),
    updatedAt: new Date(BASE).toISOString(),
    ...overrides,
  };
}

function evidence(
  id: string,
  objectiveId: string,
  type: EvidenceType,
  minute: number,
): EvidenceRecord {
  const at = new Date(BASE + minute * 60_000).toISOString();
  return {
    id,
    studentId: 'student-p3',
    objectiveId,
    type,
    observedAt: at,
    recordedAt: at,
    origin: { kind: 'LESSON', refId: 'lesson-fixture' },
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

class FixedIds implements IdFactory {
  planId() {
    return 'plan-fixed';
  }

  lessonId(sequence: number) {
    return `lesson-fixed-${sequence}`;
  }
}

async function readyFractionsFixture() {
  const learning = new MemoryLearningStateRepository();
  const planning = new MemoryPlanningRepository();
  const profile = student();
  await learning.saveStudent(profile);
  await learning.setCurrentPosition({
    studentId: profile.id,
    levelId: 'P3',
    objectiveId: 'P3-FRA-003',
    recordedAt: '2026-08-24T09:00:00.000Z',
    source: 'MANUAL_SETUP',
  });
  await addMastered(learning, 'P2-FRA-003', 'p2-fra', 1);
  await addMastered(learning, 'P3-FRA-001', 'p3-fra', 10);
  return { learning, planning, profile };
}

describe('TeachingPlannerService', () => {
  it('reads schedule from StudentProfile, uses injected IDs, persists plan+lessons, and returns the approved WeeklyPlan shape', async () => {
    const { learning, planning, profile } = await readyFractionsFixture();
    const service = new TeachingPlannerServiceImpl(learning, planning, new FixedIds());

    const created = await service.createWeeklyPlan(profile.id, '2026-08-24', '2026-08-24T10:00:00.000Z');

    expect(created).toEqual({
      id: 'plan-fixed',
      studentId: profile.id,
      weekStart: '2026-08-24',
      sessionsPerWeek: 2,
      minutesPerSession: 45,
      createdAt: '2026-08-24T10:00:00.000Z',
    });
    const lessons = await planning.listDailyLessonsForPlan(created.id);
    expect(lessons.map((lesson) => lesson.id)).toEqual(['lesson-fixed-1', 'lesson-fixed-2']);
    expect(lessons.map((lesson) => [lesson.intent, lesson.objectiveIds[0]])).toEqual([
      ['LEARN', 'P3-FRA-003'],
      ['PRACTICE', 'P3-FRA-003'],
    ]);
  });

  it('derives position/candidates and rejects duplicate student/week plans', async () => {
    const { learning, planning, profile } = await readyFractionsFixture();
    const service = new TeachingPlannerServiceImpl(learning, planning, new FixedIds());

    await expect(service.derivePosition(profile.id, '2026-08-24T10:00:00.000Z')).resolves.toMatchObject({
      anchorObjectiveId: 'P3-FRA-003',
    });
    await expect(service.listCandidates(profile.id, '2026-08-24T10:00:00.000Z')).resolves.toContainEqual(
      expect.objectContaining({ objectiveId: 'P3-FRA-003', reason: 'CURRENT_POSITION', readiness: 'READY' }),
    );

    await service.createWeeklyPlan(profile.id, '2026-08-24', '2026-08-24T10:00:00.000Z');
    await expect(
      service.createWeeklyPlan(profile.id, '2026-08-24', '2026-08-24T11:00:00.000Z'),
    ).rejects.toThrow('weekly plan already exists for student and week');
  });

  it('builds trusted lesson context only for immutable planned objective IDs', async () => {
    const { learning, planning, profile } = await readyFractionsFixture();
    const service = new TeachingPlannerServiceImpl(learning, planning, new FixedIds());
    await service.createWeeklyPlan(profile.id, '2026-08-24', '2026-08-24T10:00:00.000Z');

    const context = await service.prepareLesson('lesson-fixed-1');

    expect(context.student.id).toBe(profile.id);
    expect(context.lesson.objectiveIds).toEqual(['P3-FRA-003']);
    expect(context.objectives).toHaveLength(1);
    const item = context.objectives[0]!;
    expect(item.objective.id).toBe('P3-FRA-003');
    expect(item.mastery).toMatchObject({ objectiveId: 'P3-FRA-003', state: 'NOT_STARTED' });
    expect(item.readiness).toMatchObject({ objectiveId: 'P3-FRA-003', state: 'READY' });
    expect(item.prerequisites.map((objective) => objective.id)).toEqual(['P2-FRA-003', 'P3-FRA-001']);
    expect(item.representations.map((representation) => representation.id)).toEqual([
      'REP-FRACTION-STRIP',
      'REP-FRACTION-AREA',
      'REP-NUMBER-LINE',
      'REP-FRACTION-NOTATION',
    ]);
    expect(item.strategies.map((strategy) => strategy.id)).toEqual(['STRAT-DRAW-DIAGRAM']);
    expect(item.misconceptions.map((misconception) => misconception.id)).toEqual([
      'MIS-FRA-DENOMINATOR-SIZE',
      'MIS-FRA-NUMERATOR-ONLY',
      'MIS-FRA-PART-SIZE-COUNT',
    ]);
    expect(item.readinessEvidence).toEqual(item.objective.readinessEvidence);
    expect(item.masteryEvidence).toEqual(item.objective.masteryEvidence);
  });

  it('fails closed if asked to prepare an unknown lesson', async () => {
    const { learning, planning } = await readyFractionsFixture();
    await expect(buildLessonPreparationContext(learning, planning, 'missing')).rejects.toThrow(
      'Unknown daily lesson id: missing',
    );
  });

  it('defines a provider-agnostic LessonBriefGenerator contract', async () => {
    const fake: LessonBriefGenerator = {
      async generate(context) {
        return {
          objectiveSummary: context.objectives[0]!.objective.title,
          readinessCheck: [],
          teachingSequence: [],
          keyQuestions: [],
          workedExampleSuggestions: [],
          misconceptionWatchouts: [],
          masteryCheck: [],
        };
      },
    };
    const { learning, planning, profile } = await readyFractionsFixture();
    const service = new TeachingPlannerServiceImpl(learning, planning, new FixedIds());
    await service.createWeeklyPlan(profile.id, '2026-08-24', '2026-08-24T10:00:00.000Z');
    const context = await service.prepareLesson('lesson-fixed-1');

    await expect(fake.generate(context)).resolves.toMatchObject({ objectiveSummary: 'Compare and order unlike fractions' });
  });
});
