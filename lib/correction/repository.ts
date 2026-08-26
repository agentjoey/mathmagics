import type {
  CorrectionItem,
  CorrectionReasoningCheck,
  Mistake,
  MistakeAttemptLink,
  MistakeEvent,
} from './types';

export interface MistakeRepository {
  appendMistake(mistake: Mistake): Promise<void>;
  findMistake(id: string): Promise<Mistake | undefined>;
  listMistakesForStudent(studentId: string): Promise<Mistake[]>;
  listMistakesForStudentObjective(studentId: string, objectiveId: string): Promise<Mistake[]>;

  appendAttemptLink(link: MistakeAttemptLink): Promise<void>;
  listAttemptLinks(mistakeId: string): Promise<MistakeAttemptLink[]>;

  appendEvent(event: MistakeEvent): Promise<void>;
  getEvent(id: string): Promise<MistakeEvent | undefined>;
  listEvents(mistakeId: string): Promise<MistakeEvent[]>;

  appendCorrectionItem(item: CorrectionItem): Promise<void>;
  getCorrectionItem(id: string): Promise<CorrectionItem | undefined>;
  listCorrectionItems(mistakeId: string): Promise<CorrectionItem[]>;

  appendReasoningCheck(check: CorrectionReasoningCheck): Promise<void>;
  getReasoningCheck(id: string): Promise<CorrectionReasoningCheck | undefined>;
  listReasoningChecks(mistakeId: string): Promise<CorrectionReasoningCheck[]>;
}
