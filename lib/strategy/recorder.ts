import type { StrategyRepository } from './repository';
import type {
  StrategyEvidence,
  StrategyInteraction,
  StrategyInteractionType,
} from './types';

export interface RecordStrategyInteractionInput {
  interactionId: string;
  evidenceId: string;
  studentId: string;
  objectiveId: string;
  strategyId: string;
  sourceKind: StrategyInteraction['sourceKind'];
  sourceRefId: string;
  assistanceRevealed: boolean;
  interactionKind: 'SELECTION' | 'CONSTRUCTION' | 'TRANSFER';
  structurallyValid: boolean;
}

export interface RecordedStrategyInteraction {
  interaction: StrategyInteraction;
  evidence: StrategyEvidence;
}

function requireNow(now: string): void {
  if (!now || Number.isNaN(Date.parse(now))) {
    throw new Error('strategy interaction time must be a valid ISO date-time string');
  }
}

function resolveInteractionType(input: RecordStrategyInteractionInput): StrategyInteractionType {
  if (input.assistanceRevealed) return 'PROMPTED';
  if (input.interactionKind === 'TRANSFER') return 'TRANSFER_APPLICATION';
  if (input.interactionKind === 'SELECTION') return 'INDEPENDENT_SELECTION';
  return 'INDEPENDENT_CONSTRUCTION';
}

export class StrategyRecorder {
  constructor(private readonly repository: StrategyRepository) {}

  async record(input: RecordStrategyInteractionInput, now: string): Promise<RecordedStrategyInteraction> {
    requireNow(now);
    const interactionType = resolveInteractionType(input);
    const interaction: StrategyInteraction = {
      id: input.interactionId,
      studentId: input.studentId,
      objectiveId: input.objectiveId,
      strategyId: input.strategyId,
      sourceKind: input.sourceKind,
      sourceRefId: input.sourceRefId,
      interactionType,
      outcome: input.structurallyValid ? 'VALID' : 'MISAPPLIED',
      observedAt: now,
      recordedAt: now,
    };

    const evidence: StrategyEvidence = {
      id: input.evidenceId,
      studentId: input.studentId,
      strategyId: input.strategyId,
      objectiveId: input.objectiveId,
      type: !input.structurallyValid
        ? 'MISAPPLICATION'
        : interactionType === 'PROMPTED'
          ? 'PROMPTED_USE'
          : interactionType === 'TRANSFER_APPLICATION'
            ? 'INDEPENDENT_TRANSFER'
            : 'INDEPENDENT_USE',
      interactionId: input.interactionId,
      observedAt: now,
      recordedAt: now,
    };

    await this.repository.appendInteraction(interaction);
    await this.repository.appendEvidence(evidence);
    return { interaction, evidence };
  }
}
