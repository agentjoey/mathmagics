export type HomeworkMimeType = 'image/jpeg' | 'image/png' | 'image/webp';
export type HomeworkTrustState = 'CONFIRMED' | 'NEEDS_CONFIRMATION' | 'UNSUPPORTED';

export interface HomeworkImageMetadata {
  mimeType: HomeworkMimeType;
  byteLength: number;
  sha256: string;
}

export interface SourceRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExtractedField<T> {
  value: T;
  confidence: number;
  region: SourceRegion;
}

export interface ExtractedMathCandidate {
  family: string;
  fields: Record<string, ExtractedField<string>>;
}

export interface HomeworkSubmission {
  id: string;
  studentId: string;
  sourceSha256: string;
  mimeType: HomeworkMimeType;
  byteLength: number;
  provider: string;
  model: string;
  schemaVersion: 'homework-vision-v1';
  createdAt: string;
}

export interface HomeworkProblemExtraction {
  id: string;
  submissionId: string;
  studentId: string;
  sequence: number;
  question: ExtractedField<string>;
  answer?: ExtractedField<string>;
  structured: ExtractedMathCandidate;
  provider: string;
  model: string;
  schemaVersion: 'homework-vision-v1';
  createdAt: string;
}

export interface HomeworkVisionResult {
  submissionId: string;
  studentId: string;
  provider: string;
  model: string;
  schemaVersion: 'homework-vision-v1';
  problems: HomeworkProblemExtraction[];
}

export interface HomeworkConfirmation {
  id: string;
  problemId: string;
  studentId: string;
  corrections: Record<string, string>;
  confirmerRole: 'STUDENT' | 'PARENT';
  policyVersion: 'homework-confidence-v1';
  confirmedAt: string;
}

export interface EffectiveHomeworkObservation extends HomeworkProblemExtraction {}

export interface HomeworkTrustEvaluation {
  conversionSupported: boolean;
  objectiveCandidateCount: number;
}
