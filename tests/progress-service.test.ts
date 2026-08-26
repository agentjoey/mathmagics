import { describe, expect, it } from 'vitest';
import { listObjectivesForTopic } from '@/lib/curriculum';
import { MemoryLearningStateRepository } from '@/lib/learning';
import type { EvidenceRecord, StudentProfile } from '@/lib/learning';
import { MemoryPlanningRepository } from '@/lib/planning';
import { MemoryPracticeRepository } from '@/lib/practice';
import type { Attempt } from '@/lib/practice';
import { ProgressService } from '@/lib/progress/service';
import type { PerformanceRiskFacts } from '@/lib/progress/types';

const NOW = '2026-08-26T12:00:00.000Z';
const OBJECTIVE = 'P2-AS-002';

const student: StudentProfile = {
  id: 'student-progress',
  displayName: 'Student',
  levelId: 'P2',
  learningMode: 'STRUCTURED_HOME_LEARNING',
  sessionsPerWeek: 5,
  minutesPerSession: 30,
  createdAt: '2026-08-20T00:00:00.000Z',
  updatedAt: '2026-08-20T00:00:00.000Z',
};

function homeworkAttempt(id: string, submittedAt: string): Attempt {
  return {
    id,
    source: { kind: 'HOMEWORK', submissionId: `submission-${id}`, problemId: `problem-${id}` },
    studentId: student.id,
    objectiveId: OBJECTIVE,
    answerText: '12',
    outcome: 'CORRECT',
    hintUsed: false,
    gradingPolicyVersion: 'grading-v1',
    submittedAt,
    recordedAt: submittedAt,
  };
}

function evidence(id: string, refId: string, observedAt: string, type: EvidenceRecord['type'] = 'independent_correct'): EvidenceRecord {
  return {
    id,
    studentId: student.id,
    objectiveId: OBJECTIVE,
    type,
    observedAt,
    recordedAt: observedAt,
    origin: { kind: 'HOMEWORK', refId },
  };
}

const safeRiskFacts: PerformanceRiskFacts = {
  async recurrenceCount() { return 0; },
  async hasBlockingMistake() { return false; },
};

describe('ProgressService', () => {
  it('keeps mastery independent from stable recent performance and exposes curriculum strategies', async () => {
    const learning = new MemoryLearningStateRepository();
    const planning = new MemoryPlanningRepository();
    const practice = new MemoryPracticeRepository();
    await learning.saveStudent(student);

    for (let index = 0; index < 5; index += 1) {
      const attempt = homeworkAttempt(`a${index + 1}`, `2026-08-26T0${index + 1}:00:00.000Z`);
      await practice.appendAttempt(attempt);
      if (index === 0) await learning.appendEvidence(evidence('e1', attempt.id, attempt.submittedAt));
    }

    // Future mastery evidence must not leak through the cutoff.
    await learning.appendEvidence(evidence('future-1', 'future-a1', '2026-08-27T01:00:00.000Z'));
    await learning.appendEvidence(evidence('future-2', 'future-a2', '2026-08-27T02:00:00.000Z', 'application_correct'));

    const service = new ProgressService({ learning, planning, practice, riskFacts: safeRiskFacts });
    const progress = await service.getObjectiveProgress(student.id, OBJECTIVE, NOW);

    expect(progress.coverage).toBe('PRACTISED');
    expect(progress.mastery.state).toBe('DEVELOPING');
    expect(progress.performance.state).toBe('STABLE');
    expect(progress.strategyIds).toEqual([
      'STRAT-BAR-PART-WHOLE',
      'STRAT-BAR-COMPARISON',
      'STRAT-DRAW-DIAGRAM',
    ]);
  });

  it('aggregates topic counts without collapsing progress dimensions', async () => {
    const learning = new MemoryLearningStateRepository();
    const planning = new MemoryPlanningRepository();
    const practice = new MemoryPracticeRepository();
    await learning.saveStudent(student);

    const attempt = homeworkAttempt('topic-attempt', '2026-08-26T08:00:00.000Z');
    await practice.appendAttempt(attempt);
    await learning.appendEvidence(evidence('topic-evidence', attempt.id, attempt.submittedAt));

    const service = new ProgressService({ learning, planning, practice, riskFacts: safeRiskFacts });
    const summary = await service.getTopicProgress(student.id, 'P2-WHOLE', NOW);

    expect(summary.objectiveCount).toBe(listObjectivesForTopic('P2-WHOLE').length);
    expect(Object.values(summary.coverage).reduce((sum, count) => sum + count, 0)).toBe(summary.objectiveCount);
    expect(Object.values(summary.mastery).reduce((sum, count) => sum + count, 0)).toBe(summary.objectiveCount);
    expect(Object.values(summary.performance).reduce((sum, count) => sum + count, 0)).toBe(summary.objectiveCount);
    expect(summary.coverage.practised).toBeGreaterThanOrEqual(1);
    expect(summary.mastery.developing).toBeGreaterThanOrEqual(1);
  });
});
