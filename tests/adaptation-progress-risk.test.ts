import { describe, expect, it } from 'vitest';
import { CorrectionPerformanceRiskFacts } from '@/lib/adaptation/progress-risk';
import { MemoryMistakeRepository } from '@/lib/correction';
import type { CorrectionItem, Mistake, MistakeEvent } from '@/lib/correction';
import { MemoryLearningStateRepository } from '@/lib/learning';
import type { EvidenceRecord, StudentProfile } from '@/lib/learning';
import { MemoryPlanningRepository } from '@/lib/planning';
import { MemoryPracticeRepository } from '@/lib/practice';
import type { Attempt } from '@/lib/practice';
import { ProgressService } from '@/lib/progress';
import type { PerformanceRiskFacts } from '@/lib/progress';

const STUDENT = 'student-risk';
const OBJECTIVE = 'P2-AS-002';
const NOW = '2026-08-26T12:00:00.000Z';
const TARGET = { kind: 'GENERIC' as const, code: 'FACT_ERROR' as const };

const student: StudentProfile = {
  id: STUDENT,
  displayName: 'Risk Student',
  levelId: 'P2',
  learningMode: 'STRUCTURED_HOME_LEARNING',
  sessionsPerWeek: 5,
  minutesPerSession: 30,
  createdAt: '2026-08-20T00:00:00.000Z',
  updatedAt: '2026-08-20T00:00:00.000Z',
};

function mistake(id: string, attemptId: string, at: string): Mistake {
  return {
    id,
    studentId: STUDENT,
    objectiveId: OBJECTIVE,
    initialAttemptId: attemptId,
    initialDiagnosisTarget: TARGET,
    diagnosisPolicyVersion: 'mistake-diagnosis-v1',
    firstObservedAt: at,
    createdAt: at,
  };
}

function event(id: string, mistakeId: string, type: MistakeEvent['type'], at: string, payload: Record<string, unknown> = {}): MistakeEvent {
  return { id, mistakeId, type, payload, actorKind: 'SYSTEM', policyVersion: 'test-v1', occurredAt: at };
}

function correctionAttempt(id: string, mistakeId: string, correctionItemId: string, at: string): Attempt {
  return {
    id,
    source: { kind: 'CORRECTION', mistakeId, correctionItemId },
    studentId: STUDENT,
    objectiveId: OBJECTIVE,
    answerText: '12',
    outcome: 'CORRECT',
    hintUsed: false,
    gradingPolicyVersion: 'grading-v1',
    submittedAt: at,
    recordedAt: at,
  };
}

function correctionEvidence(id: string, type: EvidenceRecord['type'], refId: string, at: string): EvidenceRecord {
  return {
    id,
    studentId: STUDENT,
    objectiveId: OBJECTIVE,
    type,
    observedAt: at,
    recordedAt: at,
    origin: { kind: 'CORRECTION', refId },
  };
}

async function seedResolvedThenRecurrent(
  learning: MemoryLearningStateRepository,
  practice: MemoryPracticeRepository,
  mistakes: MemoryMistakeRepository,
): Promise<void> {
  const first = mistake('m1', 'root-1', '2026-08-23T01:00:00.000Z');
  await mistakes.appendMistake(first);
  await mistakes.appendEvent(event('m1-confirmed', first.id, 'DIAGNOSIS_CONFIRMED', '2026-08-23T01:01:00.000Z', { target: TARGET }));
  await mistakes.appendEvent(event('m1-started', first.id, 'CORRECTION_STARTED', '2026-08-23T01:02:00.000Z'));

  const retry = correctionAttempt('m1-retry-attempt', first.id, 'm1-original-retry', '2026-08-23T01:03:00.000Z');
  await practice.appendAttempt(retry);
  await mistakes.appendAttemptLink({ mistakeId: first.id, attemptId: retry.id, role: 'CORRECTION_RETRY', linkedAt: retry.submittedAt });
  await learning.appendEvidence(correctionEvidence('m1-corrected', 'corrected', retry.id, retry.submittedAt));
  await learning.appendEvidence(correctionEvidence('m1-explained', 'explained_independently', first.id, '2026-08-23T01:04:00.000Z'));

  const transferItem: CorrectionItem = {
    id: 'm1-transfer-item',
    mistakeId: first.id,
    studentId: STUDENT,
    objectiveId: OBJECTIVE,
    kind: 'TRANSFER',
    sourceAttemptId: retry.id,
    transferRound: 1,
    problemSpec: { kind: 'ARITHMETIC', operation: 'MULTIPLY', left: 3, right: 4 },
    answerSpec: { kind: 'INTEGER', value: '12' },
    prompt: '3 × 4 = ?',
    solutionOutline: ['3 × 4 = 12'],
    generator: 'test',
    generatorVersion: '1',
    createdAt: '2026-08-23T01:05:00.000Z',
  };
  await mistakes.appendCorrectionItem(transferItem);
  const transfer = correctionAttempt('m1-transfer-attempt', first.id, transferItem.id, '2026-08-23T01:06:00.000Z');
  await practice.appendAttempt(transfer);
  await mistakes.appendAttemptLink({ mistakeId: first.id, attemptId: transfer.id, role: 'TRANSFER', linkedAt: transfer.submittedAt });
  await learning.appendEvidence(correctionEvidence('m1-transfer-evidence', 'application_correct', transfer.id, transfer.submittedAt));

  const recurrent = mistake('m2', 'root-2', '2026-08-25T01:00:00.000Z');
  await mistakes.appendMistake(recurrent);
  await mistakes.appendEvent(event('m2-confirmed', recurrent.id, 'DIAGNOSIS_CONFIRMED', '2026-08-25T01:01:00.000Z', { target: TARGET }));
}

