import { describe, expect, test } from 'vitest';
import type { LLMRequest } from '@/lib/types';
import type { TrustedCorrectionContext } from '@/lib/providers/correction';
import {
  MiniMaxCorrectionProvider,
  type CorrectionLLMCall,
} from '@/lib/providers/minimax-correction';

const diagnosisContext = {
  objectiveId: 'P3-FRA-003',
  allowedTargets: [
    { kind: 'MISCONCEPTION' as const, misconceptionId: 'MIS-FRA-DENOMINATOR-SIZE' },
    { kind: 'GENERIC' as const, code: 'UNKNOWN' as const },
  ],
  problemDescription: 'Fill in <, >, or = : 1/8 ? 1/4',
  studentAnswer: '>',
  deterministicObservations: ['student reversed a unit-fraction comparison'],
};

const guidanceContext: TrustedCorrectionContext = {
  mistakeId: 'mistake-1',
  objectiveId: 'P3-FRA-003',
  diagnosisTarget: { kind: 'MISCONCEPTION', misconceptionId: 'MIS-FRA-DENOMINATOR-SIZE' },
  problem: {
    attempt: {
      id: 'attempt-1', source: { kind: 'PRACTICE', sessionId: 'session-1', itemId: 'item-1' },
      studentId: 'student-1', objectiveId: 'P3-FRA-003', answerText: '>', outcome: 'INCORRECT', hintUsed: false,
      gradingPolicyVersion: 'grading-v1', submittedAt: '2026-08-25T12:00:00.000Z', recordedAt: '2026-08-25T12:00:00.000Z',
    },
    problemSpec: { kind: 'FRACTION_COMPARE', leftNumerator: 1, leftDenominator: 8, rightNumerator: 1, rightDenominator: 4 },
    prompt: '1/8 ? 1/4', solutionOutline: ['1/4 is greater than 1/8.'], classification: 'CORE',
  },
  strategies: [{ id: 'STRAT-DRAW-DIAGRAM', name: 'Draw a diagram', description: 'Use a diagram to make the relationship visible.' }],
  representations: [{ id: 'REP-FRACTION-STRIP', name: 'Fraction strip', description: 'Compare equal wholes visually.' }],
  reasoningChecks: [{
    id: 'part-size', kind: 'CHOICE', prompt: 'When the denominator increases, each equal part becomes?',
    options: [{ id: 'SMALLER', label: 'Smaller' }, { id: 'LARGER', label: 'Larger' }], expectedOptionId: 'SMALLER',
  }],
};

describe('MiniMaxCorrectionProvider authority boundary', () => {
  test('returns an allowed diagnosis candidate without adding authoritative fields', async () => {
    let observed: LLMRequest | undefined;
    const call: CorrectionLLMCall = async (request) => {
      observed = request;
      return JSON.stringify({
        target: { kind: 'MISCONCEPTION', misconceptionId: 'MIS-FRA-DENOMINATOR-SIZE' },
        rationale: 'The response follows denominator magnitude rather than part size.',
      });
    };
    const provider = new MiniMaxCorrectionProvider(call);

    await expect(provider.proposeDiagnosis(diagnosisContext)).resolves.toEqual({
      target: { kind: 'MISCONCEPTION', misconceptionId: 'MIS-FRA-DENOMINATOR-SIZE' },
      rationale: 'The response follows denominator magnitude rather than part size.',
    });
    expect(JSON.stringify(observed)).toContain('choose exactly one target from allowedTargets');
    expect(JSON.stringify(observed)).not.toContain('DIAGNOSIS_CONFIRMED');
  });

  test('rejects targets outside the request allowed set even when taxonomy-valid', async () => {
    const provider = new MiniMaxCorrectionProvider(async () => JSON.stringify({
      target: { kind: 'MISCONCEPTION', misconceptionId: 'MIS-FRA-NUMERATOR-ONLY' },
      rationale: 'candidate',
    }));
    await expect(provider.proposeDiagnosis(diagnosisContext))
      .rejects.toThrow('diagnosis candidate target must be one of allowedTargets');
  });

  test('rejects malformed or authority-expanding diagnosis output', async () => {
    await expect(new MiniMaxCorrectionProvider(async () => 'not json').proposeDiagnosis(diagnosisContext))
      .rejects.toThrow('correction provider returned invalid JSON');

    const provider = new MiniMaxCorrectionProvider(async () => JSON.stringify({
      target: { kind: 'GENERIC', code: 'UNKNOWN' }, rationale: 'uncertain',
      grade: 'CORRECT', objectiveId: 'P3-FRA-999', evidenceType: 'corrected', studentUnderstands: true, resolved: true,
    }));
    await expect(provider.proposeDiagnosis(diagnosisContext))
      .rejects.toThrow('invalid diagnosis candidate output');
  });

  test('guidance request omits answer truth and output cannot smuggle trusted decisions', async () => {
    let observed: LLMRequest | undefined;
    const valid = new MiniMaxCorrectionProvider(async (request) => {
      observed = request;
      return JSON.stringify({
        diagnosisExplanation: 'A larger denominator means the same whole is split into more, smaller parts.',
        socraticPrompts: ['Which is larger: one fourth of the same whole, or one eighth?'],
      });
    });
    await expect(valid.prepareGuidance(guidanceContext)).resolves.toMatchObject({
      diagnosisExplanation: expect.any(String),
      socraticPrompts: [expect.any(String)],
    });
    const serialized = JSON.stringify(observed);
    expect(serialized).not.toContain('answerSpec');
    expect(serialized).not.toContain('solutionOutline');
    expect(serialized).not.toContain('1/4 is greater than 1/8.');
    expect(serialized).toContain('teaching language only');

    const invalid = new MiniMaxCorrectionProvider(async () => JSON.stringify({
      diagnosisExplanation: 'text', socraticPrompts: ['question'], grade: 'CORRECT', resolved: true,
    }));
    await expect(invalid.prepareGuidance(guidanceContext)).rejects.toThrow('invalid correction guidance output');
  });
});
