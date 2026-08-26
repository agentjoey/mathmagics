import { describe, expect, it } from 'vitest';
import { AdaptiveLearningService, MemoryAdaptiveRepository } from '@/lib/adaptation';
import type { AdaptiveServiceDependencies } from '@/lib/adaptation';
import { MemoryMistakeRepository } from '@/lib/correction';
import type { Mistake, MistakeEvent } from '@/lib/correction';
import { MemoryLearningStateRepository } from '@/lib/learning';
import { MemoryPlanningRepository } from '@/lib/planning';
import type { DailyLesson, WeeklyPlan } from '@/lib/planning';
import { MemoryPracticeRepository } from '@/lib/practice';
import { MemoryStrategyRepository } from '@/lib/strategy';
import type { PerformanceRiskFacts } from '@/lib/progress';

const T0 = '2026-08-26T08:00:00.000Z';
const T1 = '2026-08-26T09:00:00.000Z';
const T2 = '2026-08-26T10:00:00.000Z';

class MutableClock {
  constructor(public value: string) {}
  now(): string { return this.value; }
}

class CutoffRiskFacts implements PerformanceRiskFacts {
  constructor(private readonly recurrentAt?: string) {}
  async recurrenceCount(_studentId: string, _objectiveId: string, cutoff: string): Promise<number> {
    return this.recurrentAt && cutoff >= this.recurrentAt ? 1 : 0;
  }
  async hasBlockingMistake(_studentId: string, _objectiveId: string, cutoff: string): Promise<boolean> {
    return Boolean(this.recurrentAt && cutoff >= this.recurrentAt);
  }
}

function plan(studentId: string): WeeklyPlan {
  return {
    id: `plan-${studentId}`,
    studentId,
    weekStart: '2026-08-24',
    sessionsPerWeek: 5,
    minutesPerSession: 30,
    createdAt: T0,
  };
}

function lesson(
  weeklyPlanId: string,
  studentId: string,
  id: string,
  sequence: number,
  objectiveId: string,
  intent: DailyLesson['intent'],
): DailyLesson {
  return {
    id,
    weeklyPlanId,
    studentId,
    sequence,
    intent,
    objectiveIds: [objectiveId],
    estimatedMinutes: 30,
    rationale: [{ code: 'CURRENT_POSITION', objectiveId }],
    createdAt: T0,
  };
}

async function harness(options: {
  studentId?: string;
  objectiveId?: string;
  intent?: DailyLesson['intent'];
  lessons?: DailyLesson[];
  clock?: MutableClock;
  riskFacts?: PerformanceRiskFacts;
} = {}) {
  const studentId = options.studentId ?? 'student-1';
  const objectiveId = options.objectiveId ?? 'P2-AS-001';
  const learning = new MemoryLearningStateRepository();
  const planning = new MemoryPlanningRepository();
  const practice = new MemoryPracticeRepository();
  const mistakes = new MemoryMistakeRepository();
  const strategy = new MemoryStrategyRepository();
  const adaptive = new MemoryAdaptiveRepository(planning);
  const clock = options.clock ?? new MutableClock(T1);
  const weeklyPlan = plan(studentId);
  const source = options.lessons?.[0] ?? lesson(
    weeklyPlan.id,
    studentId,
    'lesson-source',
    1,
    objectiveId,
    options.intent ?? 'LEARN',
  );
  const lessons = options.lessons ?? [source];

  await learning.saveStudent({
    id: studentId,
    displayName: 'Learner',
    levelId: 'P2',
    learningMode: 'STRUCTURED_HOME_LEARNING',
    sessionsPerWeek: 5,
    minutesPerSession: 30,
    createdAt: T0,
    updatedAt: T0,
  });
  await learning.setCurrentPosition({
    studentId,
    levelId: 'P2',
    objectiveId,
    recordedAt: T0,
    source: 'MANUAL_SETUP',
  });
  await planning.createWeeklyPlan(weeklyPlan, lessons);

  const dependencies: AdaptiveServiceDependencies = {
    learningRepository: learning,
    practiceRepository: practice,
    planningRepository: planning,
    mistakeRepository: mistakes,
    strategyRepository: strategy,
    adaptiveRepository: adaptive,
    performanceRiskFacts: options.riskFacts ?? new CutoffRiskFacts(),
    clock,
    ids: {
      decisionId: (sourceLessonId, cutoff) => `decision-${sourceLessonId}-${cutoff}`,
      replacementLessonId: (sourceLessonId, cutoff) => `replacement-${sourceLessonId}-${cutoff}`,
      supersessionId: (sourceLessonId) => `supersession-${sourceLessonId}`,
    },
  };
  return {
    service: new AdaptiveLearningService(dependencies),
    learning,
    planning,
    mistakes,
    adaptive,
    clock,
    source,
    weeklyPlan,
  };
}

async function appendConfirmedMistake(
  repository: MemoryMistakeRepository,
  studentId: string,
  objectiveId: string,
  observedAt: string,
): Promise<Mistake> {
  const mistake: Mistake = {
    id: `mistake-${objectiveId}-${observedAt}`,
    studentId,
    objectiveId,
    initialAttemptId: `attempt-${objectiveId}-${observedAt}`,
    initialDiagnosisTarget: { kind: 'GENERIC', code: 'PROCEDURE_ERROR' },
    diagnosisPolicyVersion: 'mistake-diagnosis-v1',
    firstObservedAt: observedAt,
    createdAt: observedAt,
  };
  const event: MistakeEvent = {
    id: `event-${mistake.id}`,
    mistakeId: mistake.id,
    type: 'DIAGNOSIS_CONFIRMED',
    payload: { target: { kind: 'GENERIC', code: 'PROCEDURE_ERROR' } },
    actorKind: 'SYSTEM',
    policyVersion: 'mistake-diagnosis-v1',
    occurredAt: observedAt,
  };
  await repository.appendMistake(mistake);
  await repository.appendEvent(event);
  return mistake;
}

