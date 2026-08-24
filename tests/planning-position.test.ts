import { describe, expect, it } from 'vitest';
import {
  MemoryLearningStateRepository,
  type EvidenceRecord,
  type StudentProfile,
} from '@/lib/learning';
import { loadCurriculumDataset } from '@/lib/curriculum';
import {
  deriveLearningPosition,
  listLevelObjectivesInCurriculumOrder,
} from '@/lib/planning';

const NOW = '2026-08-25T01:00:00.000Z';

function student(levelId: 'P2' | 'P3' = 'P3'): StudentProfile {
  return {
    id: `student-${levelId}`,
    displayName: 'Alex',
    levelId,
    learningMode: 'STRUCTURED_HOME_LEARNING',
    sessionsPerWeek: 4,
    minutesPerSession: 30,
    createdAt: '2026-08-24T09:00:00.000Z',
    updatedAt: '2026-08-24T09:00:00.000Z',
  };
}

function evidence(
  id: string,
  studentId: string,
  objectiveId: string,
  type: EvidenceRecord['type'],
  minute: number,
): EvidenceRecord {
  const timestamp = new Date(Date.parse('2026-08-24T09:00:00.000Z') + minute * 60_000).toISOString();
  return {
    id,
    studentId,
    objectiveId,
    type,
    observedAt: timestamp,
    recordedAt: timestamp,
    origin: { kind: 'LESSON', refId: 'lesson-fixture' },
  };
}

describe('real curriculum order', () => {
  it('returns the complete P2 and P3 objective inventories in hierarchy sequence', () => {
    const dataset = loadCurriculumDataset();
    const p2 = listLevelObjectivesInCurriculumOrder('P2', dataset);
    const p3 = listLevelObjectivesInCurriculumOrder('P3', dataset);

    expect(p2).toHaveLength(32);
    expect(p3).toHaveLength(36);
    expect(p2.every((objective) => objective.levelId === 'P2')).toBe(true);
    expect(p3.every((objective) => objective.levelId === 'P3')).toBe(true);

    const p3Ids = p3.map((objective) => objective.id);
    expect(p3Ids.indexOf('P3-FRA-001')).toBeLessThan(p3Ids.indexOf('P3-FRA-003'));

    for (const topic of dataset.nodes.filter((node) => node.type === 'topic')) {
      const orderedForTopic = [...dataset.objectives]
        .filter((objective) => objective.topicId === topic.id)
        .sort((left, right) => left.sequence - right.sequence)
        .map((objective) => objective.id);
      const actualForTopic = [...p2, ...p3]
        .filter((objective) => objective.topicId === topic.id)
        .map((objective) => objective.id);
      expect(actualForTopic).toEqual(orderedForTopic);
    }
  });
});

describe('LearningPosition derivation', () => {
  it('uses an objective current-position assumption as the forward anchor', async () => {
    const repository = new MemoryLearningStateRepository();
    const profile = student('P3');
    await repository.saveStudent(profile);
    await repository.setCurrentPosition({
      studentId: profile.id,
      levelId: 'P3',
      objectiveId: 'P3-FRA-003',
      recordedAt: '2026-08-24T09:00:00.000Z',
      source: 'MANUAL_SETUP',
    });

    await expect(deriveLearningPosition(repository, profile.id, NOW)).resolves.toEqual({
      studentId: profile.id,
      levelId: 'P3',
      anchorTopicId: 'P3-FRACTIONS',
      anchorObjectiveId: 'P3-FRA-003',
      reviewObjectiveIds: [],
      derivedAt: NOW,
    });
  });

  it('uses the first objective in a topic when only a topic anchor is provided', async () => {
    const repository = new MemoryLearningStateRepository();
    const profile = student('P3');
    await repository.saveStudent(profile);
    await repository.setCurrentPosition({
      studentId: profile.id,
      levelId: 'P3',
      topicId: 'P3-FRACTIONS',
      recordedAt: '2026-08-24T09:00:00.000Z',
      source: 'MANUAL_SETUP',
    });

    const position = await deriveLearningPosition(repository, profile.id, NOW);
    expect(position.anchorTopicId).toBe('P3-FRACTIONS');
    expect(position.anchorObjectiveId).toBe('P3-FRA-001');
  });

  it('falls back to the first active-level objective when no manual position exists', async () => {
    const repository = new MemoryLearningStateRepository();
    const profile = student('P2');
    await repository.saveStudent(profile);
    const first = listLevelObjectivesInCurriculumOrder('P2')[0]!;

    const position = await deriveLearningPosition(repository, profile.id, NOW);
    expect(position.anchorObjectiveId).toBe(first.id);
    expect(position.anchorTopicId).toBe(first.topicId);
  });

  it('collects only actual mastered reviewDue evidence and does not invent pre-anchor gaps', async () => {
    const repository = new MemoryLearningStateRepository();
    const profile = student('P3');
    await repository.saveStudent(profile);
    await repository.setCurrentPosition({
      studentId: profile.id,
      levelId: 'P3',
      objectiveId: 'P3-FRA-003',
      recordedAt: '2026-08-24T09:00:00.000Z',
      source: 'MANUAL_SETUP',
    });

    await repository.appendEvidence(evidence('e1', profile.id, 'P3-FRA-001', 'independent_correct', 1));
    await repository.appendEvidence(evidence('e2', profile.id, 'P3-FRA-001', 'explained_independently', 2));
    await repository.appendEvidence(evidence('e3', profile.id, 'P3-FRA-001', 'application_correct', 3));
    await repository.appendEvidence(evidence('e4', profile.id, 'P3-FRA-001', 'incorrect', 4));

    const position = await deriveLearningPosition(repository, profile.id, NOW);
    expect(position.anchorObjectiveId).toBe('P3-FRA-003');
    expect(position.reviewObjectiveIds).toEqual(['P3-FRA-001']);
    expect(position.reviewObjectiveIds).not.toContain('P3-FRA-002');
  });

  it('fails closed when a repository returns an anchor above the student active level', async () => {
    const repository = new MemoryLearningStateRepository();
    const profile = student('P2');
    await repository.saveStudent(profile);
    repository.getCurrentPosition = async () => ({
      studentId: profile.id,
      levelId: 'P2',
      objectiveId: 'P3-FRA-001',
      recordedAt: '2026-08-24T09:00:00.000Z',
      source: 'MANUAL_SETUP',
    });

    await expect(deriveLearningPosition(repository, profile.id, NOW)).rejects.toThrow(
      'current position objective must belong to student active level P2',
    );
  });
});
