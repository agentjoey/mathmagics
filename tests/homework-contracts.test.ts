import { describe, expect, it } from 'vitest';
import {
  validateHomeworkImageMetadata,
  validateHomeworkVisionResult,
} from '@/lib/homework';
import type {
  HomeworkProblemExtraction,
  HomeworkVisionResult,
} from '@/lib/homework';

const region = { x: 0.1, y: 0.2, width: 0.3, height: 0.2 };

const problem: HomeworkProblemExtraction = {
  id: 'hp-1',
  submissionId: 'hs-1',
  studentId: 's1',
  sequence: 1,
  question: { value: '7 × 8 = ?', confidence: 0.99, region },
  answer: { value: '56', confidence: 0.99, region: { x: 0.7, y: 0.2, width: 0.1, height: 0.1 } },
  structured: {
    family: 'ARITHMETIC',
    fields: {
      operation: { value: 'MULTIPLY', confidence: 0.99, region },
      left: { value: '7', confidence: 0.99, region },
      right: { value: '8', confidence: 0.99, region },
    },
  },
  provider: 'fixture',
  model: 'fixture-v1',
  schemaVersion: 'homework-vision-v1',
  createdAt: '2026-08-25T00:00:00.000Z',
};

const result: HomeworkVisionResult = {
  submissionId: 'hs-1',
  studentId: 's1',
  provider: 'fixture',
  model: 'fixture-v1',
  schemaVersion: 'homework-vision-v1',
  problems: [problem],
};

describe('homework contracts', () => {
  it('accepts supported image metadata at the 10 MiB boundary', () => {
    expect(() => validateHomeworkImageMetadata({
      mimeType: 'image/jpeg',
      byteLength: 10 * 1024 * 1024,
      sha256: 'a'.repeat(64),
    })).not.toThrow();
  });

  it('rejects unsupported MIME, invalid byte lengths, and malformed hashes', () => {
    expect(() => validateHomeworkImageMetadata({
      mimeType: 'image/gif' as 'image/jpeg', byteLength: 1, sha256: 'a'.repeat(64),
    })).toThrow('homework image mimeType must be jpeg, png, or webp');
    expect(() => validateHomeworkImageMetadata({
      mimeType: 'image/png', byteLength: 0, sha256: 'a'.repeat(64),
    })).toThrow('homework image byteLength must be between 1 and 10485760');
    expect(() => validateHomeworkImageMetadata({
      mimeType: 'image/webp', byteLength: 10 * 1024 * 1024 + 1, sha256: 'a'.repeat(64),
    })).toThrow('homework image byteLength must be between 1 and 10485760');
    expect(() => validateHomeworkImageMetadata({
      mimeType: 'image/jpeg', byteLength: 10, sha256: 'ABC',
    })).toThrow('homework image sha256 must be lowercase 64-hex');
  });

  it('rejects invalid confidence and normalized source regions', () => {
    expect(() => validateHomeworkVisionResult({
      ...result,
      problems: [{ ...problem, question: { ...problem.question, confidence: 1.01 } }],
    })).toThrow('homework extraction confidence must be finite within [0, 1]');

    expect(() => validateHomeworkVisionResult({
      ...result,
      problems: [{ ...problem, question: { ...problem.question, confidence: Number.NaN } }],
    })).toThrow('homework extraction confidence must be finite within [0, 1]');

    expect(() => validateHomeworkVisionResult({
      ...result,
      problems: [{ ...problem, question: { ...problem.question, region: { x: -0.1, y: 0, width: 0.2, height: 0.2 } } }],
    })).toThrow('homework source region must be contained within [0, 1]');

    expect(() => validateHomeworkVisionResult({
      ...result,
      problems: [{ ...problem, question: { ...problem.question, region: { x: 0.9, y: 0, width: 0.2, height: 0.2 } } }],
    })).toThrow('homework source region must be contained within [0, 1]');
  });

  it('requires stable submission/student coordinates and unique positive sequence', () => {
    expect(() => validateHomeworkVisionResult({
      ...result,
      problems: [{ ...problem, studentId: 's2' }],
    })).toThrow('homework problem coordinates must match vision result');

    expect(() => validateHomeworkVisionResult({
      ...result,
      problems: [{ ...problem, sequence: 0 }],
    })).toThrow('homework problem sequence must be a positive integer');

    expect(() => validateHomeworkVisionResult({
      ...result,
      problems: [problem, { ...problem, id: 'hp-2' }],
    })).toThrow('homework problem sequences must be unique');
  });

  it('rejects invalid extraction timestamps', () => {
    expect(() => validateHomeworkVisionResult({
      ...result,
      problems: [{ ...problem, createdAt: 'not-a-time' }],
    })).toThrow('homework problem createdAt must be a valid ISO date-time string');
  });
});
