import type { StrategyEvidence, StrategyInteraction } from './types';

export interface StrategyRepository {
  appendInteraction(interaction: StrategyInteraction): Promise<void>;
  appendEvidence(evidence: StrategyEvidence): Promise<void>;
  getInteraction(id: string): Promise<StrategyInteraction | undefined>;
  getEvidenceByInteraction(interactionId: string): Promise<StrategyEvidence | undefined>;
  listInteractionsForStudent(studentId: string, cutoff: string): Promise<StrategyInteraction[]>;
  listEvidenceForStudent(studentId: string, cutoff: string): Promise<StrategyEvidence[]>;
}
