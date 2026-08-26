import { MemoryPlanningRepository } from '@/lib/planning';
import type { DailyLesson } from '@/lib/planning';
import type { AdaptiveRepository } from './repository';
import type { AdaptiveDecision, LessonSupersession } from './types';
import {
  adaptiveEvaluationKey,
  assertValidAdaptiveDecision,
  assertValidLessonSupersession,
} from './validation';

function clone<T>(value: T): T {
  return structuredClone(value);
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameStringArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export class MemoryAdaptiveRepository implements AdaptiveRepository {
  private readonly decisions = new Map<string, AdaptiveDecision>();
  private readonly decisionIdByEvaluationKey = new Map<string, string>();
  private readonly supersessions = new Map<string, LessonSupersession>();
  private readonly supersessionIdBySource = new Map<string, string>();
  private readonly supersessionIdByReplacement = new Map<string, string>();
  private readonly supersessionIdByDecision = new Map<string, string>();

  constructor(private readonly planning: MemoryPlanningRepository) {}

  private validateDecisionIdentity(decision: AdaptiveDecision): 'new' | 'replay' {
    const byId = this.decisions.get(decision.id);
    if (byId) {
      if (same(byId, decision)) return 'replay';
      throw new Error('adaptive decision id already exists with different content');
    }
    const key = adaptiveEvaluationKey(decision);
    const existingId = this.decisionIdByEvaluationKey.get(key);
    if (existingId) {
      const existing = this.decisions.get(existingId)!;
      if (same(existing, decision)) return 'replay';
      throw new Error('adaptive evaluation key already exists with different content');
    }
    return 'new';
  }

  async getDecisionByEvaluationKey(
    studentId: string,
    sourceLessonId: string,
    inputFactCutoff: string,
    policyVersion: string,
  ): Promise<AdaptiveDecision | undefined> {
    const key = JSON.stringify([studentId, sourceLessonId, inputFactCutoff, policyVersion]);
    const id = this.decisionIdByEvaluationKey.get(key);
    if (!id) return undefined;
    return clone(this.decisions.get(id)!);
  }

  async listDecisionsForSourceLesson(sourceLessonId: string): Promise<AdaptiveDecision[]> {
    return [...this.decisions.values()]
      .filter((decision) => decision.sourceLessonId === sourceLessonId)
      .sort((left, right) => Date.parse(left.inputFactCutoff) - Date.parse(right.inputFactCutoff) || left.id.localeCompare(right.id))
      .map(clone);
  }

  async appendKeepDecision(decision: AdaptiveDecision): Promise<void> {
    assertValidAdaptiveDecision(decision);
    if (decision.action !== 'KEEP') throw new Error('appendKeepDecision requires KEEP action');
    const source = await this.planning.getDailyLesson(decision.sourceLessonId);
    if (!source) throw new Error(`Unknown source daily lesson id: ${decision.sourceLessonId}`);
    if (source.studentId !== decision.studentId) throw new Error('adaptive decision studentId must match source lesson');
    if (source.intent !== decision.selectedIntent || !sameStringArray(source.objectiveIds, decision.selectedObjectiveIds)) {
      throw new Error('KEEP decision must preserve source lesson intent and objectives');
    }
    if (this.validateDecisionIdentity(decision) === 'replay') return;
    this.decisions.set(decision.id, clone(decision));
    this.decisionIdByEvaluationKey.set(adaptiveEvaluationKey(decision), decision.id);
  }

  async commitSupersession(input: {
    decision: AdaptiveDecision;
    replacementLesson: DailyLesson;
    supersession: LessonSupersession;
  }): Promise<void> {
    const { decision, replacementLesson, supersession } = input;
    assertValidAdaptiveDecision(decision);
    assertValidLessonSupersession(supersession);
    if (decision.action !== 'SUPERSEDE') throw new Error('commitSupersession requires SUPERSEDE action');

    const source = await this.planning.getDailyLesson(decision.sourceLessonId);
    if (!source) throw new Error(`Unknown source daily lesson id: ${decision.sourceLessonId}`);
    if (this.supersessionIdByReplacement.has(source.id)) throw new Error('replacement lesson cannot be superseded');

    const existingSupersessionId = this.supersessionIdBySource.get(source.id);
    if (existingSupersessionId) {
      const existingSupersession = this.supersessions.get(existingSupersessionId)!;
      const existingDecision = this.decisions.get(existingSupersession.adaptiveDecisionId);
      const existingReplacement = await this.planning.getDailyLesson(existingSupersession.replacementLessonId);
      if (
        existingDecision
        && existingReplacement
        && same(existingDecision, decision)
        && same(existingReplacement, replacementLesson)
        && same(existingSupersession, supersession)
      ) {
        return;
      }
      throw new Error('source lesson already has a supersession');
    }

    if (source.studentId !== decision.studentId) throw new Error('adaptive decision studentId must match source lesson');

    if (
      supersession.studentId !== decision.studentId
      || supersession.sourceLessonId !== source.id
      || supersession.replacementLessonId !== replacementLesson.id
      || supersession.adaptiveDecisionId !== decision.id
    ) {
      throw new Error('lesson supersession coordinates must match decision and replacement');
    }
    if (replacementLesson.intent !== decision.selectedIntent || !sameStringArray(replacementLesson.objectiveIds, decision.selectedObjectiveIds)) {
      throw new Error('replacement lesson must match adaptive decision selection');
    }

    if (this.supersessions.has(supersession.id)) throw new Error('lesson supersession id already exists');
    if (this.supersessionIdByReplacement.has(replacementLesson.id)) throw new Error('replacement lesson already belongs to a supersession');
    if (this.supersessionIdByDecision.has(decision.id)) throw new Error('adaptive decision already owns a supersession');
    if (this.validateDecisionIdentity(decision) === 'replay') {
      throw new Error('SUPERSEDE decision replay is inconsistent without existing supersession');
    }

    await this.planning.appendAdaptiveReplacementLesson(source.id, replacementLesson);
    this.decisions.set(decision.id, clone(decision));
    this.decisionIdByEvaluationKey.set(adaptiveEvaluationKey(decision), decision.id);
    this.supersessions.set(supersession.id, clone(supersession));
    this.supersessionIdBySource.set(source.id, supersession.id);
    this.supersessionIdByReplacement.set(replacementLesson.id, supersession.id);
    this.supersessionIdByDecision.set(decision.id, supersession.id);
  }

  async getSupersessionForSourceLesson(sourceLessonId: string): Promise<LessonSupersession | undefined> {
    const id = this.supersessionIdBySource.get(sourceLessonId);
    return id ? clone(this.supersessions.get(id)!) : undefined;
  }

  async getSupersessionByReplacementLesson(replacementLessonId: string): Promise<LessonSupersession | undefined> {
    const id = this.supersessionIdByReplacement.get(replacementLessonId);
    return id ? clone(this.supersessions.get(id)!) : undefined;
  }
}
