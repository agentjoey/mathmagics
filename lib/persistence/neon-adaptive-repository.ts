import { and, asc, eq } from 'drizzle-orm';
import type {
  AdaptiveDecision,
  AdaptiveDecisionAction,
  AdaptiveRationaleCode,
  AdaptiveRepository,
  LessonSupersession,
} from '@/lib/adaptation';
import {
  assertValidAdaptiveDecision,
  assertValidLessonSupersession,
} from '@/lib/adaptation';
import type { DailyLesson, LessonIntent, PlanningRationale } from '@/lib/planning';
import { assertValidDailyLesson } from '@/lib/planning';
import { createNeonDatabase } from './db';
import type { MathMagicsDatabase } from './db';
import { canonicalInstant } from './instant';
import {
  adaptiveDecisions,
  dailyLessons,
  lessonSupersessions,
} from './schema';

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameStringArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function toLesson(row: typeof dailyLessons.$inferSelect): DailyLesson {
  const lesson: DailyLesson = {
    id: row.id,
    weeklyPlanId: row.weeklyPlanId,
    studentId: row.studentId,
    sequence: row.sequence,
    intent: row.intent as LessonIntent,
    objectiveIds: structuredClone(row.objectiveIds),
    estimatedMinutes: row.estimatedMinutes,
    rationale: structuredClone(row.rationale as PlanningRationale[]),
    createdAt: canonicalInstant(row.createdAt),
  };
  assertValidDailyLesson(lesson);
  return lesson;
}

function toDecision(row: typeof adaptiveDecisions.$inferSelect): AdaptiveDecision {
  const decision: AdaptiveDecision = {
    id: row.id,
    studentId: row.studentId,
    sourceLessonId: row.sourceLessonId,
    action: row.action as AdaptiveDecisionAction,
    selectedIntent: row.selectedIntent as LessonIntent,
    selectedObjectiveIds: structuredClone(row.selectedObjectiveIds),
    targetMistakeId: row.targetMistakeId ?? undefined,
    rationaleCodes: structuredClone(row.rationaleCodes as AdaptiveRationaleCode[]),
    policyVersion: row.policyVersion as 'adaptive-policy-v1',
    evaluatedAt: canonicalInstant(row.evaluatedAt),
    inputFactCutoff: canonicalInstant(row.inputFactCutoff),
    createdAt: canonicalInstant(row.createdAt),
  };
  assertValidAdaptiveDecision(decision);
  return decision;
}

function toSupersession(row: typeof lessonSupersessions.$inferSelect): LessonSupersession {
  const supersession: LessonSupersession = {
    id: row.id,
    studentId: row.studentId,
    sourceLessonId: row.sourceLessonId,
    replacementLessonId: row.replacementLessonId,
    adaptiveDecisionId: row.adaptiveDecisionId,
    createdAt: canonicalInstant(row.createdAt),
  };
  assertValidLessonSupersession(supersession);
  return supersession;
}

export class NeonAdaptiveRepository implements AdaptiveRepository {
  constructor(private readonly db: MathMagicsDatabase = createNeonDatabase()) {}

  private async getDailyLesson(lessonId: string): Promise<DailyLesson | undefined> {
    const [row] = await this.db.select().from(dailyLessons)
      .where(eq(dailyLessons.id, lessonId)).limit(1);
    return row ? toLesson(row) : undefined;
  }

  private async getDecisionById(decisionId: string): Promise<AdaptiveDecision | undefined> {
    const [row] = await this.db.select().from(adaptiveDecisions)
      .where(eq(adaptiveDecisions.id, decisionId)).limit(1);
    return row ? toDecision(row) : undefined;
  }

  private async decisionIdentity(decision: AdaptiveDecision): Promise<'new' | 'replay'> {
    const byId = await this.getDecisionById(decision.id);
    if (byId) {
      if (same(byId, decision)) return 'replay';
      throw new Error('adaptive decision id already exists with different content');
    }
    const byKey = await this.getDecisionByEvaluationKey(
      decision.studentId,
      decision.sourceLessonId,
      decision.inputFactCutoff,
      decision.policyVersion,
    );
    if (byKey) {
      if (same(byKey, decision)) return 'replay';
      throw new Error('adaptive evaluation key already exists with different content');
    }
    return 'new';
  }

  private async exactSupersessionReplay(
    decision: AdaptiveDecision,
    replacementLesson: DailyLesson,
    supersession: LessonSupersession,
  ): Promise<boolean> {
    const existing = await this.getSupersessionForSourceLesson(decision.sourceLessonId);
    if (!existing) return false;
    const existingDecision = await this.getDecisionById(existing.adaptiveDecisionId);
    const existingReplacement = await this.getDailyLesson(existing.replacementLessonId);
    return Boolean(
      existingDecision
      && existingReplacement
      && same(existingDecision, decision)
      && same(existingReplacement, replacementLesson)
      && same(existing, supersession),
    );
  }

  async getDecisionByEvaluationKey(
    studentId: string,
    sourceLessonId: string,
    inputFactCutoff: string,
    policyVersion: string,
  ): Promise<AdaptiveDecision | undefined> {
    const [row] = await this.db.select().from(adaptiveDecisions)
      .where(and(
        eq(adaptiveDecisions.studentId, studentId),
        eq(adaptiveDecisions.sourceLessonId, sourceLessonId),
        eq(adaptiveDecisions.inputFactCutoff, inputFactCutoff),
        eq(adaptiveDecisions.policyVersion, policyVersion),
      )).limit(1);
    return row ? toDecision(row) : undefined;
  }

