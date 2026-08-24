import type { EvidenceRecord, EvidenceType, MasterySnapshot } from './types';

const SUCCESSFUL = new Set<EvidenceType>([
  'correct_with_hint',
  'independent_correct',
  'corrected',
  'explained_independently',
  'application_correct',
]);

const INDEPENDENT = new Set<EvidenceType>([
  'independent_correct',
  'explained_independently',
  'application_correct',
]);

const HIGHER_ORDER = new Set<EvidenceType>(['explained_independently', 'application_correct']);

export function orderEvidence(records: EvidenceRecord[]): EvidenceRecord[] {
  return records.slice().sort((a, b) => {
    const observedDelta = Date.parse(a.observedAt) - Date.parse(b.observedAt);
    if (observedDelta !== 0) return observedDelta;

    const recordedDelta = Date.parse(a.recordedAt) - Date.parse(b.recordedAt);
    if (recordedDelta !== 0) return recordedDelta;

    return a.id.localeCompare(b.id);
  });
}

export function deriveMastery(
  studentId: string,
  objectiveId: string,
  records: EvidenceRecord[],
): MasterySnapshot {
  const ordered = orderEvidence(records);
  if (ordered.length === 0) {
    return {
      studentId,
      objectiveId,
      state: 'NOT_STARTED',
      reviewDue: false,
      evidenceCount: 0,
      lastEvidenceAt: null,
    };
  }

  let hasSuccessfulEvidence = false;
  let independentCount = 0;
  let hasHigherOrderEvidence = false;
  let lastIncorrectIndex = -1;
  let independentSinceLastIncorrect = 0;
  let masteryAttainmentIndex = -1;

  for (let index = 0; index < ordered.length; index += 1) {
    const type = ordered[index]!.type;

    if (SUCCESSFUL.has(type)) hasSuccessfulEvidence = true;

    if (type === 'incorrect') {
      lastIncorrectIndex = index;
      independentSinceLastIncorrect = 0;
    } else if (INDEPENDENT.has(type)) {
      independentCount += 1;
      independentSinceLastIncorrect += 1;
      if (HIGHER_ORDER.has(type)) hasHigherOrderEvidence = true;
    }

    if (
      masteryAttainmentIndex === -1 &&
      independentCount >= 3 &&
      hasHigherOrderEvidence &&
      (lastIncorrectIndex === -1 || independentSinceLastIncorrect >= 2)
    ) {
      masteryAttainmentIndex = index;
    }
  }

  const state =
    masteryAttainmentIndex !== -1 ? 'MASTERED' : hasSuccessfulEvidence ? 'DEVELOPING' : 'INTRODUCED';

  let reviewDue = false;
  if (masteryAttainmentIndex !== -1) {
    let latestPostMasteryIncorrect = -1;
    for (let index = masteryAttainmentIndex + 1; index < ordered.length; index += 1) {
      if (ordered[index]!.type === 'incorrect') latestPostMasteryIncorrect = index;
    }

    if (latestPostMasteryIncorrect !== -1) {
      let recoveries = 0;
      for (let index = latestPostMasteryIncorrect + 1; index < ordered.length; index += 1) {
        if (INDEPENDENT.has(ordered[index]!.type)) recoveries += 1;
      }
      reviewDue = recoveries < 2;
    }
  }

  return {
    studentId,
    objectiveId,
    state,
    reviewDue,
    evidenceCount: ordered.length,
    lastEvidenceAt: ordered[ordered.length - 1]!.observedAt,
  };
}
