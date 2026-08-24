import { describe, expect, it } from 'vitest';
import * as learning from '@/lib/learning';
import {
  assertValidCurrentPosition,
  assertValidEvidenceRecord,
  assertValidStudentProfile,
} from '@/lib/learning';
import type {
  CurrentPositionAssumption,
  EvidenceRecord,
  MasterySnapshot,
  ObjectiveReadiness,
  StudentProfile,
} from '@/lib/learning';

const validP3Student: StudentProfile = {
  id: 'student-p3',
  displayName: 'Alex',
  levelId: 'P3',
  learningMode: 'STRUCTURED_HOME_LEARNING',
  sessionsPerWeek: 4,
  minutesPerSession: 30,
  createdAt: '2026-08-24T09:00:00.000Z',
  updatedAt: '2026-08-24T09:00:00.000Z',
};

const validP2Student: StudentProfile = {
  ...validP3Student,
  id: 'student-p2',
  levelId: 'P2',
};

function evidenceFor(objectiveId: string, studentId = validP3Student.id): EvidenceRecord {
  return {
    id: `e-${studentId}-${objectiveId}`,
    studentId,
    objectiveId,
    type: 'independent_correct',
    observedAt: '2026-08-24T09:01:00.000Z',
    recordedAt: '2026-08-24T09:01:00.000Z',
    origin: { kind: 'LESSON', refId: 'lesson-1' },
  };
}

describe('learning domain contracts', () => {
  it('exposes the learning domain module at runtime', () => {
    expect(learning).toBeDefined();
  });

  it('represents the approved Phase 2 domain values', () => {
    const position: CurrentPositionAssumption = {
      studentId: validP3Student.id,
      levelId: 'P3',
      objectiveId: 'P3-FRA-001',
      recordedAt: '2026-08-24T09:00:00.000Z',
      source: 'MANUAL_SETUP',
    };
    const evidence = evidenceFor('P3-FRA-001');
    const mastery: MasterySnapshot = {
      studentId: validP3Student.id,
      objectiveId: evidence.objectiveId,
      state: 'DEVELOPING',
      reviewDue: false,
      evidenceCount: 1,
      lastEvidenceAt: evidence.observedAt,
    };
    const readiness: ObjectiveReadiness = {
      studentId: validP3Student.id,
      objectiveId: 'P3-FRA-003',
      state: 'NEEDS_SUPPORT',
      ready: false,
      prerequisites: [],
      blockingPrerequisites: [],
    };

    expect([validP3Student.levelId, position.source, evidence.type, mastery.state, readiness.state]).toEqual([
      'P3',
      'MANUAL_SETUP',
      'independent_correct',
      'DEVELOPING',
      'NEEDS_SUPPORT',
    ]);
  });
});

describe('learning record validation', () => {
  it('accepts valid P2 and P3 student profiles', () => {
    expect(() => assertValidStudentProfile(validP2Student)).not.toThrow();
    expect(() => assertValidStudentProfile(validP3Student)).not.toThrow();
  });

  it('rejects invalid profile schedule fields and timestamp order', () => {
    expect(() => assertValidStudentProfile({ ...validP3Student, sessionsPerWeek: 0 })).toThrow(
      'sessionsPerWeek must be an integer from 1 through 7',
    );
    expect(() => assertValidStudentProfile({ ...validP3Student, minutesPerSession: 0 })).toThrow(
      'minutesPerSession must be a positive integer',
    );
    expect(() =>
      assertValidStudentProfile({
        ...validP3Student,
        createdAt: '2026-08-24T10:00:00.000Z',
        updatedAt: '2026-08-24T09:00:00.000Z',
      }),
    ).toThrow('updatedAt must not precede createdAt');
  });

  it('validates current position against the student active level and topic', () => {
    expect(() =>
      assertValidCurrentPosition(validP3Student, {
        studentId: validP3Student.id,
        levelId: 'P3',
        topicId: 'P3-FRACTIONS',
        objectiveId: 'P3-FRA-001',
        recordedAt: '2026-08-24T09:00:00.000Z',
        source: 'MANUAL_SETUP',
      }),
    ).not.toThrow();
  });

  it('rejects inconsistent or wrong-level current position', () => {
    expect(() =>
      assertValidCurrentPosition(validP3Student, {
        studentId: 'another-student',
        levelId: 'P3',
        objectiveId: 'P3-FRA-001',
        recordedAt: '2026-08-24T09:00:00.000Z',
        source: 'MANUAL_SETUP',
      }),
    ).toThrow('current position studentId must match student id');
    expect(() =>
      assertValidCurrentPosition(validP3Student, {
        studentId: validP3Student.id,
        levelId: 'P3',
        objectiveId: 'P2-FRA-003',
        recordedAt: '2026-08-24T09:00:00.000Z',
        source: 'MANUAL_SETUP',
      }),
    ).toThrow('current position objective must belong to student active level P3');
  });

  it('allows P3 remediation evidence for P2 but rejects P3 evidence for a P2 student', () => {
    expect(() => assertValidEvidenceRecord(validP3Student, evidenceFor('P2-FRA-003'))).not.toThrow();
    expect(() => assertValidEvidenceRecord(validP2Student, evidenceFor('P3-FRA-001', validP2Student.id))).toThrow(
      'cannot record P3 evidence for P2 student',
    );
  });

  it('rejects recordedAt before observedAt and empty origin refId', () => {
    expect(() =>
      assertValidEvidenceRecord(validP3Student, {
        ...evidenceFor('P3-FRA-001'),
        observedAt: '2026-08-24T10:00:00.000Z',
        recordedAt: '2026-08-24T09:00:00.000Z',
      }),
    ).toThrow('recordedAt must not precede observedAt');
    expect(() =>
      assertValidEvidenceRecord(validP3Student, {
        ...evidenceFor('P3-FRA-001'),
        origin: { kind: 'LESSON', refId: '' },
      }),
    ).toThrow('origin.refId must be non-empty when provided');
  });
});
