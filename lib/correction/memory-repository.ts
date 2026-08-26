import type { MistakeRepository } from './repository';
import type {
  CorrectionItem,
  CorrectionReasoningCheck,
  Mistake,
  MistakeAttemptLink,
  MistakeEvent,
} from './types';
import {
  assertValidCorrectionItem,
  assertValidCorrectionReasoningCheck,
  assertValidMistake,
  assertValidMistakeEvent,
} from './validation';

function clone<T>(value: T): T {
  return structuredClone(value);
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function linkKey(link: Pick<MistakeAttemptLink, 'mistakeId' | 'attemptId'>): string {
  return JSON.stringify([link.mistakeId, link.attemptId]);
}

function requireNonEmpty(value: string, field: string): void {
  if (!value.trim()) throw new Error(`${field} must be non-empty`);
}

function requireTimestamp(value: string, field: string): void {
  if (!value || Number.isNaN(Date.parse(value))) throw new Error(`${field} must be a valid ISO date-time string`);
}

function compareAt(leftAt: string, leftId: string, rightAt: string, rightId: string): number {
  return Date.parse(leftAt) - Date.parse(rightAt) || leftId.localeCompare(rightId);
}

export class MemoryMistakeRepository implements MistakeRepository {
  private readonly mistakes = new Map<string, Mistake>();
  private readonly links = new Map<string, MistakeAttemptLink>();
  private readonly events = new Map<string, MistakeEvent>();
  private readonly correctionItems = new Map<string, CorrectionItem>();
  private readonly reasoningChecks = new Map<string, CorrectionReasoningCheck>();

  async appendMistake(mistake: Mistake): Promise<void> {
    assertValidMistake(mistake);
    const existing = this.mistakes.get(mistake.id);
    if (existing) {
      if (same(existing, mistake)) return;
      throw new Error('conflicting mistake id reuse');
    }
    this.mistakes.set(mistake.id, clone(mistake));
  }

  async findMistake(id: string): Promise<Mistake | undefined> {
    const value = this.mistakes.get(id);
    return value ? clone(value) : undefined;
  }

  async listMistakesForStudent(studentId: string): Promise<Mistake[]> {
    return [...this.mistakes.values()]
      .filter((mistake) => mistake.studentId === studentId)
      .sort((left, right) => compareAt(left.firstObservedAt, left.id, right.firstObservedAt, right.id))
      .map(clone);
  }

  async listMistakesForStudentObjective(studentId: string, objectiveId: string): Promise<Mistake[]> {
    return [...this.mistakes.values()]
      .filter((mistake) => mistake.studentId === studentId && mistake.objectiveId === objectiveId)
      .sort((left, right) => compareAt(left.firstObservedAt, left.id, right.firstObservedAt, right.id))
      .map(clone);
  }

  async appendAttemptLink(link: MistakeAttemptLink): Promise<void> {
    const mistake = this.mistakes.get(link.mistakeId);
    if (!mistake) throw new Error(`Unknown mistake id: ${link.mistakeId}`);
    requireNonEmpty(link.attemptId, 'mistake attempt link attemptId');
    requireTimestamp(link.linkedAt, 'mistake attempt link linkedAt');
    const key = linkKey(link);
    const existing = this.links.get(key);
    if (existing) {
      if (same(existing, link)) return;
      throw new Error('conflicting mistake attempt link reuse');
    }
    this.links.set(key, clone(link));
  }

  async listAttemptLinks(mistakeId: string): Promise<MistakeAttemptLink[]> {
    return [...this.links.values()]
      .filter((link) => link.mistakeId === mistakeId)
      .sort((left, right) => compareAt(left.linkedAt, left.attemptId, right.linkedAt, right.attemptId))
      .map(clone);
  }

  async appendEvent(event: MistakeEvent): Promise<void> {
    const mistake = this.mistakes.get(event.mistakeId);
    if (!mistake) throw new Error(`Unknown mistake id: ${event.mistakeId}`);
    assertValidMistakeEvent(mistake, event);
    const existing = this.events.get(event.id);
    if (existing) {
      if (same(existing, event)) return;
      throw new Error('conflicting mistake event id reuse');
    }
    this.events.set(event.id, clone(event));
  }

  async getEvent(id: string): Promise<MistakeEvent | undefined> {
    const value = this.events.get(id);
    return value ? clone(value) : undefined;
  }

  async listEvents(mistakeId: string): Promise<MistakeEvent[]> {
    return [...this.events.values()]
      .filter((event) => event.mistakeId === mistakeId)
      .sort((left, right) => compareAt(left.occurredAt, left.id, right.occurredAt, right.id))
      .map(clone);
  }

  async appendCorrectionItem(item: CorrectionItem): Promise<void> {
    const mistake = this.mistakes.get(item.mistakeId);
    if (!mistake) throw new Error(`Unknown mistake id: ${item.mistakeId}`);
    assertValidCorrectionItem(mistake, item);
    const existing = this.correctionItems.get(item.id);
    if (existing) {
      if (same(existing, item)) return;
      throw new Error('conflicting correction item id reuse');
    }
    this.correctionItems.set(item.id, clone(item));
  }

  async getCorrectionItem(id: string): Promise<CorrectionItem | undefined> {
    const value = this.correctionItems.get(id);
    return value ? clone(value) : undefined;
  }

  async listCorrectionItems(mistakeId: string): Promise<CorrectionItem[]> {
    return [...this.correctionItems.values()]
      .filter((item) => item.mistakeId === mistakeId)
      .sort((left, right) => compareAt(left.createdAt, left.id, right.createdAt, right.id))
      .map(clone);
  }

  async appendReasoningCheck(check: CorrectionReasoningCheck): Promise<void> {
    const mistake = this.mistakes.get(check.mistakeId);
    if (!mistake) throw new Error(`Unknown mistake id: ${check.mistakeId}`);
    assertValidCorrectionReasoningCheck(mistake, check);
    const existing = this.reasoningChecks.get(check.id);
    if (existing) {
      if (same(existing, check)) return;
      throw new Error('conflicting correction reasoning check id reuse');
    }
    this.reasoningChecks.set(check.id, clone(check));
  }

  async getReasoningCheck(id: string): Promise<CorrectionReasoningCheck | undefined> {
    const value = this.reasoningChecks.get(id);
    return value ? clone(value) : undefined;
  }

  async listReasoningChecks(mistakeId: string): Promise<CorrectionReasoningCheck[]> {
    return [...this.reasoningChecks.values()]
      .filter((check) => check.mistakeId === mistakeId)
      .sort((left, right) => compareAt(left.submittedAt, left.id, right.submittedAt, right.id))
      .map(clone);
  }
}
