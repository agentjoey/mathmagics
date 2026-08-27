import { and, asc, eq } from 'drizzle-orm';
import type {
  CorrectionItem,
  CorrectionReasoningCheck,
  DiagnosisTarget,
  Mistake,
  MistakeAttemptLink,
  MistakeEvent,
  MistakeRepository,
  ReasoningCheckSpec,
} from '@/lib/correction';
import {
  assertValidCorrectionItem,
  assertValidCorrectionReasoningCheck,
  assertValidMistake,
  assertValidMistakeEvent,
} from '@/lib/correction';
import type { AnswerSpec, PracticeProblemSpec } from '@/lib/practice';
import { createNeonDatabase } from './db';
import type { MathMagicsDatabase } from './db';
import { canonicalInstant } from './instant';
import {
  correctionItems,
  correctionReasoningChecks,
  mistakeAttemptLinks,
  mistakeEvents,
  mistakes,
} from './schema';

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function toMistake(row: typeof mistakes.$inferSelect): Mistake {
  const value: Mistake = {
    id: row.id,
    studentId: row.studentId,
    objectiveId: row.objectiveId,
    initialAttemptId: row.initialAttemptId,
    initialDiagnosisTarget: structuredClone(row.initialDiagnosisTarget as DiagnosisTarget),
    diagnosisPolicyVersion: row.diagnosisPolicyVersion as Mistake['diagnosisPolicyVersion'],
    firstObservedAt: canonicalInstant(row.firstObservedAt),
    createdAt: canonicalInstant(row.createdAt),
  };
  assertValidMistake(value);
  return value;
}

function toLink(row: typeof mistakeAttemptLinks.$inferSelect): MistakeAttemptLink {
  return {
    mistakeId: row.mistakeId,
    attemptId: row.attemptId,
    role: row.role as MistakeAttemptLink['role'],
    linkedAt: canonicalInstant(row.linkedAt),
  };
}

function toEvent(row: typeof mistakeEvents.$inferSelect): MistakeEvent {
  return {
    id: row.id,
    mistakeId: row.mistakeId,
    type: row.type as MistakeEvent['type'],
    payload: structuredClone(row.payload as Record<string, unknown>),
    actorKind: row.actorKind as MistakeEvent['actorKind'],
    policyVersion: row.policyVersion,
    occurredAt: canonicalInstant(row.occurredAt),
  };
}

function toCorrectionItem(row: typeof correctionItems.$inferSelect): CorrectionItem {
  return {
    id: row.id,
    mistakeId: row.mistakeId,
    studentId: row.studentId,
    objectiveId: row.objectiveId,
    kind: row.kind as CorrectionItem['kind'],
    sourceAttemptId: row.sourceAttemptId,
    transferRound: row.transferRound ?? undefined,
    problemSpec: structuredClone(row.problemSpec as PracticeProblemSpec),
    answerSpec: structuredClone(row.answerSpec as AnswerSpec),
    prompt: row.prompt,
    hint: row.hint ?? undefined,
    solutionOutline: structuredClone(row.solutionOutline),
    generator: row.generator,
    generatorVersion: row.generatorVersion,
    createdAt: canonicalInstant(row.createdAt),
  };
}

function toReasoningCheck(row: typeof correctionReasoningChecks.$inferSelect): CorrectionReasoningCheck {
  return {
    id: row.id,
    mistakeId: row.mistakeId,
    studentId: row.studentId,
    objectiveId: row.objectiveId,
    checkSpec: structuredClone(row.checkSpec as ReasoningCheckSpec),
    response: structuredClone(row.response),
    outcome: row.outcome as CorrectionReasoningCheck['outcome'],
    assisted: row.assisted,
    policyVersion: row.policyVersion as CorrectionReasoningCheck['policyVersion'],
    submittedAt: canonicalInstant(row.submittedAt),
    recordedAt: canonicalInstant(row.recordedAt),
  };
}

export class NeonMistakeRepository implements MistakeRepository {
  constructor(private readonly db: MathMagicsDatabase = createNeonDatabase()) {}

  async appendMistake(mistake: Mistake): Promise<void> {
    assertValidMistake(mistake);
    const existing = await this.findMistake(mistake.id);
    if (existing) {
      if (same(existing, mistake)) return;
      throw new Error('conflicting mistake id reuse');
    }
    await this.db.insert(mistakes).values({
      id: mistake.id,
      studentId: mistake.studentId,
      objectiveId: mistake.objectiveId,
      initialAttemptId: mistake.initialAttemptId,
      initialDiagnosisTarget: structuredClone(mistake.initialDiagnosisTarget),
      diagnosisPolicyVersion: mistake.diagnosisPolicyVersion,
      firstObservedAt: mistake.firstObservedAt,
      createdAt: mistake.createdAt,
    });
  }

  async findMistake(id: string): Promise<Mistake | undefined> {
    const [row] = await this.db.select().from(mistakes).where(eq(mistakes.id, id)).limit(1);
    return row ? toMistake(row) : undefined;
  }

  async listMistakesForStudent(studentId: string): Promise<Mistake[]> {
    const rows = await this.db.select().from(mistakes)
      .where(eq(mistakes.studentId, studentId))
      .orderBy(asc(mistakes.firstObservedAt), asc(mistakes.id));
    return rows.map(toMistake);
  }

  async listMistakesForStudentObjective(studentId: string, objectiveId: string): Promise<Mistake[]> {
    const rows = await this.db.select().from(mistakes)
      .where(and(eq(mistakes.studentId, studentId), eq(mistakes.objectiveId, objectiveId)))
      .orderBy(asc(mistakes.firstObservedAt), asc(mistakes.id));
    return rows.map(toMistake);
  }