describe('AdaptiveLearningService lesson boundaries', () => {
  it('keeps a PLANNED lesson when no higher-priority need materially changes it', async () => {
    const { service, source, adaptive } = await harness();
    const result = await service.evaluateLesson(source.id, source.studentId);
    expect(result.decision.action).toBe('KEEP');
    expect(result.decision.rationaleCodes).toContain('NO_HIGHER_PRIORITY_NEED');
    expect(result.effectiveLesson).toEqual({ lesson: source, originalLessonId: source.id, adapted: false });
    expect(await adaptive.listDecisionsForSourceLesson(source.id)).toHaveLength(1);
  });

  it('supersedes a PLANNED lesson with CORRECTION for a blocking confirmed prerequisite mistake', async () => {
    const studentId = 'student-blocking';
    const objectiveId = 'P2-AS-002';
    const basePlan = plan(studentId);
    const source = lesson(basePlan.id, studentId, 'lesson-blocking', 1, objectiveId, 'PRACTICE');
    const h = await harness({ studentId, objectiveId, lessons: [source] });
    const mistake = await appendConfirmedMistake(h.mistakes, studentId, 'P2-AS-001', T1);

    const result = await h.service.evaluateLesson(source.id, studentId);
    expect(result.decision.action).toBe('SUPERSEDE');
    expect(result.decision.selectedIntent).toBe('CORRECTION');
    expect(result.decision.targetMistakeId).toBe(mistake.id);
    expect(result.decision.rationaleCodes).toContain('BLOCKING_MISTAKE');
    expect(result.effectiveLesson.adapted).toBe(true);
    expect(result.effectiveLesson.lesson.intent).toBe('CORRECTION');
    expect(result.effectiveLesson.originalLessonId).toBe(source.id);
  });

  it('never supersedes a STARTED lesson and records the closed rationale', async () => {
    const h = await harness();
    await h.planning.appendExecutionEvent({
      id: 'started-1', lessonId: h.source.id, studentId: h.source.studentId, type: 'STARTED', occurredAt: T1,
    });
    const result = await h.service.evaluateLesson(h.source.id, h.source.studentId);
    expect(result.decision.action).toBe('KEEP');
    expect(result.decision.rationaleCodes).toEqual(['SOURCE_LESSON_ALREADY_STARTED']);
    expect(result.effectiveLesson.lesson.id).toBe(h.source.id);
  });

  it('redirects a COMPLETED source to the next effective PLANNED lesson', async () => {
    const studentId = 'student-next';
    const weeklyPlan = plan(studentId);
    const first = lesson(weeklyPlan.id, studentId, 'lesson-first', 1, 'P2-AS-001', 'LEARN');
    const second = lesson(weeklyPlan.id, studentId, 'lesson-second', 2, 'P2-AS-001', 'LEARN');
    const h = await harness({ studentId, objectiveId: 'P2-AS-001', lessons: [first, second] });
    await h.planning.appendExecutionEvent({
      id: 'start-first', lessonId: first.id, studentId, type: 'STARTED', occurredAt: '2026-08-26T08:30:00.000Z',
    });
    await h.planning.appendExecutionEvent({
      id: 'complete-first', lessonId: first.id, studentId, type: 'COMPLETED', occurredAt: '2026-08-26T08:50:00.000Z', actualMinutes: 20,
    });

    const result = await h.service.evaluateLesson(first.id, studentId);
    expect(result.decision.sourceLessonId).toBe(second.id);
    expect(result.effectiveLesson.lesson.id).toBe(second.id);
  });

  it('replays a historical KEEP at T1 without leaking a T2 supersession into the past', async () => {
    const clock = new MutableClock(T1);
    const riskFacts = new CutoffRiskFacts(T2);
    const h = await harness({ clock, riskFacts });
    const first = await h.service.evaluateLesson(h.source.id, h.source.studentId);
    expect(first.decision.action).toBe('KEEP');

    await appendConfirmedMistake(h.mistakes, h.source.studentId, 'P2-AS-001', T2);
    clock.value = T2;
    const second = await h.service.evaluateLesson(h.source.id, h.source.studentId);
    expect(second.decision.action).toBe('SUPERSEDE');
    expect(second.effectiveLesson.adapted).toBe(true);

    clock.value = T1;
    const replay = await h.service.evaluateLesson(h.source.id, h.source.studentId);
    expect(replay.decision).toEqual(first.decision);
    expect(replay.effectiveLesson).toEqual({ lesson: h.source, originalLessonId: h.source.id, adapted: false });
  });

  it('deduplicates concurrent same-key SUPERSEDE evaluations to one decision and one replacement', async () => {
    const clock = new MutableClock(T2);
    const riskFacts = new CutoffRiskFacts(T2);
    const h = await harness({ clock, riskFacts });
    await appendConfirmedMistake(h.mistakes, h.source.studentId, 'P2-AS-001', T2);

    const [left, right] = await Promise.all([
      h.service.evaluateLesson(h.source.id, h.source.studentId),
      h.service.evaluateLesson(h.source.id, h.source.studentId),
    ]);
    expect(left.decision).toEqual(right.decision);
    expect(left.effectiveLesson.lesson.id).toBe(right.effectiveLesson.lesson.id);
    expect(await h.adaptive.listDecisionsForSourceLesson(h.source.id)).toHaveLength(1);
    expect(await h.adaptive.getSupersessionForSourceLesson(h.source.id)).toBeDefined();
    expect((await h.planning.listDailyLessonsForPlan(h.weeklyPlan.id))).toHaveLength(2);
  });
});
