import { describe, expect, it } from 'vitest';
import { MemoryLearningStateRepository } from '@/lib/learning';
import type { CurrentPositionAssumption, EvidenceRecord, StudentProfile } from '@/lib/learning';

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

const position: CurrentPositionAssumption = {
  studentId: student.id,
  levelId: 'P3',
  topicId: 'P3-FRACTIONS',
  objectiveId: 'P3-FRA-001',
  recordedAt: '2026-08-24T09:00:00.000Z',
  source: 'MANUAL_SETUP',
};

function evidence(id: string, objectiveId = 'P3-FRA-001'): EvidenceRecord {
  return {
    id,
    studentId: student.id,
    objectiveId,
    type: 'independent_correct',
    observedAt: '2026-08-24T09:01:00.000Z',
    recordedAt: '2026-08-24T09:01:00.000Z',
    origin: { kind: 'LESSON', refId: 'lesson-1' },
  };
}

describe('MemoryLearningStateRepository', () => {
  it('saves and gets a student, replacing the same id after validation', async () => {
    const repository = new MemoryLearningStateRepository();
    await repository.saveStudent(student);
    expect(await repository.getStudent(student.id)).toEqual(student);

    await repository.saveStudent({ ...student, displayName: 'Alex Updated', updatedAt: '2026-08-24T10:00:00.000Z' });
    expect((await repository.getStudent(student.id))?.displayName).toBe('Alex Updated');
  });

  it('requires a student before setting current position and then returns it', async () => {
    const repository = new MemoryLearningStateRepository();
    await expect(repository.setCurrentPosition(position)).rejects.toThrow('Unknown student id: s1');
    await repository.saveStudent(student);
    await repository.setCurrentPosition(position);
    expect(await repository.getCurrentPosition(student.id)).toEqual(position);
  });

  it('appends, gets, and lists evidence by student and objective', async () => {
    const repository = new MemoryLearningStateRepository();
    await repository.saveStudent(student);
    await repository.appendEvidence(evidence('e1'));
    await repository.appendEvidence(evidence('e2', 'P2-FRA-003'));

    expect(await repository.getEvidence('e1')).toEqual(evidence('e1'));
    expect(await repository.getEvidence('missing')).toBeUndefined();
    expect((await repository.listEvidenceForStudent(student.id)).map((item) => item.id)).toEqual(['e1', 'e2']);
    expect((await repository.listEvidenceForObjective(student.id, 'P2-FRA-003')).map((item) => item.id)).toEqual(['e2']);
  });

  it('rejects duplicate evidence ids globally even when the objective differs', async () => {
    const repository = new MemoryLearningStateRepository();
    await repository.saveStudent(student);
    await repository.appendEvidence(evidence('duplicate'));
    await expect(repository.appendEvidence(evidence('duplicate', 'P2-FRA-003'))).rejects.toThrow(
      'Duplicate evidence id: duplicate',
    );
  });

  it('enforces cross-level evidence validation through the repository boundary', async () => {
    const repository = new MemoryLearningStateRepository();
    const p2Student: StudentProfile = { ...student, id: 's2', levelId: 'P2' };
    await repository.saveStudent(p2Student);
    await expect(
      repository.appendEvidence({ ...evidence('e-p3'), studentId: p2Student.id, objectiveId: 'P3-FRA-001' }),
    ).rejects.toThrow('cannot record P3 evidence for P2 student');
  });

  it('returns defensive copies of students and current positions', async () => {
    const repository = new MemoryLearningStateRepository();
    await repository.saveStudent(student);
    await repository.setCurrentPosition(position);

    const returnedStudent = await repository.getStudent(student.id);
    const returnedPosition = await repository.getCurrentPosition(student.id);
    if (!returnedStudent || !returnedPosition) throw new Error('fixture missing');
    returnedStudent.displayName = 'tampered';
    returnedPosition.objectiveId = 'tampered';

    expect((await repository.getStudent(student.id))?.displayName).toBe('Alex');
    expect((await repository.getCurrentPosition(student.id))?.objectiveId).toBe('P3-FRA-001');
  });

  it('returns defensive copies of nested evidence origin data', async () => {
    const repository = new MemoryLearningStateRepository();
    await repository.saveStudent(student);
    await repository.appendEvidence(evidence('e1'));

    const returned = await repository.getEvidence('e1');
    if (!returned) throw new Error('fixture missing');
    returned.origin.refId = 'tampered';
    expect((await repository.getEvidence('e1'))?.origin.refId).toBe('lesson-1');
  });
});
