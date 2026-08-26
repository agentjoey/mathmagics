import {
  confirmedDiagnosisTarget,
  projectMistakeState,
} from '@/lib/correction';
import type {
  DiagnosisTarget,
  Mistake,
  MistakeProjectionInput,
  MistakeRepository,
  MistakeState,
} from '@/lib/correction';
import { deriveMastery } from '@/lib/learning';
import type { LearningStateRepository } from '@/lib/learning';
import type { PracticeRepository } from '@/lib/practice';
import type { PerformanceRiskFacts } from '@/lib/progress';
import { deriveMistakePriority } from './mistake-priority';

export interface CorrectionPerformanceRiskFactsDependencies {
  mistakes: MistakeRepository;
  practice: PracticeRepository;
  learning: LearningStateRepository;
}

interface ProjectedEpisode {
  mistake: Mistake;
  state: MistakeState;
  target: DiagnosisTarget | null;
  recurrent: boolean;
  masteredBeforeMistake: boolean;
}

function requireCutoff(cutoff: string): void {
  if (!cutoff || Number.isNaN(Date.parse(cutoff))) {
    throw new Error('performance risk cutoff must be a valid ISO date-time string');
  }
}

function onOrBefore(value: string, cutoff: string): boolean {
  return Date.parse(value) <= Date.parse(cutoff);
}

function factOnOrBefore(observedAt: string, recordedAt: string, cutoff: string): boolean {
  return onOrBefore(observedAt, cutoff) && onOrBefore(recordedAt, cutoff);
}

function targetKey(target: DiagnosisTarget | null): string | null {
  if (!target) return null;
  return target.kind === 'MISCONCEPTION'
    ? `MISCONCEPTION:${target.misconceptionId}`
    : `GENERIC:${target.code}`;
}

export class CorrectionPerformanceRiskFacts implements PerformanceRiskFacts {
  constructor(private readonly dependencies: CorrectionPerformanceRiskFactsDependencies) {}

  private async hydrate(mistake: Mistake, cutoff: string): Promise<MistakeProjectionInput> {
    const events = (await this.dependencies.mistakes.listEvents(mistake.id))
      .filter((event) => onOrBefore(event.occurredAt, cutoff));
    const links = (await this.dependencies.mistakes.listAttemptLinks(mistake.id))
      .filter((link) => onOrBefore(link.linkedAt, cutoff));
    const attempts = (await Promise.all(
      links.map((link) => this.dependencies.practice.getAttempt(link.attemptId)),
    )).filter((attempt): attempt is NonNullable<typeof attempt> =>
      attempt !== undefined && factOnOrBefore(attempt.submittedAt, attempt.recordedAt, cutoff));
    const evidence = (await this.dependencies.learning.listEvidenceForObjective(mistake.studentId, mistake.objectiveId))
      .filter((record) => factOnOrBefore(record.observedAt, record.recordedAt, cutoff));
    const correctionItems = (await this.dependencies.mistakes.listCorrectionItems(mistake.id))
      .filter((item) => onOrBefore(item.createdAt, cutoff));
    const reasoningChecks = (await this.dependencies.mistakes.listReasoningChecks(mistake.id))
      .filter((check) => factOnOrBefore(check.submittedAt, check.recordedAt, cutoff));

    return { mistake, events, links, attempts, evidence, correctionItems, reasoningChecks };
  }

  private async wasMasteredBefore(mistake: Mistake): Promise<boolean> {
    const evidence = (await this.dependencies.learning.listEvidenceForObjective(mistake.studentId, mistake.objectiveId))
      .filter((record) =>
        Date.parse(record.observedAt) < Date.parse(mistake.firstObservedAt)
        && Date.parse(record.recordedAt) <= Date.parse(mistake.firstObservedAt));
    return deriveMastery(mistake.studentId, mistake.objectiveId, evidence).state === 'MASTERED';
  }

  private async projectEpisodes(studentId: string, cutoff: string): Promise<ProjectedEpisode[]> {
    requireCutoff(cutoff);
    const mistakes = (await this.dependencies.mistakes.listMistakesForStudent(studentId))
      .filter((mistake) => onOrBefore(mistake.firstObservedAt, cutoff) && onOrBefore(mistake.createdAt, cutoff))
      .sort((left, right) =>
        Date.parse(left.firstObservedAt) - Date.parse(right.firstObservedAt) || left.id.localeCompare(right.id));

    const projected: ProjectedEpisode[] = [];
    for (const mistake of mistakes) {
      const input = await this.hydrate(mistake, cutoff);
      const target = confirmedDiagnosisTarget(input.events);
      const state = projectMistakeState(input);
      const key = targetKey(target);
      const recurrent = key !== null && projected.some((earlier) =>
        earlier.mistake.objectiveId === mistake.objectiveId
        && targetKey(earlier.target) === key
        && earlier.state === 'RESOLVED'
        && Date.parse(earlier.mistake.firstObservedAt) < Date.parse(mistake.firstObservedAt));
      projected.push({
        mistake,
        state,
        target,
        recurrent,
        masteredBeforeMistake: await this.wasMasteredBefore(mistake),
      });
    }
    return projected;
  }

  async recurrenceCount(studentId: string, objectiveId: string, cutoff: string): Promise<number> {
    const episodes = await this.projectEpisodes(studentId, cutoff);
    return episodes.filter((episode) =>
      episode.mistake.objectiveId === objectiveId && episode.recurrent).length;
  }

  async hasBlockingMistake(studentId: string, objectiveId: string, cutoff: string): Promise<boolean> {
    const episodes = await this.projectEpisodes(studentId, cutoff);
    return episodes.some((episode) => deriveMistakePriority({
      state: episode.state,
      diagnosisTarget: episode.target,
      mistakeObjectiveId: episode.mistake.objectiveId,
      forwardObjectiveId: objectiveId,
      recurrent: episode.recurrent,
      masteredBeforeMistake: episode.masteredBeforeMistake,
    }) === 'BLOCKING');
  }
}