function recentHomeworkAttempt(index: number): Attempt {
  const hour = String(index + 2).padStart(2, '0');
  return {
    id: `recent-${index}`,
    source: { kind: 'HOMEWORK', submissionId: `hs-${index}`, problemId: `hp-${index}` },
    studentId: STUDENT,
    objectiveId: OBJECTIVE,
    answerText: '12',
    outcome: 'CORRECT',
    hintUsed: false,
    gradingPolicyVersion: 'grading-v1',
    submittedAt: `2026-08-26T${hour}:00:00.000Z`,
    recordedAt: `2026-08-26T${hour}:00:00.000Z`,
  };
}

describe('CorrectionPerformanceRiskFacts', () => {
  it('projects resolved-then-recurrent same diagnosis as blocking and prevents STABLE performance', async () => {
    const learning = new MemoryLearningStateRepository();
    const planning = new MemoryPlanningRepository();
    const practice = new MemoryPracticeRepository();
    const mistakes = new MemoryMistakeRepository();
    await learning.saveStudent(student);
    await seedResolvedThenRecurrent(learning, practice, mistakes);
    for (let index = 0; index < 5; index += 1) await practice.appendAttempt(recentHomeworkAttempt(index));

    const safeRiskFacts: PerformanceRiskFacts = {
      async recurrenceCount() { return 0; },
      async hasBlockingMistake() { return false; },
    };
    const safeProgress = new ProgressService({ learning, planning, practice, riskFacts: safeRiskFacts });
    expect((await safeProgress.getObjectiveProgress(STUDENT, OBJECTIVE, NOW)).performance.state).toBe('STABLE');

    const realRiskFacts = new CorrectionPerformanceRiskFacts({ mistakes, practice, learning });
    expect(await realRiskFacts.recurrenceCount(STUDENT, OBJECTIVE, NOW)).toBe(1);
    expect(await realRiskFacts.hasBlockingMistake(STUDENT, OBJECTIVE, NOW)).toBe(true);

    const realProgress = new ProgressService({ learning, planning, practice, riskFacts: realRiskFacts });
    expect((await realProgress.getObjectiveProgress(STUDENT, OBJECTIVE, NOW)).performance.state).toBe('UNSTABLE');
  });

  it('ignores facts after the cutoff', async () => {
    const learning = new MemoryLearningStateRepository();
    const practice = new MemoryPracticeRepository();
    const mistakes = new MemoryMistakeRepository();
    await learning.saveStudent(student);
    await seedResolvedThenRecurrent(learning, practice, mistakes);

    const riskFacts = new CorrectionPerformanceRiskFacts({ mistakes, practice, learning });
    expect(await riskFacts.recurrenceCount(STUDENT, OBJECTIVE, '2026-08-24T23:59:59.000Z')).toBe(0);
    expect(await riskFacts.hasBlockingMistake(STUDENT, OBJECTIVE, '2026-08-24T23:59:59.000Z')).toBe(false);
  });
});
