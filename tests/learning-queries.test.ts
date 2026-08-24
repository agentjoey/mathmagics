import { describe, expect, it } from 'vitest';
import {
  MemoryLearningStateRepository,
  getObjectiveMastery,
  getObjectiveReadiness,
  getStudent,
  getStudentLearningSummary,
  listTopicMastery,
} from '@/lib/learning';
import { getPrerequisites, listObjectivesForTopic, loadCurriculumDataset } from '@/lib/curriculum';
import type { EvidenceRecord, StudentProfile } from '@/lib/learning';

const student: StudentProfile = {
  id: 's1',
  displayName: 'Alex',
  levelId: 'P3',
  learningMode: 'STRUCTURED_HOME_LEARNING',
  sessionsPerWeek: 4,
  minutesPerSession: 30,
  createdAt: '2026-08-24T09:00:00.000Z',
  updatedAt: '2026-08-24T09:00:00.000Z',
};

function evidence(id: string, objectiveId: string, type: EvidenceRecord['type'] = 'introduced'): EvidenceRecord {
  return {
    id,
    studentId: student.id,
    objectiveId,
    type,
    observedAt: '2026-08-24T09:01:00.000Z',
    recordedAt: '2026-08-24T09:01:00.000Z',
    origin: { kind: 'LESSON', refId: 'lesson-1' },
  };
}

async function repositoryWithStudent(): Promise<MemoryLearningStateRepository> {
  const repository = new MemoryLearningStateRepository();
  await repository.saveStudent(student);
  return repository;
}

describe('learning state query API', () => {
  it('throws for an unknown student', async () => {
    const repository = new MemoryLearningStateRepository();
    await expect(getStudent(repository, 'missing')).rejects.toThrow('Unknown student id: missing');
  });

  it('fails closed for unknown objectives but returns NOT_STARTED for known objectives without evidence', async () => {
    const repository = await repositoryWithStudent();
    await expect(getObjectiveMastery(repository, student.id, 'NOPE')).rejects.toThrow(
      'Unknown learning objective id: NOPE',
    );
    await expect(getObjectiveMastery(repository, student.id, 'P3-FRA-001')).resolves.toMatchObject({
      objectiveId: 'P3-FRA-001',
      state: 'NOT_STARTED',
      evidenceCount: 0,
    });
  });

  it('lists topic mastery in deterministic curriculum sequence order', async () => {
    const repository = await repositoryWithStudent();
    const expected = listObjectivesForTopic('P3-FRACTIONS').map((objective) => objective.id);
    const snapshots = await listTopicMastery(repository, student.id, 'P3-FRACTIONS');
    expect(snapshots.map((snapshot) => snapshot.objectiveId)).toEqual(expected);
  });

  it('rejects topic mastery above the student active level', async () => {
    const repository = new MemoryLearningStateRepository();
    await repository.saveStudent({ ...student, id: 'p2', levelId: 'P2' });
    await expect(listTopicMastery(repository, 'p2', 'P3-FRACTIONS')).rejects.toThrow(
      'Topic P3-FRACTIONS is above student active level P2',
    );
  });

  it('uses real direct curriculum prerequisites for readiness', async () => {
    const repository = await repositoryWithStudent();
    const realPrerequisites = getPrerequisites('P3-FRA-003').map((objective) => objective.id);
    expect(realPrerequisites).toEqual(['P2-FRA-003', 'P3-FRA-001']);

    const readiness = await getObjectiveReadiness(repository, student.id, 'P3-FRA-003');
    expect(readiness.state).toBe('BLOCKED');
    expect(readiness.blockingPrerequisites.map((item) => item.objectiveId)).toEqual(realPrerequisites);
  });

  it('summarizes only objectives from the student active level', async () => {
    const repository = await repositoryWithStudent();
    await repository.appendEvidence(evidence('p2-remediation', 'P2-FRA-003'));
    await repository.appendEvidence(evidence('p3-introduced', 'P3-FRA-001'));

    const summary = await getStudentLearningSummary(repository, student.id);
    const dataset = loadCurriculumDataset();
    const activeLevelCount = dataset.objectives.filter((objective) => objective.levelId === 'P3').length;
    const counted = Object.values(summary.counts).reduce((sum, count) => sum + count, 0);

    expect(summary.levelId).toBe('P3');
    expect(counted).toBe(activeLevelCount);
    expect(summary.counts.INTRODUCED).toBe(1);
    expect(summary.reviewDueCount).toBe(0);
  });
});
