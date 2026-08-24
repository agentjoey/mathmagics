import { describe, expect, it } from 'vitest';
import { classifyReadiness, deriveMastery, orderEvidence } from '@/lib/learning';
import type { EvidenceRecord, EvidenceType, MasteryState, PrerequisiteStatus } from '@/lib/learning';

const studentId = 'student-1';
const objectiveId = 'P2-MD-005';
const baseTime = Date.parse('2026-08-24T09:00:00.000Z');

function e(type: EvidenceType, minute: number, overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  const timestamp = new Date(baseTime + minute * 60_000).toISOString();
  return {
    id: `e-${minute}-${type}`,
    studentId,
    objectiveId,
    type,
    observedAt: timestamp,
    recordedAt: timestamp,
    origin: { kind: 'LESSON', refId: 'lesson-1' },
    ...overrides,
  };
}

function p(mastery: MasteryState, objective = `prerequisite-${mastery}`, reviewDue = false): PrerequisiteStatus {
  return { objectiveId: objective, mastery, reviewDue };
}

describe('deterministic mastery policy', () => {
  it('returns NOT_STARTED for empty evidence', () => {
    expect(deriveMastery(studentId, objectiveId, [])).toEqual({
      studentId,
      objectiveId,
      state: 'NOT_STARTED',
      reviewDue: false,
      evidenceCount: 0,
      lastEvidenceAt: null,
    });
  });

  it('distinguishes introduced, developing, and the exact mastery threshold', () => {
    expect(deriveMastery(studentId, objectiveId, [e('introduced', 1)]).state).toBe('INTRODUCED');
    expect(deriveMastery(studentId, objectiveId, [e('incorrect', 1)]).state).toBe('INTRODUCED');
    expect(deriveMastery(studentId, objectiveId, [e('correct_with_hint', 1)]).state).toBe('DEVELOPING');

    const twoIndependent = [e('independent_correct', 1), e('application_correct', 2)];
    expect(deriveMastery(studentId, objectiveId, twoIndependent).state).toBe('DEVELOPING');

    const threeIndependent = [...twoIndependent, e('independent_correct', 3)];
    expect(deriveMastery(studentId, objectiveId, threeIndependent).state).toBe('MASTERED');
  });

  it('requires higher-order evidence before mastery', () => {
    const history = [
      e('independent_correct', 1),
      e('independent_correct', 2),
      e('independent_correct', 3),
    ];
    expect(deriveMastery(studentId, objectiveId, history).state).toBe('DEVELOPING');
    history.push(e('explained_independently', 4));
    expect(deriveMastery(studentId, objectiveId, history).state).toBe('MASTERED');
  });

  it('requires two independent recoveries after the latest pre-mastery incorrect', () => {
    const history = [
      e('independent_correct', 1),
      e('application_correct', 2),
      e('incorrect', 3),
      e('independent_correct', 4),
    ];
    expect(deriveMastery(studentId, objectiveId, history).state).toBe('DEVELOPING');
    history.push(e('explained_independently', 5));
    expect(deriveMastery(studentId, objectiveId, history).state).toBe('MASTERED');
  });

  it('keeps mastery sticky and uses reviewDue for post-mastery incorrect evidence', () => {
    const mastered = [
      e('independent_correct', 1),
      e('explained_independently', 2),
      e('application_correct', 3),
    ];
    expect(deriveMastery(studentId, objectiveId, mastered)).toMatchObject({ state: 'MASTERED', reviewDue: false });

    const afterMasteryIncorrect = [...mastered, e('incorrect', 4)];
    expect(deriveMastery(studentId, objectiveId, afterMasteryIncorrect)).toMatchObject({
      state: 'MASTERED',
      reviewDue: true,
    });

    const afterOneRecovery = [...afterMasteryIncorrect, e('independent_correct', 5)];
    expect(deriveMastery(studentId, objectiveId, afterOneRecovery).reviewDue).toBe(true);

    const afterTwoRecoveries = [...afterOneRecovery, e('independent_correct', 6)];
    expect(deriveMastery(studentId, objectiveId, afterTwoRecoveries).reviewDue).toBe(false);
  });

  it('restarts review recovery after the latest post-mastery incorrect', () => {
    const history = [
      e('independent_correct', 1),
      e('explained_independently', 2),
      e('application_correct', 3),
      e('incorrect', 4),
      e('independent_correct', 5),
      e('independent_correct', 6),
      e('incorrect', 7),
      e('independent_correct', 8),
    ];
    expect(deriveMastery(studentId, objectiveId, history)).toMatchObject({ state: 'MASTERED', reviewDue: true });
    history.push(e('application_correct', 9));
    expect(deriveMastery(studentId, objectiveId, history).reviewDue).toBe(false);
  });

  it('orders evidence by observedAt, recordedAt, then id without mutating input', () => {
    const observed = '2026-08-24T09:10:00.000Z';
    const records = [
      e('introduced', 10, { id: 'c', observedAt: observed, recordedAt: '2026-08-24T09:12:00.000Z' }),
      e('introduced', 10, { id: 'b', observedAt: observed, recordedAt: '2026-08-24T09:11:00.000Z' }),
      e('introduced', 10, { id: 'a', observedAt: observed, recordedAt: '2026-08-24T09:11:00.000Z' }),
      e('introduced', 9, { id: 'd' }),
    ];
    const originalIds = records.map((record) => record.id);

    expect(orderEvidence(records).map((record) => record.id)).toEqual(['d', 'a', 'b', 'c']);
    expect(records.map((record) => record.id)).toEqual(originalIds);
  });

  it('reports evidence count and last observed evidence time from ordered history', () => {
    const later = e('introduced', 3, { id: 'later' });
    const earlier = e('introduced', 1, { id: 'earlier' });
    const snapshot = deriveMastery(studentId, objectiveId, [later, earlier]);
    expect(snapshot.evidenceCount).toBe(2);
    expect(snapshot.lastEvidenceAt).toBe(later.observedAt);
  });
});

