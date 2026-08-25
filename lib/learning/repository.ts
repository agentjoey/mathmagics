import type { CurrentPositionAssumption, EvidenceRecord, StudentProfile } from './types';

export interface LearningStateRepository {
  getStudent(studentId: string): Promise<StudentProfile | undefined>;
  saveStudent(student: StudentProfile): Promise<void>;

  getCurrentPosition(studentId: string): Promise<CurrentPositionAssumption | undefined>;
  setCurrentPosition(position: CurrentPositionAssumption): Promise<void>;

  getEvidence(evidenceId: string): Promise<EvidenceRecord | undefined>;
  appendEvidence(record: EvidenceRecord): Promise<void>;
  listEvidenceForStudent(studentId: string): Promise<EvidenceRecord[]>;
  listEvidenceForObjective(studentId: string, objectiveId: string): Promise<EvidenceRecord[]>;
}
