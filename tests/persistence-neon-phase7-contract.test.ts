import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createNeonDatabase } from '@/lib/persistence/db';
import { NeonAdaptiveRepository } from '@/lib/persistence/neon-adaptive-repository';
import { NeonStrategyRepository } from '@/lib/persistence/neon-strategy-repository';
import {
  adaptiveDecisions,
  dailyLessons,
  students,
  weeklyPlans,
} from '@/lib/persistence/schema';
import type { AdaptiveDecision, LessonSupersession } from '@/lib/adaptation';
import type { DailyLesson } from '@/lib/planning';
import type { StrategyEvidence, StrategyInteraction } from '@/lib/strategy';

const describeLive = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describe('Phase 7 Neon repository surface', () => {
  it('exposes StrategyRepository and AdaptiveRepository methods without opening a production connection', () => {
    expect(NeonStrategyRepository.prototype.appendInteraction).toBeTypeOf('function');
    expect(NeonStrategyRepository.prototype.appendEvidence).toBeTypeOf('function');
    expect(NeonAdaptiveRepository.prototype.appendKeepDecision).toBeTypeOf('function');
    expect(NeonAdaptiveRepository.prototype.commitSupersession).toBeTypeOf('function');
  });
});

async function seedStudent(db: ReturnType<typeof createNeonDatabase>, studentId: string, at: string) {
  await db.insert(students).values({
    id: studentId,
    displayName: 'Phase 7 Contract Student',
    levelId: 'P2',
    learningMode: 'HOME_EDUCATION',
    sessionsPerWeek: 5,
    minutesPerSession: 30,
    createdAt: at,
    updatedAt: at,
  });
}

describeLive('Phase 7 Neon live contracts', () => {
  it('round-trips trusted strategy facts with replay and cutoff semantics', async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required');
    const db = createNeonDatabase(databaseUrl);
    const repository = new NeonStrategyRepository(db);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const studentId = `phase7-strategy-${suffix}`;
    const at = '2026-08-26T10:00:00.000Z';
    await seedStudent(db, studentId, at);

    const interaction: StrategyInteraction = {
      id: `interaction-${suffix}`,
      studentId,
      objectiveId: 'P2-AS-002',
      strategyId: 'STRAT-BAR-PART-WHOLE',
      sourceKind: 'PRACTICE',
      sourceRefId: `attempt-${suffix}`,
      interactionType: 'INDEPENDENT_CONSTRUCTION',
      outcome: 'VALID',
      observedAt: '2026-08-26T10:01:00.000Z',
      recordedAt: '2026-08-26T10:01:01.000Z',
    };
    const evidence: StrategyEvidence = {
      id: `evidence-${suffix}`,
      studentId,
      strategyId: interaction.strategyId,
      objectiveId: interaction.objectiveId,
      type: 'INDEPENDENT_USE',
      interactionId: interaction.id,
      observedAt: interaction.observedAt,
      recordedAt: interaction.recordedAt,
    };

    await repository.appendInteraction(interaction);
    await repository.appendInteraction(structuredClone(interaction));
    await repository.appendEvidence(evidence);
    await repository.appendEvidence(structuredClone(evidence));

    expect(await repository.getInteraction(interaction.id)).toEqual(interaction);
    expect(await repository.getEvidenceByInteraction(interaction.id)).toEqual(evidence);
    expect(await repository.listEvidenceForStudent(studentId, '2026-08-26T10:01:00.500Z')).toEqual([]);
    expect(await repository.listEvidenceForStudent(studentId, '2026-08-26T10:01:01.000Z')).toEqual([evidence]);
    await expect(repository.appendEvidence({ ...evidence, id: `conflict-${suffix}`, type: 'PROMPTED_USE' }))
      .rejects.toThrow('strategy evidence already exists for interaction');
  });

  it('atomically commits supersession and rolls back replacement plus decision on a late unique conflict', async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required');
    const db = createNeonDatabase(databaseUrl);
    const repository = new NeonAdaptiveRepository(db);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const studentId = `phase7-adaptive-${suffix}`;
    const planId = `plan-${suffix}`;
    const at = '2026-08-26T10:00:00.000Z';
    await seedStudent(db, studentId, at);
    await db.insert(weeklyPlans).values({
      id: planId,
      studentId,
      weekStart: '2026-08-24',
      sessionsPerWeek: 5,
      minutesPerSession: 30,
      createdAt: at,
    });

    const source = (id: string, sequence: number): DailyLesson => ({
      id,
      weeklyPlanId: planId,
      studentId,
      sequence,
      intent: 'PRACTICE',
      objectiveIds: ['P2-AS-002'],
      estimatedMinutes: 30,
      rationale: [{ code: 'CURRENT_POSITION', objectiveId: 'P2-AS-002' }],
      createdAt: at,
    });
    const sourceOne = source(`source-one-${suffix}`, 1);
    const sourceTwo = source(`source-two-${suffix}`, 2);
    await db.insert(dailyLessons).values([sourceOne, sourceTwo]);

    const makeBundle = (sourceLesson: DailyLesson, tag: string, supersessionId: string) => {
      const cutoff = `2026-08-26T10:${tag === 'one' ? '05' : '06'}:00.000Z`;
      const decision: AdaptiveDecision = {
        id: `decision-${tag}-${suffix}`,
        studentId,
        sourceLessonId: sourceLesson.id,
        action: 'SUPERSEDE',
        selectedIntent: 'LEARN',
        selectedObjectiveIds: ['P2-AS-002'],
        rationaleCodes: ['PREREQUISITE_GAP'],
        policyVersion: 'adaptive-policy-v1',
        evaluatedAt: cutoff,
        inputFactCutoff: cutoff,
        createdAt: cutoff,
      };
      const replacement: DailyLesson = {
        ...sourceLesson,
        id: `replacement-${tag}-${suffix}`,
        intent: 'LEARN',
        createdAt: cutoff,
      };
      const supersession: LessonSupersession = {
        id: supersessionId,
        studentId,
        sourceLessonId: sourceLesson.id,
        replacementLessonId: replacement.id,
        adaptiveDecisionId: decision.id,
        createdAt: cutoff,
      };
      return { decision, replacementLesson: replacement, supersession };
    };

    const sharedSupersessionId = `sup-shared-${suffix}`;
    const first = makeBundle(sourceOne, 'one', sharedSupersessionId);
    await repository.commitSupersession(first);
    await repository.commitSupersession(structuredClone(first));
    expect(await repository.getSupersessionForSourceLesson(sourceOne.id)).toEqual(first.supersession);

    const second = makeBundle(sourceTwo, 'two', sharedSupersessionId);
    await expect(repository.commitSupersession(second)).rejects.toThrow();

    const [replacementAfterFailure] = await db.select({ id: dailyLessons.id }).from(dailyLessons)
      .where(eq(dailyLessons.id, second.replacementLesson.id)).limit(1);
    const [decisionAfterFailure] = await db.select({ id: adaptiveDecisions.id }).from(adaptiveDecisions)
      .where(eq(adaptiveDecisions.id, second.decision.id)).limit(1);
    expect(replacementAfterFailure).toBeUndefined();
    expect(decisionAfterFailure).toBeUndefined();
    expect(await repository.getSupersessionForSourceLesson(sourceTwo.id)).toBeUndefined();
  });
});