describe('prerequisite readiness policy', () => {
  it('is READY with no prerequisites or when all prerequisites are mastered', () => {
    expect(classifyReadiness(studentId, 'target', [])).toMatchObject({ state: 'READY', ready: true });
    expect(classifyReadiness(studentId, 'target', [p('MASTERED')])).toMatchObject({ state: 'READY', ready: true });
  });

  it('is NEEDS_SUPPORT for introduced or developing prerequisites when none are not started', () => {
    expect(classifyReadiness(studentId, 'target', [p('DEVELOPING')])).toMatchObject({
      state: 'NEEDS_SUPPORT',
      ready: false,
    });
    expect(classifyReadiness(studentId, 'target', [p('INTRODUCED')])).toMatchObject({
      state: 'NEEDS_SUPPORT',
      ready: false,
    });
  });

  it('is BLOCKED when any prerequisite is not started', () => {
    expect(classifyReadiness(studentId, 'target', [p('DEVELOPING'), p('NOT_STARTED', 'not-started')])).toMatchObject({
      state: 'BLOCKED',
      ready: false,
    });
  });

  it('does not block on reviewDue for an otherwise mastered prerequisite', () => {
    expect(classifyReadiness(studentId, 'target', [p('MASTERED', 'mastered-review', true)])).toMatchObject({
      state: 'READY',
      ready: true,
    });
  });

  it('returns every non-mastered prerequisite as blocking and defensively copies arrays', () => {
    const prerequisites = [p('DEVELOPING', 'developing'), p('INTRODUCED', 'introduced'), p('MASTERED', 'mastered')];
    const result = classifyReadiness(studentId, 'target', prerequisites);
    expect(result.blockingPrerequisites.map((item) => item.objectiveId)).toEqual(['developing', 'introduced']);
    result.prerequisites[0]!.objectiveId = 'tampered';
    expect(prerequisites[0]!.objectiveId).toBe('developing');
  });
});
