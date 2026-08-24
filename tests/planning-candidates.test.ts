import { describe, expect, it } from 'vitest';
import {
  MemoryLearningStateRepository,
  type EvidenceRecord,
  type EvidenceType,
  type StudentProfile,
} from '@/lib/learning';
import { listLearningCandidates, type LearningPosition } from '@/lib/planning';

const BASE = Date.parse('2026-08-24T09:00:00.000Z');

function profile(): StudentProfile {
  return {
    id: 'student-p3',
    displayName: 'Alex',
    levelId: 'P3',
    learningMode: 'STRUCTURED_HOME_LEARNING',
    sessionsPerWeek: 4,
    minutesPerSession: 30,
    createdAt: new Date(BASE).toISOString(),
    updatedAt: new Date(BASE).toISOString(),
  };
}

function record(
  id: string,
  objectiveId: string,
  type: EvidenceType,
  minute: number,
): EvidenceRecord {
  const at = new Date(BASE + minute * 60_000).toISOString();
  return {
    id,
    studentId: 'student-p3',
    objectiveId,
    type,
    observedAt: at,
    recordedAt: at,
    origin: { kind: 'LESSON', refId: 'lesson-fixture' },
  };
}

async function addMastered(
  repository: MemoryLearningStateRepository,
  objectiveId: string,
  prefix: string,
  startMinute: number,
): Promise<void> {
  await repository.appendEvidence(record(`${prefix}-1`, objectiveId, 'independent_correct', startMinute));
  await repository.appendEvidence(record(`${prefix}-2`, objectiveId, 'explained_independently', startMinute + 1));
  await repository.appendEvidence(record(`${prefix}-3`, objectiveId, 'application_correct', startMinute + 2));
}

function position(overrides: Partial<LearningPosition> = {}): LearningPosition {
  return {
    studentId: 'student-p3',
    levelId: 'P3',
    anchorTopicId: 'P3-FRACTIONS',
    anchorObjectiveId: 'P3-FRA-003',
    reviewObjectiveIds: [],
    derivedAt: '2026-08-25T01:00:00.000Z',
    ...overrides,
  };
}

describe('deterministic learning candidates', () => {
  it('promotes real direct prerequisites and orders NOT_STARTED before DEVELOPING', async () => {
    const repository = new MemoryLearningStateRepository();
    await repository.saveStudent(profile());
    await repository.appendEvidence(record('fra-dev', 'P3-FRA-001', 'correct_with_hint', 1));

    const candidates = await listLearningCandidates(repository, position());
    const support = candidates.filter(
      (candidate) => candidate.reason === 'PREREQUISITE_SUPPORT' && candidate.targetObjectiveId === 'P3-FRA-003',
    );

    expect(support.map((candidate) => [candidate.objectiveId, candidate.mastery])).toEqual([
      ['P2-FRA-003', 'NOT_STARTED'],
      ['P3-FRA-001', 'DEVELOPING'],
    ]);
    expect(candidates.some((candidate) => candidate.objectiveId === 'P3-FRA-003')).toBe(false);
  });

  it('keeps a NEEDS_SUPPORT current target visible but not teachable when one prerequisite is developing', async () => {
    const repository = new MemoryLearningStateRepository();
    await repository.saveStudent(profile());
    await addMastered(repository, 'P2-FRA-003', 'p2-fra', 1);
    await repository.appendEvidence(record('p3-fra-dev', 'P3-FRA-001', 'correct_with_hint', 10));

    const candidates = await listLearningCandidates(repository, position());
    const support = candidates.find(
      (candidate) => candidate.reason === 'PREREQUISITE_SUPPORT' && candidate.objectiveId === 'P3-FRA-001',
    );
    const target = candidates.find(
      (candidate) => candidate.reason === 'CURRENT_POSITION' && candidate.objectiveId === 'P3-FRA-003',
    );

    expect(support).toMatchObject({
      targetObjectiveId: 'P3-FRA-003',
      mastery: 'DEVELOPING',
    });
    expect(target).toMatchObject({ readiness: 'NEEDS_SUPPORT', mastery: 'NOT_STARTED' });
    expect(target?.readiness).not.toBe('READY');
    expect(candidates.indexOf(support!)).toBeLessThan(candidates.indexOf(target!));
  });

  it('places reviewDue before forward READY learning without stopping forward progress', async () => {
    const repository = new MemoryLearningStateRepository();
    await repository.saveStudent(profile());
    await addMastered(repository, 'P2-FRA-003', 'p2-fra', 1);
    await addMastered(repository, 'P3-FRA-001', 'p3-fra', 10);
    await repository.appendEvidence(record('p3-fra-review', 'P3-FRA-001', 'incorrect', 20));

    const candidates = await listLearningCandidates(
      repository,
      position({ reviewObjectiveIds: ['P3-FRA-001'] }),
    );

    expect(candidates[0]).toMatchObject({
      objectiveId: 'P3-FRA-001',
      reason: 'REVIEW_DUE',
      mastery: 'MASTERED',
      reviewDue: true,
    });
    expect(candidates).toContainEqual(
      expect.objectContaining({
        objectiveId: 'P3-FRA-003',
        reason: 'CURRENT_POSITION',
        readiness: 'READY',
      }),
    );
  });

  it('selects only the first logical NEXT_IN_SEQUENCE target after a mastered anchor', async () => {
    const repository = new MemoryLearningStateRepository();
    await repository.saveStudent(profile());
    await addMastered(repository, 'P3-FRA-001', 'anchor', 1);
    await addMastered(repository, 'P2-MD-004', 'p2-md', 10);

    const candidates = await listLearningCandidates(
      repository,
      position({ anchorObjectiveId: 'P3-FRA-001', reviewObjectiveIds: [] }),
    );
    const next = candidates.filter((candidate) => candidate.reason === 'NEXT_IN_SEQUENCE');

    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ objectiveId: 'P3-FRA-002', readiness: 'READY' });
  });
});