  async appendAttemptLink(link: MistakeAttemptLink): Promise<void> {
    if (!(await this.findMistake(link.mistakeId))) throw new Error(`Unknown mistake id: ${link.mistakeId}`);
    const [row] = await this.db.select().from(mistakeAttemptLinks)
      .where(and(
        eq(mistakeAttemptLinks.mistakeId, link.mistakeId),
        eq(mistakeAttemptLinks.attemptId, link.attemptId),
      )).limit(1);
    if (row) {
      if (same(toLink(row), link)) return;
      throw new Error('conflicting mistake attempt link reuse');
    }
    await this.db.insert(mistakeAttemptLinks).values(link);
  }

  async listAttemptLinks(mistakeId: string): Promise<MistakeAttemptLink[]> {
    const rows = await this.db.select().from(mistakeAttemptLinks)
      .where(eq(mistakeAttemptLinks.mistakeId, mistakeId))
      .orderBy(asc(mistakeAttemptLinks.linkedAt), asc(mistakeAttemptLinks.attemptId));
    return rows.map(toLink);
  }

  async appendEvent(event: MistakeEvent): Promise<void> {
    const mistake = await this.findMistake(event.mistakeId);
    if (!mistake) throw new Error(`Unknown mistake id: ${event.mistakeId}`);
    assertValidMistakeEvent(mistake, event);
    const existing = await this.getEvent(event.id);
    if (existing) {
      if (same(existing, event)) return;
      throw new Error('conflicting mistake event id reuse');
    }
    await this.db.insert(mistakeEvents).values({
      id: event.id,
      mistakeId: event.mistakeId,
      type: event.type,
      payload: structuredClone(event.payload),
      actorKind: event.actorKind,
      policyVersion: event.policyVersion,
      occurredAt: event.occurredAt,
    });
  }

  async getEvent(id: string): Promise<MistakeEvent | undefined> {
    const [row] = await this.db.select().from(mistakeEvents).where(eq(mistakeEvents.id, id)).limit(1);
    return row ? toEvent(row) : undefined;
  }

  async listEvents(mistakeId: string): Promise<MistakeEvent[]> {
    const rows = await this.db.select().from(mistakeEvents)
      .where(eq(mistakeEvents.mistakeId, mistakeId))
      .orderBy(asc(mistakeEvents.occurredAt), asc(mistakeEvents.id));
    return rows.map(toEvent);
  }

  async appendCorrectionItem(item: CorrectionItem): Promise<void> {
    const mistake = await this.findMistake(item.mistakeId);
    if (!mistake) throw new Error(`Unknown mistake id: ${item.mistakeId}`);
    assertValidCorrectionItem(mistake, item);
    const existing = await this.getCorrectionItem(item.id);
    if (existing) {
      if (same(existing, item)) return;
      throw new Error('conflicting correction item id reuse');
    }
    await this.db.insert(correctionItems).values({
      id: item.id,
      mistakeId: item.mistakeId,
      studentId: item.studentId,
      objectiveId: item.objectiveId,
      kind: item.kind,
      sourceAttemptId: item.sourceAttemptId,
      transferRound: item.transferRound,
      problemSpec: structuredClone(item.problemSpec),
      answerSpec: structuredClone(item.answerSpec),
      prompt: item.prompt,
      hint: item.hint,
      solutionOutline: structuredClone(item.solutionOutline),
      generator: item.generator,
      generatorVersion: item.generatorVersion,
      createdAt: item.createdAt,
    });
  }

  async getCorrectionItem(id: string): Promise<CorrectionItem | undefined> {
    const [row] = await this.db.select().from(correctionItems).where(eq(correctionItems.id, id)).limit(1);
    return row ? toCorrectionItem(row) : undefined;
  }

  async listCorrectionItems(mistakeId: string): Promise<CorrectionItem[]> {
    const rows = await this.db.select().from(correctionItems)
      .where(eq(correctionItems.mistakeId, mistakeId))
      .orderBy(asc(correctionItems.createdAt), asc(correctionItems.id));
    return rows.map(toCorrectionItem);
  }

  async appendReasoningCheck(check: CorrectionReasoningCheck): Promise<void> {
    const mistake = await this.findMistake(check.mistakeId);
    if (!mistake) throw new Error(`Unknown mistake id: ${check.mistakeId}`);
    assertValidCorrectionReasoningCheck(mistake, check);
    const existing = await this.getReasoningCheck(check.id);
    if (existing) {
      if (same(existing, check)) return;
      throw new Error('conflicting correction reasoning check id reuse');
    }
    await this.db.insert(correctionReasoningChecks).values({
      id: check.id,
      mistakeId: check.mistakeId,
      studentId: check.studentId,
      objectiveId: check.objectiveId,
      checkSpec: structuredClone(check.checkSpec),
      response: structuredClone(check.response),
      outcome: check.outcome,
      assisted: check.assisted,
      policyVersion: check.policyVersion,
      submittedAt: check.submittedAt,
      recordedAt: check.recordedAt,
    });
  }

  async getReasoningCheck(id: string): Promise<CorrectionReasoningCheck | undefined> {
    const [row] = await this.db.select().from(correctionReasoningChecks)
      .where(eq(correctionReasoningChecks.id, id)).limit(1);
    return row ? toReasoningCheck(row) : undefined;
  }

  async listReasoningChecks(mistakeId: string): Promise<CorrectionReasoningCheck[]> {
    const rows = await this.db.select().from(correctionReasoningChecks)
      .where(eq(correctionReasoningChecks.mistakeId, mistakeId))
      .orderBy(asc(correctionReasoningChecks.submittedAt), asc(correctionReasoningChecks.id));
    return rows.map(toReasoningCheck);
  }
}
