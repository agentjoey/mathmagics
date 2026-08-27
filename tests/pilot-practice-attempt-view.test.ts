import { describe, expect, it, vi } from 'vitest';
import { MemoryAdaptiveRepository } from '@/lib/adaptation';
import { PilotSessionService } from '@/lib/pilot';
import { MemoryPlanningRepository } from '@/lib/planning';
import type { Attempt, PracticeItem, PracticeService, PracticeSession, SubmitAttemptInput } from '@/lib/practice';

const STUDENT = 'pilot-student';
const NOW = '2026-08-28T08:10:00.000Z';
const session: PracticeSession = {
  id: 'session-1', studentId: STUDENT, lessonId: 'lesson-1', objectiveId: 'P2-MD-001',
  policyVersion: 'practice-v1', createdAt: NOW,
};
const item: PracticeItem = {
  id: 'item-1', sessionId: session.id, studentId: STUDENT, objectiveId: session.objectiveId, sequence: 1,
  difficultyBand: 'CORE', problemSpec: { kind: 'ARITHMETIC', operation: 'MULTIPLY', left: 3, right: 4 },
  answerSpec: { kind: 'INTEGER', value: '12' }, prompt: '3 × 4 = ?', hint: '想一想 3 组 4。',
  solutionOutline: ['3 × 4 = 12'], generator: 'fixture', generatorVersion: 'fixture-v1', createdAt: NOW,
};

describe('pilot practice attempt transport', () => {
  it('returns only the student feedback fields after trusted grading', async () => {
    const input: SubmitAttemptInput = {
      attemptId: 'attempt-1', sessionId: session.id, itemId: item.id, answerText: '11',
    };
    const fullAttempt: Attempt = {
      id: input.attemptId,
      source: { kind: 'PRACTICE', sessionId: session.id, itemId: item.id },
      studentId: STUDENT,
      objectiveId: session.objectiveId,
      answerText: input.answerText,
      outcome: 'INCORRECT',
      hintUsed: false,
      gradingPolicyVersion: 'grading-v1',
      submittedAt: NOW,
      recordedAt: NOW,
    };
    const planning = new MemoryPlanningRepository();
    const practice: PracticeService = {
      preparePractice: vi.fn(),
      createPracticeSession: vi.fn(),
      revealHint: vi.fn(),
      submitAttempt: vi.fn(async () => fullAttempt),
    };
    const service = new PilotSessionService({
      planning,
      adaptive: new MemoryAdaptiveRepository(planning),
      practice,
      practiceOwnership: {
        getPracticeSession: async () => session,
        getPracticeItem: async () => item,
        listPracticeItems: async () => [item],
      },
      clock: { now: () => NOW },
      ids: { executionEventId: (lessonId, type, at) => `${lessonId}:${type}:${at}` },
    });

    const result = await service.submitPracticeAttempt(STUDENT, input, NOW);
    expect(result).toEqual({
      id: 'attempt-1',
      outcome: 'INCORRECT',
      hintUsed: false,
      submittedAt: NOW,
    });
    expect(JSON.stringify(result)).not.toMatch(/gradingPolicyVersion|recordedAt|objectiveId|studentId|source/);
  });
});
