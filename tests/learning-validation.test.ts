import { describe, expect, it } from 'vitest';
import * as learning from '@/lib/learning';
import type {
  CurrentPositionAssumption,
  EvidenceRecord,
  MasterySnapshot,
  ObjectiveReadiness,
  StudentProfile,
} from '@/lib/learning';

describe('learning domain contracts', () => {
  it('exposes the learning domain module at runtime', () => {
    expect(learning).toBeDefined();
  });

  it('represent the approved Phase 2 domain values', () => {
    const student: StudentProfile = {
      id: 'student-1',
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
      objectiveId: 'P3-FRA-001',
      recordedAt: '2026-08-24T09:00:00.000Z',
      source: 'MANUAL_SETUP',
    };
    const evidence: EvidenceRecord = {
      id: 'e-1',
      studentId: student.id,
      objectiveId: 'P3-FRA-001',
      type: 'independent_correct',
      observedAt: '2026-08-24T09:01:00.000Z',
      recordedAt: '2026-08-24T09:01:00.000Z',
      origin: { kind: 'LESSON', refId: 'lesson-1' },
    };
    const mastery: MasterySnapshot = {
      studentId: student.id,
      objectiveId: evidence.objectiveId,
      state: 'DEVELOPING',
      reviewDue: false,
      evidenceCount: 1,
      lastEvidenceAt: evidence.observedAt,
    };
    const readiness: ObjectiveReadiness = {
      studentId: student.id,
      objectiveId: 'P3-FRA-003',
      state: 'NEEDS_SUPPORT',
      ready: false,
      prerequisites: [],
      blockingPrerequisites: [],
    };

    expect([student.levelId, position.source, evidence.type, mastery.state, readiness.state]).toEqual([
      'P3',
      'MANUAL_SETUP',
      'independent_correct',
      'DEVELOPING',
      'NEEDS_SUPPORT',
    ]);
  });
});
