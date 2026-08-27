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
import type { PerformanceRiskFacts, PerformanceRiskSnapshot } from '@/lib/progress';
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
    const [events, links, evidence, correctionItems, reasoningChecks] = await Promise.all([
      this.dependencies.mistakes.listEvents(mistake.id),
      this.dependencies.mistakes.listAttemptLinks(mistake.id),
      this.dependencies.learning.listEvidenceForObjective(mistake.studentId, mistake.objectiveId),
      this.dependencies.mistakes.listCorrectionItems(mistake.id),
      this.dependencies.mistakes.listReasoningChecks(mistake.id),
    ]);
    const availableEvents = events.filter((event) => onOrBefore(event.occurredAt, cutoff));
    const availableLinks = links.filter((link) => onOrBefore(link.linkedAt, cutoff));
    const attempts = (await Promise.all(
      availableLinks.map((link) => this.dependencies.practice.getAttempt(link.attemptId)),
    )).filter((attempt): attempt is NonNullable<typeof attempt> =>
      attempt !== undefined && factOnOrBefore(attempt.submittedAt, attempt.recordedAt, cutoff));

    return {
      mistake,
      events: availableEvents,
      links: availableLinks,
      attempts,
      evidence: evidence.filter((record) => factOnOrBefore(record.observedAt, record.recordedAt, cutoff)),
      correctionItems: correctionItems.filter((item) => onOrBefore(item.createdAt, cutoff)),
      reasoningChecks: reasoningChecks.filter((check) => factOnOrBefore(check.submittedAt, check.recordedAt, cutoff)),
    };
  }

  private async projectEpisodes(studentId: string, cutoff: string): Promise<ProjectedEpisode[]> {
    requireCutoff(cutoff);
    const mistakes = (await this.dependencies.mistakes.listMistakesForStudent(studentId))
      .filter((mistake) => onOrBefore(mistake.firstObservedAt, cutoff) && onOrBefore(mistake.createdAt, cutoff))
      .sort((left, right) =>
        Date.parse(left.firstObservedAt) - Date.parse(right.firstObservedAt) || left.id.localeCompare(right.id));
    const hydrated = await Promise.all(mistakes.map(async (mistake) => {
      const input = await this.hydrate(mistake, cutoff);
      const masteredBeforeMistake = deriveMastery(
        mistake.studentId,
        mistake.objectiveId,
        input.evidence.filter((record) =>
          Date.parse(record.observedAt) < Date.parse(mistake.firstObservedAt)
          && Date.parse(record.recordedAt) <= Date.parse(mistake.firstObservedAt)),
      ).state === 'MASTERED';
      return { mistake, input, masteredBeforeMistake };
    }));

    const projected: ProjectedEpisode[] = [];
    for (const item of hydrated) {
      const target = confirmedDiagnosisTarget(item.input.events);
      const state = projectMistakeState(item.input);
      const key = targetKey(target);
      const recurrent = key !== null && projected.some((earlier) =>
        earlier.mistake.objectiveId === item.mistake.objectiveId
        && targetKey(earlier.target) === key
        && earlier.state === 'RESOLVED'
        && Date.parse(earlier.mistake.firstObservedAt) < Date.parse(item.mistake.firstObservedAt));
      projected.push({
        mistake: item.mistake,
        state,
        target,
        recurrent,
        masteredBeforeMistake: item.masteredBeforeMistake,
      });
    }
    return projected;
  }

  async snapshot(studentId: string, cutoff: string): Promise<PerformanceRiskSnapshot> {
    const episodes = await this.projectEpisodes(studentId, cutoff);
    return {
      recurrenceCount: (objectiveId: string) => episodes.filter((episode) =>
        episode.mistake.objectiveId === objectiveId && episode.recurrent).length,
      hasBlockingMistake: (objectiveId: string) => episodes.some((episode) => deriveMistakePriority({
        state: episode.state,
        diagnosisTarget: episode.target,
        mistakeObjectiveId: episode.mistake.objectiveId,
        forwardObjectiveId: objectiveId,
        recurrent: episode.recurrent,
        masteredBeforeMistake: episode.masteredBeforeMistake,
      }) === 'BLOCKING'),
    };
  }

  async recurrenceCount(studentId: string, objectiveId: string, cutoff: string): Promise<number> {
    return (await this.snapshot(studentId, cutoff)).recurrenceCount(objectiveId);
  }

  async hasBlockingMistake(studentId: string, objectiveId: string, cutoff: string): Promise<boolean> {
    return (await this.snapshot(studentId, cutoff)).hasBlockingMistake(objectiveId);
  }
}
