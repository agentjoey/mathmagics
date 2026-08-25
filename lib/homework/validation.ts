import type {
  ExtractedField,
  HomeworkImageMetadata,
  HomeworkProblemExtraction,
  HomeworkVisionResult,
  SourceRegion,
} from './types';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function requireNonEmpty(value: string, field: string): void {
  if (!value.trim()) throw new Error(`${field} must be non-empty`);
}

function requireTimestamp(value: string, field: string): void {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new Error(`${field} must be a valid ISO date-time string`);
  }
}

function validateRegion(region: SourceRegion): void {
  const values = [region.x, region.y, region.width, region.height];
  const finite = values.every(Number.isFinite);
  const nonNegative = values.every((value) => value >= 0);
  const contained = region.x <= 1
    && region.y <= 1
    && region.x + region.width <= 1
    && region.y + region.height <= 1;
  if (!finite || !nonNegative || !contained) {
    throw new Error('homework source region must be contained within [0, 1]');
  }
}

function validateField(field: ExtractedField<string>): void {
  if (!Number.isFinite(field.confidence) || field.confidence < 0 || field.confidence > 1) {
    throw new Error('homework extraction confidence must be finite within [0, 1]');
  }
  validateRegion(field.region);
}

function validateProblem(problem: HomeworkProblemExtraction): void {
  requireNonEmpty(problem.id, 'homework problem id');
  requireNonEmpty(problem.submissionId, 'homework problem submissionId');
  requireNonEmpty(problem.studentId, 'homework problem studentId');
  if (!Number.isInteger(problem.sequence) || problem.sequence <= 0) {
    throw new Error('homework problem sequence must be a positive integer');
  }
  validateField(problem.question);
  if (problem.answer) validateField(problem.answer);
  requireNonEmpty(problem.structured.family, 'homework structured family');
  for (const field of Object.values(problem.structured.fields)) validateField(field);
  requireNonEmpty(problem.provider, 'homework problem provider');
  requireNonEmpty(problem.model, 'homework problem model');
  if (problem.schemaVersion !== 'homework-vision-v1') {
    throw new Error('homework problem schemaVersion must be homework-vision-v1');
  }
  requireTimestamp(problem.createdAt, 'homework problem createdAt');
}

export function validateHomeworkImageMetadata(input: HomeworkImageMetadata): void {
  if (!MIME_TYPES.has(input.mimeType)) {
    throw new Error('homework image mimeType must be jpeg, png, or webp');
  }
  if (!Number.isInteger(input.byteLength) || input.byteLength < 1 || input.byteLength > MAX_IMAGE_BYTES) {
    throw new Error('homework image byteLength must be between 1 and 10485760');
  }
  if (!/^[0-9a-f]{64}$/u.test(input.sha256)) {
    throw new Error('homework image sha256 must be lowercase 64-hex');
  }
}

export function validateHomeworkVisionResult(result: HomeworkVisionResult): void {
  requireNonEmpty(result.submissionId, 'homework vision submissionId');
  requireNonEmpty(result.studentId, 'homework vision studentId');
  requireNonEmpty(result.provider, 'homework vision provider');
  requireNonEmpty(result.model, 'homework vision model');
  if (result.schemaVersion !== 'homework-vision-v1') {
    throw new Error('homework vision schemaVersion must be homework-vision-v1');
  }

  const sequences = new Set<number>();
  for (const problem of result.problems) {
    validateProblem(problem);
    if (problem.submissionId !== result.submissionId || problem.studentId !== result.studentId) {
      throw new Error('homework problem coordinates must match vision result');
    }
    if (problem.provider !== result.provider || problem.model !== result.model || problem.schemaVersion !== result.schemaVersion) {
      throw new Error('homework problem provider metadata must match vision result');
    }
    if (sequences.has(problem.sequence)) {
      throw new Error('homework problem sequences must be unique');
    }
    sequences.add(problem.sequence);
  }
}
