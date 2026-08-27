import { and, asc, eq } from 'drizzle-orm';
import {
  assertValidCurrentPosition,
  assertValidEvidenceRecord,
  assertValidStudentProfile,
} from '@/lib/learning';
import type {
  CurrentPositionAssumption,
  EvidenceOriginKind,
  EvidenceRecord,
  EvidenceType,
  LearningMode,
  LearningStateRepository,
  StudentLevel,
  StudentProfile,
} from '@/lib/learning';
import { createNeonDatabase } from './db';
import type { MathMagicsDatabase } from './db';
import { canonicalInstant } from './instant';
import { currentPositions, evidenceRecords, students } from './schema';

function toStudent(row: typeof students.$inferSelect): StudentProfile {
  return {
    id: row.id,
    displayName: row.displayName,
    levelId: row.levelId as StudentLevel,
    learningMode: row.learningMode as LearningMode,
    sessionsPerWeek: row.sessionsPerWeek,
    minutesPerSession: row.minutesPerSession,
    createdAt: canonicalInstant(row.createdAt),
    updatedAt: canonicalInstant(row.updatedAt),
  };
}

function toPosition(row: typeof currentPositions.$inferSelect): CurrentPositionAssumption {
  return {
    studentId: row.studentId,
    levelId: row.levelId as StudentLevel,
    topicId: row.topicId ?? undefined,
    objectiveId: row.objectiveId ?? undefined,
    recordedAt: canonicalInstant(row.recordedAt),
    source: 'MANUAL_SETUP',
  };
}

function toEvidence(row: typeof evidenceRecords.$inferSelect): EvidenceRecord {
  return {
    id: row.id,
    studentId: row.studentId,
    objectiveId: row.objectiveId,
    type: row.type as EvidenceType,
    observedAt: canonicalInstant(row.observedAt),
    recordedAt: canonicalInstant(row.recordedAt),
    origin: {
      kind: row.originKind as EvidenceOriginKind,
      refId: row.originRefId ?? undefined,
    },
  };
}

export class NeonLearningStateRepository implements LearningStateRepository {
  constructor(private readonly db: MathMagicsDatabase = createNeonDatabase()) {}

  async getStudent(studentId: string): Promise<StudentProfile | undefined> {
    const [row] = await this.db.select().from(students).where(eq(students.id, studentId)).limit(1);
    return row ? toStudent(row) : undefined;
  }

  async saveStudent(student: StudentProfile): Promise<void> {
    assertValidStudentProfile(student);
    await this.db.insert(students).values(student).onConflictDoUpdate({
      target: students.id,
      set: {
        displayName: student.displayName,
        levelId: student.levelId,
        learningMode: student.learningMode,
        sessionsPerWeek: student.sessionsPerWeek,
        minutesPerSession: student.minutesPerSession,
        createdAt: student.createdAt,
        updatedAt: student.updatedAt,
      },
    });
  }

  async getCurrentPosition(studentId: string): Promise<CurrentPositionAssumption | undefined> {
    const [row] = await this.db.select().from(currentPositions)
      .where(eq(currentPositions.studentId, studentId)).limit(1);
    return row ? toPosition(row) : undefined;
  }

  async setCurrentPosition(position: CurrentPositionAssumption): Promise<void> {
    const student = await this.getStudent(position.studentId);
    if (!student) throw new Error(`Unknown student id: ${position.studentId}`);
    assertValidCurrentPosition(student, position);
    await this.db.insert(currentPositions).values({
      studentId: position.studentId,
      levelId: position.levelId,
      topicId: position.topicId,
      objectiveId: position.objectiveId,
      recordedAt: position.recordedAt,
      source: position.source,
    }).onConflictDoUpdate({
      target: currentPositions.studentId,
      set: {
        levelId: position.levelId,
        topicId: position.topicId,
        objectiveId: position.objectiveId,
        recordedAt: position.recordedAt,
        source: position.source,
      },
    });
  }

  async getEvidence(evidenceId: string): Promise<EvidenceRecord | undefined> {
    const [row] = await this.db.select().from(evidenceRecords)
      .where(eq(evidenceRecords.id, evidenceId)).limit(1);
    if (!row) return undefined;
    const record = toEvidence(row);
    const student = await this.getStudent(record.studentId);
    if (!student) throw new Error(`Unknown student id: ${record.studentId}`);
    assertValidEvidenceRecord(student, record);
    return record;
  }

  async appendEvidence(record: EvidenceRecord): Promise<void> {
    const [existing] = await this.db.select({ id: evidenceRecords.id }).from(evidenceRecords)
      .where(eq(evidenceRecords.id, record.id)).limit(1);
    if (existing) throw new Error(`Duplicate evidence id: ${record.id}`);
    const student = await this.getStudent(record.studentId);
    if (!student) throw new Error(`Unknown student id: ${record.studentId}`);
    assertValidEvidenceRecord(student, record);
    await this.db.insert(evidenceRecords).values({
      id: record.id,
      studentId: record.studentId,
      objectiveId: record.objectiveId,
      type: record.type,
      observedAt: record.observedAt,
      recordedAt: record.recordedAt,
      originKind: record.origin.kind,
      originRefId: record.origin.refId,
    });
  }

  async listEvidenceForStudent(studentId: string): Promise<EvidenceRecord[]> {
    const rows = await this.db.select().from(evidenceRecords)
      .where(eq(evidenceRecords.studentId, studentId))
      .orderBy(asc(evidenceRecords.observedAt), asc(evidenceRecords.recordedAt), asc(evidenceRecords.id));
    return rows.map(toEvidence);
  }

  async listEvidenceForObjective(studentId: string, objectiveId: string): Promise<EvidenceRecord[]> {
    const rows = await this.db.select().from(evidenceRecords)
      .where(and(eq(evidenceRecords.studentId, studentId), eq(evidenceRecords.objectiveId, objectiveId)))
      .orderBy(asc(evidenceRecords.observedAt), asc(evidenceRecords.recordedAt), asc(evidenceRecords.id));
    return rows.map(toEvidence);
  }
}
