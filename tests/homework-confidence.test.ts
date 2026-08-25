import { describe, expect, it } from 'vitest';
import {
  deriveEffectiveHomeworkObservation,
  deriveHomeworkTrustState,
} from '@/lib/homework';
import type {
  HomeworkConfirmation,
  HomeworkProblemExtraction,
} from '@/lib/homework';

const region = { x: 0.1, y: 0.1, width: 0.2, height: 0.1 };

function extraction(answerConfidence = 0.99): HomeworkProblemExtraction {
  return {
    id: 'hp-1', submissionId: 'hs-1', studentId: 's1', sequence: 1,
    question: { value: '7 × 8 = ?', confidence: 0.99, region },
    answer: { value: '56', confidence: answerConfidence, region },
    structured: {
      family: 'ARITHMETIC',
      fields: {
        operation: { value: 'MULTIPLY', confidence: 0.99, region },
        left: { value: '7', confidence: 0.99, region },
        right: { value: '8', confidence: 0.99, region },
      },
    },
    provider: 'fixture', model: 'fixture-v1', schemaVersion: 'homework-vision-v1',
    createdAt: '2026-08-25T00:00:00.000Z',
  };
}

const confirmation: HomeworkConfirmation = {
  id: 'hc-1',
  problemId: 'hp-1',
  studentId: 's1',
  corrections: { answer: '56' },
  confirmerRole: 'PARENT',
  policyVersion: 'homework-confidence-v1',
  confirmedAt: '2026-08-25T00:01:00.000Z',
};

describe('homework confidence policy', () => {
  it('confirms only high-confidence critical observations with one supported mapping', () => {
    const effective = deriveEffectiveHomeworkObservation(extraction(), []);
    expect(deriveHomeworkTrustState(effective, {
      conversionSupported: true,
      objectiveCandidateCount: 1,
    })).toBe('CONFIRMED');
  });

  it('requires confirmation when the answer or a structural field is below 0.98', () => {
    const lowAnswer = deriveEffectiveHomeworkObservation(extraction(0.9799), []);
    expect(deriveHomeworkTrustState(lowAnswer, {
      conversionSupported: true, objectiveCandidateCount: 1,
    })).toBe('NEEDS_CONFIRMATION');

    const base = extraction();
    const lowStructure: HomeworkProblemExtraction = {
      ...base,
      structured: {
        ...base.structured,
        fields: {
          ...base.structured.fields,
          left: { ...base.structured.fields.left!, confidence: 0.97 },
        },
      },
    };
    expect(deriveHomeworkTrustState(deriveEffectiveHomeworkObservation(lowStructure, []), {
      conversionSupported: true, objectiveCandidateCount: 1,
    })).toBe('NEEDS_CONFIRMATION');
  });

  it('fails closed when deterministic conversion or objective mapping is unsupported', () => {
    const effective = deriveEffectiveHomeworkObservation(extraction(), []);
    expect(deriveHomeworkTrustState(effective, {
      conversionSupported: false, objectiveCandidateCount: 0,
    })).toBe('UNSUPPORTED');
    expect(deriveHomeworkTrustState(effective, {
      conversionSupported: true, objectiveCandidateCount: 2,
    })).toBe('UNSUPPORTED');
  });

  it('lets an append-only confirmation replace an observed answer without granting authority fields', () => {
    const effective = deriveEffectiveHomeworkObservation(extraction(0.4), [confirmation]);
    expect(effective.answer?.value).toBe('56');
    expect(effective.answer?.confidence).toBe(1);
    expect(deriveHomeworkTrustState(effective, {
      conversionSupported: true, objectiveCandidateCount: 1,
    })).toBe('CONFIRMED');
  });

  it('applies confirmations deterministically by confirmedAt then id', () => {
    const effective = deriveEffectiveHomeworkObservation(extraction(0.4), [
      { ...confirmation, id: 'hc-z', corrections: { answer: '55' }, confirmedAt: '2026-08-25T00:02:00.000Z' },
      { ...confirmation, id: 'hc-a', corrections: { answer: '54' }, confirmedAt: '2026-08-25T00:02:00.000Z' },
    ]);
    expect(effective.answer?.value).toBe('55');
  });

  it('rejects confirmation attempts to smuggle authority fields', () => {
    expect(() => deriveEffectiveHomeworkObservation(extraction(0.4), [{
      ...confirmation,
      corrections: { objectiveId: 'P2-MD-001' },
    }])).toThrow('homework confirmation correction field is not allowed');
  });
});
