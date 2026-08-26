import { describe, expect, it } from 'vitest';
import { deriveCoverage } from '@/lib/progress/coverage';
import type { EvidenceRecord } from '@/lib/learning';
import type { Attempt } from '@/lib/practice';

const OBJ = 'P2-AS-002';
const NOW = '2026-08-26T08:00:00.000Z';

function attempt(id: string, kind: 'PRACTICE' | 'HOMEWORK' | 'CORRECTION'): Attempt {
  const source = kind === 'PRACTICE'
    ? { kind, sessionId: 'session-1', itemId: 'item-1' } as const
    : kind === 'HOMEWORK'
      ? { kind, submissionId: 'submission-1', problemId: 'problem-1' } as const
      : { kind, mistakeId: 'mistake-1', correctionItemId: 'correction-1' } as const;
  return {
    id,
    source,
    studentId: 's1',
    objectiveId: OBJ,
    answerText: '12',
    outcome: 'INCORRECT',
    hintUsed: false,
    gradingPolicyVersion: 'grade-v1',
    submittedAt: NOW,
    recordedAt: NOW,
  };
}

function evidence(id: string, type: EvidenceRecord['type'], origin: EvidenceRecord['origin']): EvidenceRecord {
  return { id, studentId: 's1', objectiveId: OBJ, type, origin, observedAt: NOW, recordedAt: NOW };
}

describe('deriveCoverage', () => {
  it('projects exposure and root engagement without confusing correction with practice', () => {
    const wrongPractice = attempt('a-practice', 'PRACTICE');
    const wrongEvidence = evidence('e-wrong', 'incorrect', { kind: 'PRACTICE', refId: wrongPractice.id });
    const introduced = evidence('e-intro', 'introduced', { kind: 'LESSON', refId: 'lesson-1' });
    const correctionEvidence = evidence('e-corrected', 'corrected', { kind: 'CORRECTION', refId: 'a-correction' });

    expect(deriveCoverage({ objectiveId: OBJ, evidence: [], rootAttempts: [], completedLearnLessons: [] })).toBe('NOT_SEEN');
    expect(deriveCoverage({ objectiveId: OBJ, evidence: [introduced], rootAttempts: [], completedLearnLessons: [] })).toBe('INTRODUCED');
    expect(deriveCoverage({ objectiveId: OBJ, evidence: [], rootAttempts: [wrongPractice], completedLearnLessons: [] })).toBe('ENGAGED');
    expect(deriveCoverage({ objectiveId: OBJ, evidence: [wrongEvidence], rootAttempts: [wrongPractice], completedLearnLessons: [] })).toBe('PRACTISED');
    expect(deriveCoverage({ objectiveId: OBJ, evidence: [correctionEvidence], rootAttempts: [], completedLearnLessons: [] })).not.toBe('PRACTISED');
  });

  it('accepts completed LEARN as introduction but never as practice', () => {
    expect(deriveCoverage({
      objectiveId: OBJ,
      evidence: [],
      rootAttempts: [],
      completedLearnLessons: [{ lessonId: 'lesson-1', objectiveIds: [OBJ] }],
    })).toBe('INTRODUCED');
  });
});
