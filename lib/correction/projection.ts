import type { EvidenceRecord } from '@/lib/learning';
import type {
  DiagnosisTarget,
  MisconceptionSummary,
  MistakeEvent,
  MistakeProjectionInput,
  MistakeState,
} from './types';

function orderedEvents(events: MistakeEvent[]): MistakeEvent[] {
  return events.slice().sort((left, right) =>
    left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id));
}

function isDiagnosisTarget(value: unknown): value is DiagnosisTarget {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.kind === 'MISCONCEPTION') return typeof candidate.misconceptionId === 'string';
  if (candidate.kind !== 'GENERIC') return false;
  return candidate.code === 'FACT_ERROR'
    || candidate.code === 'PROCEDURE_ERROR'
    || candidate.code === 'REPRESENTATION_ERROR'
    || candidate.code === 'UNKNOWN';
}

export function confirmedDiagnosisTarget(events: MistakeEvent[]): DiagnosisTarget | null {
  let target: DiagnosisTarget | null = null;
  for (const event of orderedEvents(events)) {
    if (event.type !== 'DIAGNOSIS_CONFIRMED') continue;
    const candidate = event.payload.target;
    if (isDiagnosisTarget(candidate)) target = structuredClone(candidate);
  }
  return target;
}

export function canonicalMistakeId(events: MistakeEvent[]): string | null {
  let canonical: string | null = null;
  for (const event of orderedEvents(events)) {
    if (event.type !== 'MISTAKE_CONSOLIDATED') continue;
    const candidate = event.payload.canonicalMistakeId;
    if (typeof candidate === 'string' && candidate.trim()) canonical = candidate;
  }
  return canonical;
}

function hasCorrectionEvidence(
  input: MistakeProjectionInput,
  type: EvidenceRecord['type'],
): boolean {
  return input.evidence.some((record) => {
    if (
      record.studentId !== input.mistake.studentId
      || record.objectiveId !== input.mistake.objectiveId
      || record.origin.kind !== 'CORRECTION'
      || record.type !== type
      || !record.origin.refId
    ) {
      return false;
    }

    if (type === 'explained_independently') {
      return record.origin.refId === input.mistake.id;
    }

    if (type === 'corrected') {
      return input.links.some((link) =>
        link.mistakeId === input.mistake.id
        && link.attemptId === record.origin.refId
        && link.role === 'CORRECTION_RETRY');
    }

    return true;
  });
}

function hasQualifyingTransferSuccess(input: MistakeProjectionInput): boolean {
  if (!input.correctionItems.some((item) =>
    item.mistakeId === input.mistake.id
    && item.studentId === input.mistake.studentId
    && item.objectiveId === input.mistake.objectiveId
    && item.kind === 'TRANSFER')) {
    return false;
  }

  return input.evidence.some((record) => {
    if (
      record.studentId !== input.mistake.studentId
      || record.objectiveId !== input.mistake.objectiveId
      || record.origin.kind !== 'CORRECTION'
      || record.type !== 'application_correct'
      || !record.origin.refId
    ) {
      return false;
    }
    const attempt = input.attempts.find((entry) => entry.id === record.origin.refId);
    if (!attempt || attempt.outcome !== 'CORRECT' || attempt.hintUsed) return false;
    return input.links.some((link) =>
      link.mistakeId === input.mistake.id
      && link.attemptId === attempt.id
      && link.role === 'TRANSFER');
  });
}

export function projectMistakeState(input: MistakeProjectionInput): MistakeState {
  const target = confirmedDiagnosisTarget(input.events);
  if (!target) return 'OBSERVED';

  const correctionStarted = input.events.some((event) => event.type === 'CORRECTION_STARTED');
  if (!correctionStarted) return 'CONFIRMED';

  const corrected = hasCorrectionEvidence(input, 'corrected');
  const explained = hasCorrectionEvidence(input, 'explained_independently');
  if (corrected && explained && hasQualifyingTransferSuccess(input)) return 'RESOLVED';
  return 'CORRECTING';
}

function targetKey(target: DiagnosisTarget): string {
  return target.kind === 'MISCONCEPTION'
    ? `MISCONCEPTION:${target.misconceptionId}`
    : `GENERIC:${target.code}`;
}

function observedTimes(input: MistakeProjectionInput): string[] {
  const observationAttemptIds = new Set(
    input.links
      .filter((link) => link.mistakeId === input.mistake.id && link.role === 'OBSERVATION')
      .map((link) => link.attemptId),
  );
  const times = input.attempts
    .filter((attempt) => observationAttemptIds.has(attempt.id) && attempt.outcome === 'INCORRECT')
    .map((attempt) => attempt.submittedAt);
  return times.length > 0 ? times : [input.mistake.firstObservedAt];
}

export function deriveMisconceptionSummary(
  inputs: MistakeProjectionInput[],
): MisconceptionSummary[] {
  const groups = new Map<string, MisconceptionSummary & { episodeCount: number }>();

  for (const input of inputs) {
    if (canonicalMistakeId(input.events)) continue;
    const target = confirmedDiagnosisTarget(input.events);
    if (!target) continue;

    const key = `${input.mistake.studentId}|${targetKey(target)}`;
    const state = projectMistakeState(input);
    const observationAttemptIds = new Set(
      input.links
        .filter((link) => link.mistakeId === input.mistake.id && link.role === 'OBSERVATION')
        .map((link) => link.attemptId),
    );
    const linkedIncorrectObservationCount = input.attempts.filter((attempt) =>
      observationAttemptIds.has(attempt.id) && attempt.outcome === 'INCORRECT').length;
    const times = observedTimes(input).slice().sort();
    const first = times[0]!;
    const last = times[times.length - 1]!;
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        studentId: input.mistake.studentId,
        target: structuredClone(target),
        activeEpisodeCount: state === 'RESOLVED' ? 0 : 1,
        resolvedEpisodeCount: state === 'RESOLVED' ? 1 : 0,
        recurrenceCount: 0,
        linkedIncorrectObservationCount,
        firstObservedAt: first,
        lastObservedAt: last,
        episodeCount: 1,
      });
      continue;
    }

    existing.episodeCount += 1;
    existing.recurrenceCount = existing.episodeCount - 1;
    existing.activeEpisodeCount += state === 'RESOLVED' ? 0 : 1;
    existing.resolvedEpisodeCount += state === 'RESOLVED' ? 1 : 0;
    existing.linkedIncorrectObservationCount += linkedIncorrectObservationCount;
    if (first < existing.firstObservedAt) existing.firstObservedAt = first;
    if (last > existing.lastObservedAt) existing.lastObservedAt = last;
  }

  return [...groups.values()]
    .map((group): MisconceptionSummary => ({
      studentId: group.studentId,
      target: structuredClone(group.target),
      activeEpisodeCount: group.activeEpisodeCount,
      resolvedEpisodeCount: group.resolvedEpisodeCount,
      recurrenceCount: group.recurrenceCount,
      linkedIncorrectObservationCount: group.linkedIncorrectObservationCount,
      firstObservedAt: group.firstObservedAt,
      lastObservedAt: group.lastObservedAt,
    }))
    .sort((left, right) =>
      left.studentId.localeCompare(right.studentId) || targetKey(left.target).localeCompare(targetKey(right.target)));
}
