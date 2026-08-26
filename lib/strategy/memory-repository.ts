import type { StrategyRepository } from './repository';
import type { StrategyEvidence, StrategyInteraction } from './types';
import { assertValidStrategyEvidence, assertValidStrategyInteraction } from './validation';

function clone<T>(value: T): T {
  return structuredClone(value);
}

function sameRecord(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function requireCutoff(cutoff: string): void {
  if (!cutoff || Number.isNaN(Date.parse(cutoff))) {
    throw new Error('strategy cutoff must be a valid ISO date-time string');
  }
}

function availableAtCutoff(record: { observedAt: string; recordedAt: string }, cutoff: string): boolean {
  return Date.parse(record.observedAt) <= Date.parse(cutoff)
    && Date.parse(record.recordedAt) <= Date.parse(cutoff);
}

function compareFacts<T extends { observedAt: string; recordedAt: string; id: string }>(left: T, right: T): number {
  return Date.parse(left.observedAt) - Date.parse(right.observedAt)
    || Date.parse(left.recordedAt) - Date.parse(right.recordedAt)
    || left.id.localeCompare(right.id);
}

export class MemoryStrategyRepository implements StrategyRepository {
  private readonly interactions = new Map<string, StrategyInteraction>();
  private readonly evidence = new Map<string, StrategyEvidence>();
  private readonly evidenceIdByInteraction = new Map<string, string>();

  async appendInteraction(interaction: StrategyInteraction): Promise<void> {
    assertValidStrategyInteraction(interaction);
    const existing = this.interactions.get(interaction.id);
    if (existing) {
      if (sameRecord(existing, interaction)) return;
      throw new Error('interaction id already exists with different content');
    }
    this.interactions.set(interaction.id, clone(interaction));
  }

  async appendEvidence(evidence: StrategyEvidence): Promise<void> {
    assertValidStrategyEvidence(evidence);
    const interaction = this.interactions.get(evidence.interactionId);
    if (!interaction) throw new Error(`Unknown strategy interaction id: ${evidence.interactionId}`);
    if (
      interaction.studentId !== evidence.studentId
      || interaction.objectiveId !== evidence.objectiveId
      || interaction.strategyId !== evidence.strategyId
    ) {
      throw new Error('strategy evidence coordinates must match interaction');
    }

    const sameId = this.evidence.get(evidence.id);
    if (sameId) {
      if (sameRecord(sameId, evidence)) return;
      throw new Error('strategy evidence id already exists with different content');
    }

    const existingEvidenceId = this.evidenceIdByInteraction.get(evidence.interactionId);
    if (existingEvidenceId) {
      const existing = this.evidence.get(existingEvidenceId)!;
      if (sameRecord(existing, evidence)) return;
      throw new Error('strategy evidence already exists for interaction');
    }

    this.evidence.set(evidence.id, clone(evidence));
    this.evidenceIdByInteraction.set(evidence.interactionId, evidence.id);
  }

  async getInteraction(id: string): Promise<StrategyInteraction | undefined> {
    const interaction = this.interactions.get(id);
    return interaction ? clone(interaction) : undefined;
  }

  async getEvidenceByInteraction(interactionId: string): Promise<StrategyEvidence | undefined> {
    const evidenceId = this.evidenceIdByInteraction.get(interactionId);
    if (!evidenceId) return undefined;
    return clone(this.evidence.get(evidenceId)!);
  }

  async listInteractionsForStudent(studentId: string, cutoff: string): Promise<StrategyInteraction[]> {
    requireCutoff(cutoff);
    return [...this.interactions.values()]
      .filter((interaction) => interaction.studentId === studentId && availableAtCutoff(interaction, cutoff))
      .sort(compareFacts)
      .map(clone);
  }

  async listEvidenceForStudent(studentId: string, cutoff: string): Promise<StrategyEvidence[]> {
    requireCutoff(cutoff);
    return [...this.evidence.values()]
      .filter((evidence) => evidence.studentId === studentId && availableAtCutoff(evidence, cutoff))
      .sort(compareFacts)
      .map(clone);
  }
}
