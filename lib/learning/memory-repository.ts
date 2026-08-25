import type { LearningStateRepository } from './repository';
import type { CurrentPositionAssumption, EvidenceRecord, StudentProfile } from './types';
import { assertValidCurrentPosition, assertValidEvidenceRecord, assertValidStudentProfile } from './validation';

function cloneStudent(student: StudentProfile): StudentProfile {
  return { ...student };
}

function clonePosition(position: CurrentPositionAssumption): CurrentPositionAssumption {
  return { ...position };
}

function cloneEvidence(record: EvidenceRecord): EvidenceRecord {
  return { ...record, origin: { ...record.origin } };
}

export class MemoryLearningStateRepository implements LearningStateRepository {
  private readonly students = new Map<string, StudentProfile>();
  private readonly positions = new Map<string, CurrentPositionAssumption>();
  private readonly evidence: EvidenceRecord[] = [];
  private readonly evidenceIds = new Set<string>();

  async getStudent(studentId: string): Promise<StudentProfile | undefined> {
    const student = this.students.get(studentId);
    return student ? cloneStudent(student) : undefined;
  }

  async saveStudent(student: StudentProfile): Promise<void> {
    assertValidStudentProfile(student);
    this.students.set(student.id, cloneStudent(student));
  }

  async getCurrentPosition(studentId: string): Promise<CurrentPositionAssumption | undefined> {
    const position = this.positions.get(studentId);
    return position ? clonePosition(position) : undefined;
  }

  async setCurrentPosition(position: CurrentPositionAssumption): Promise<void> {
    const student = this.students.get(position.studentId);
    if (!student) throw new Error(`Unknown student id: ${position.studentId}`);
    assertValidCurrentPosition(student, position);
    this.positions.set(position.studentId, clonePosition(position));
  }

  async getEvidence(evidenceId: string): Promise<EvidenceRecord | undefined> {
    const record = this.evidence.find((candidate) => candidate.id === evidenceId);
    return record ? cloneEvidence(record) : undefined;
  }

  async appendEvidence(record: EvidenceRecord): Promise<void> {
    if (this.evidenceIds.has(record.id)) throw new Error(`Duplicate evidence id: ${record.id}`);
    const student = this.students.get(record.studentId);
    if (!student) throw new Error(`Unknown student id: ${record.studentId}`);
    assertValidEvidenceRecord(student, record);
    this.evidence.push(cloneEvidence(record));
    this.evidenceIds.add(record.id);
  }

  async listEvidenceForStudent(studentId: string): Promise<EvidenceRecord[]> {
    return this.evidence.filter((record) => record.studentId === studentId).map(cloneEvidence);
  }

  async listEvidenceForObjective(studentId: string, objectiveId: string): Promise<EvidenceRecord[]> {
    return this.evidence
      .filter((record) => record.studentId === studentId && record.objectiveId === objectiveId)
      .map(cloneEvidence);
  }
}
