import { and, asc, eq, lte } from 'drizzle-orm';
import type {
  StrategyEvidence,
  StrategyEvidenceType,
  StrategyInteraction,
  StrategyInteractionOutcome,
  StrategyInteractionType,
  StrategyRepository,
} from '@/lib/strategy';
import {
  assertValidStrategyEvidence,
  assertValidStrategyInteraction,
} from '@/lib/strategy';
import { createNeonDatabase } from './db';
import type { MathMagicsDatabase } from './db';
import { strategyEvidence, strategyInteractions } from './schema';

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function requireCutoff(cutoff: string): void {
  if (!cutoff || Number.isNaN(Date.parse(cutoff))) {
    throw new Error('strategy cutoff must be a valid ISO date-time string');
  }
}

function toInteraction(row: typeof strategyInteractions.$inferSelect): StrategyInteraction {
  const interaction: StrategyInteraction = {
    id: row.id,
    studentId: row.studentId,
    objectiveId: row.objectiveId,
    strategyId: row.strategyId,
    sourceKind: row.sourceKind as StrategyInteraction['sourceKind'],
    sourceRefId: row.sourceRefId,
    interactionType: row.interactionType as StrategyInteractionType,
    outcome: row.outcome as StrategyInteractionOutcome,
    observedAt: row.observedAt,
    recordedAt: row.recordedAt,
  };
  assertValidStrategyInteraction(interaction);
  return interaction;
}

function toEvidence(row: typeof strategyEvidence.$inferSelect): StrategyEvidence {
  const evidence: StrategyEvidence = {
    id: row.id,
    studentId: row.studentId,
    strategyId: row.strategyId,
    objectiveId: row.objectiveId,
    type: row.type as StrategyEvidenceType,
    interactionId: row.interactionId,
    observedAt: row.observedAt,
    recordedAt: row.recordedAt,
  };
  assertValidStrategyEvidence(evidence);
  return evidence;
}

export class NeonStrategyRepository implements StrategyRepository {
  constructor(private readonly db: MathMagicsDatabase = createNeonDatabase()) {}

  async appendInteraction(interaction: StrategyInteraction): Promise<void> {
    assertValidStrategyInteraction(interaction);
    const existing = await this.getInteraction(interaction.id);
    if (existing) {
      if (same(existing, interaction)) return;
      throw new Error('interaction id already exists with different content');
    }
    await this.db.insert(strategyInteractions).values(interaction);
  }

  async appendEvidence(evidence: StrategyEvidence): Promise<void> {
    assertValidStrategyEvidence(evidence);
    const interaction = await this.getInteraction(evidence.interactionId);
    if (!interaction) throw new Error(`Unknown strategy interaction id: ${evidence.interactionId}`);
    if (
      interaction.studentId !== evidence.studentId
      || interaction.objectiveId !== evidence.objectiveId
      || interaction.strategyId !== evidence.strategyId
    ) {
      throw new Error('strategy evidence coordinates must match interaction');
    }

    const [sameIdRow] = await this.db.select().from(strategyEvidence)
      .where(eq(strategyEvidence.id, evidence.id)).limit(1);
    if (sameIdRow) {
      const existing = toEvidence(sameIdRow);
      if (same(existing, evidence)) return;
      throw new Error('strategy evidence id already exists with different content');
    }

    const existingForInteraction = await this.getEvidenceByInteraction(evidence.interactionId);
    if (existingForInteraction) {
      if (same(existingForInteraction, evidence)) return;
      throw new Error('strategy evidence already exists for interaction');
    }

    try {
      await this.db.insert(strategyEvidence).values(evidence);
    } catch (error) {
      const raced = await this.getEvidenceByInteraction(evidence.interactionId);
      if (raced && same(raced, evidence)) return;
      throw error;
    }
  }

  async getInteraction(id: string): Promise<StrategyInteraction | undefined> {
    const [row] = await this.db.select().from(strategyInteractions)
      .where(eq(strategyInteractions.id, id)).limit(1);
    return row ? toInteraction(row) : undefined;
  }

  async getEvidenceByInteraction(interactionId: string): Promise<StrategyEvidence | undefined> {
    const [row] = await this.db.select().from(strategyEvidence)
      .where(eq(strategyEvidence.interactionId, interactionId)).limit(1);
    return row ? toEvidence(row) : undefined;
  }

  async listInteractionsForStudent(studentId: string, cutoff: string): Promise<StrategyInteraction[]> {
    requireCutoff(cutoff);
    const rows = await this.db.select().from(strategyInteractions)
      .where(and(
        eq(strategyInteractions.studentId, studentId),
        lte(strategyInteractions.observedAt, cutoff),
        lte(strategyInteractions.recordedAt, cutoff),
      ))
      .orderBy(
        asc(strategyInteractions.observedAt),
        asc(strategyInteractions.recordedAt),
        asc(strategyInteractions.id),
      );
    return rows.map(toInteraction);
  }

  async listEvidenceForStudent(studentId: string, cutoff: string): Promise<StrategyEvidence[]> {
    requireCutoff(cutoff);
    const rows = await this.db.select().from(strategyEvidence)
      .where(and(
        eq(strategyEvidence.studentId, studentId),
        lte(strategyEvidence.observedAt, cutoff),
        lte(strategyEvidence.recordedAt, cutoff),
      ))
      .orderBy(
        asc(strategyEvidence.observedAt),
        asc(strategyEvidence.recordedAt),
        asc(strategyEvidence.id),
      );
    return rows.map(toEvidence);
  }
}
