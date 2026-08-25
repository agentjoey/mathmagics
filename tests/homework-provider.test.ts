import { describe, expect, it } from 'vitest';
import { MiniMaxHomeworkVisionProvider } from '@/lib/providers/minimax-homework-vision';

const bytes = new Uint8Array([1, 2, 3]);

describe('HomeworkVisionProvider boundary', () => {
  it('parses only untrusted observation fields and fixes trusted coordinates from input', async () => {
    const provider = new MiniMaxHomeworkVisionProvider(async () => JSON.stringify({
      problems: [{
        sequence: 1,
        question: { value: '3 × 4', confidence: 0.99, region: { x: 0, y: 0, width: 0.5, height: 0.1 } },
        answer: { value: '12', confidence: 0.99, region: { x: 0, y: 0.1, width: 0.2, height: 0.1 } },
        structured: { family: 'ARITHMETIC', fields: {
          operation: { value: 'MULTIPLY', confidence: 0.99, region: { x: 0, y: 0, width: 0.1, height: 0.1 } },
          left: { value: '3', confidence: 0.99, region: { x: 0.1, y: 0, width: 0.1, height: 0.1 } },
          right: { value: '4', confidence: 0.99, region: { x: 0.2, y: 0, width: 0.1, height: 0.1 } },
        } },
      }],
      objectiveId: 'P2-MD-006', grade: 'CORRECT', evidenceType: 'application_correct',
    }));
    const result = await provider.extract({
      submissionId: 'hs-1', studentId: 's1', bytes, mimeType: 'image/png', now: '2026-08-25T00:00:00.000Z',
    });
    expect(result.submissionId).toBe('hs-1');
    expect(result.studentId).toBe('s1');
    expect(result.problems[0]).toMatchObject({ id: 'hs-1:problem:1', submissionId: 'hs-1', studentId: 's1' });
    expect(result).not.toHaveProperty('objectiveId');
    expect(result).not.toHaveProperty('grade');
    expect(result).not.toHaveProperty('evidenceType');
  });

  it('rejects malformed provider confidence before persistence', async () => {
    const provider = new MiniMaxHomeworkVisionProvider(async () => JSON.stringify({
      problems: [{ sequence: 1, question: { value: 'x', confidence: 2, region: { x: 0, y: 0, width: 1, height: 1 } }, structured: { family: 'OPEN_EXPLANATION', fields: {} } }],
    }));
    await expect(provider.extract({ submissionId: 'hs-1', studentId: 's1', bytes, mimeType: 'image/png', now: '2026-08-25T00:00:00.000Z' }))
      .rejects.toThrow();
  });
});