  async listDecisionsForSourceLesson(sourceLessonId: string): Promise<AdaptiveDecision[]> {
    const rows = await this.db.select().from(adaptiveDecisions)
      .where(eq(adaptiveDecisions.sourceLessonId, sourceLessonId))
      .orderBy(asc(adaptiveDecisions.inputFactCutoff), asc(adaptiveDecisions.id));
    return rows.map(toDecision);
  }

  async appendKeepDecision(decision: AdaptiveDecision): Promise<void> {
    assertValidAdaptiveDecision(decision);
    if (decision.action !== 'KEEP') throw new Error('appendKeepDecision requires KEEP action');
    const source = await this.getDailyLesson(decision.sourceLessonId);
    if (!source) throw new Error(`Unknown source daily lesson id: ${decision.sourceLessonId}`);
    if (source.studentId !== decision.studentId) throw new Error('adaptive decision studentId must match source lesson');
    if (source.intent !== decision.selectedIntent || !sameStringArray(source.objectiveIds, decision.selectedObjectiveIds)) {
      throw new Error('KEEP decision must preserve source lesson intent and objectives');
    }
    if (await this.decisionIdentity(decision) === 'replay') return;

    try {
      await this.db.insert(adaptiveDecisions).values({
        ...decision,
        targetMistakeId: decision.targetMistakeId ?? null,
      });
    } catch (error) {
      const raced = await this.getDecisionByEvaluationKey(
        decision.studentId,
        decision.sourceLessonId,
        decision.inputFactCutoff,
        decision.policyVersion,
      );
      if (raced && same(raced, decision)) return;
      throw error;
    }
  }

  async commitSupersession(input: {
    decision: AdaptiveDecision;
    replacementLesson: DailyLesson;
    supersession: LessonSupersession;
  }): Promise<void> {
    const { decision, replacementLesson, supersession } = input;
    assertValidAdaptiveDecision(decision);
    assertValidLessonSupersession(supersession);
    assertValidDailyLesson(replacementLesson);
    if (decision.action !== 'SUPERSEDE') throw new Error('commitSupersession requires SUPERSEDE action');

    const source = await this.getDailyLesson(decision.sourceLessonId);
    if (!source) throw new Error(`Unknown source daily lesson id: ${decision.sourceLessonId}`);
    if (await this.getSupersessionByReplacementLesson(source.id)) {
      throw new Error('replacement lesson cannot be superseded');
    }

    const existingForSource = await this.getSupersessionForSourceLesson(source.id);
    if (existingForSource) {
      if (await this.exactSupersessionReplay(decision, replacementLesson, supersession)) return;
      throw new Error('source lesson already has a supersession');
    }

    if (source.studentId !== decision.studentId) throw new Error('adaptive decision studentId must match source lesson');
    if (
      replacementLesson.id === source.id
      || replacementLesson.weeklyPlanId !== source.weeklyPlanId
      || replacementLesson.studentId !== source.studentId
      || replacementLesson.sequence !== source.sequence
      || replacementLesson.estimatedMinutes !== source.estimatedMinutes
      || Date.parse(replacementLesson.createdAt) < Date.parse(source.createdAt)
    ) {
      throw new Error('replacement lesson must preserve source lesson coordinates');
    }
    if (replacementLesson.intent !== decision.selectedIntent || !sameStringArray(replacementLesson.objectiveIds, decision.selectedObjectiveIds)) {
      throw new Error('replacement lesson must match adaptive decision selection');
    }
    if (
      supersession.studentId !== decision.studentId
      || supersession.sourceLessonId !== source.id
      || supersession.replacementLessonId !== replacementLesson.id
      || supersession.adaptiveDecisionId !== decision.id
    ) {
      throw new Error('lesson supersession coordinates must match decision and replacement');
    }
    if (await this.getDailyLesson(replacementLesson.id)) throw new Error('replacement daily lesson id already exists');
    if (await this.getSupersessionByReplacementLesson(replacementLesson.id)) {
      throw new Error('replacement lesson already belongs to a supersession');
    }
    if (await this.decisionIdentity(decision) === 'replay') {
      throw new Error('SUPERSEDE decision replay is inconsistent without existing supersession');
    }

    const replacementInsert = this.db.insert(dailyLessons).values({
      id: replacementLesson.id,
      weeklyPlanId: replacementLesson.weeklyPlanId,
      studentId: replacementLesson.studentId,
      sequence: replacementLesson.sequence,
      intent: replacementLesson.intent,
      objectiveIds: replacementLesson.objectiveIds,
      estimatedMinutes: replacementLesson.estimatedMinutes,
      rationale: replacementLesson.rationale,
      createdAt: replacementLesson.createdAt,
    });
    const decisionInsert = this.db.insert(adaptiveDecisions).values({
      ...decision,
      targetMistakeId: decision.targetMistakeId ?? null,
    });
    const supersessionInsert = this.db.insert(lessonSupersessions).values(supersession);

    try {
      await this.db.batch([replacementInsert, decisionInsert, supersessionInsert]);
    } catch (error) {
      if (await this.exactSupersessionReplay(decision, replacementLesson, supersession)) return;
      throw error;
    }
  }

  async getSupersessionForSourceLesson(sourceLessonId: string): Promise<LessonSupersession | undefined> {
    const [row] = await this.db.select().from(lessonSupersessions)
      .where(eq(lessonSupersessions.sourceLessonId, sourceLessonId)).limit(1);
    return row ? toSupersession(row) : undefined;
  }

  async getSupersessionByReplacementLesson(replacementLessonId: string): Promise<LessonSupersession | undefined> {
    const [row] = await this.db.select().from(lessonSupersessions)
      .where(eq(lessonSupersessions.replacementLessonId, replacementLessonId)).limit(1);
    return row ? toSupersession(row) : undefined;
  }
}
