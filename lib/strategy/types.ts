export type StrategyInteractionType =
  | 'PROMPTED'
  | 'INDEPENDENT_SELECTION'
  | 'INDEPENDENT_CONSTRUCTION'
  | 'TRANSFER_APPLICATION';

export type StrategyInteractionOutcome = 'VALID' | 'MISAPPLIED';

export type StrategyEvidenceType =
  | 'PROMPTED_USE'
  | 'INDEPENDENT_USE'
  | 'INDEPENDENT_TRANSFER'
  | 'MISAPPLICATION';

export type StrategyProgressState = 'NOT_OBSERVED' | 'DEVELOPING' | 'RELIABLE';

export interface StrategyInteraction {
  id: string;
  studentId: string;
  objectiveId: string;
  strategyId: string;
  sourceKind: 'PRACTICE' | 'HOMEWORK' | 'CORRECTION' | 'LESSON';
  sourceRefId: string;
  interactionType: StrategyInteractionType;
  outcome: StrategyInteractionOutcome;
  observedAt: string;
  recordedAt: string;
}

export interface StrategyEvidence {
  id: string;
  studentId: string;
  strategyId: string;
  objectiveId: string;
  type: StrategyEvidenceType;
  interactionId: string;
  observedAt: string;
  recordedAt: string;
}

export interface StrategyProgressSnapshot {
  strategyId: string;
  state: StrategyProgressState;
  evidenceCount: number;
  qualifyingEvidenceCount: number;
  independentUseCount: number;
  independentTransferCount: number;
  objectiveCount: number;
  lastObservedAt: string | null;
}
