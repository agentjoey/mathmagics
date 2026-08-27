import { createHash } from 'node:crypto';
import { CorrectionAttemptObserver, CorrectionServiceImpl, RepositoryAttemptProblemResolver } from '@/lib/correction';
import { HomeworkServiceImpl } from '@/lib/homework';
import { NeonAdaptiveRepository } from '@/lib/persistence/neon-adaptive-repository';
import { NeonMistakeRepository } from '@/lib/persistence/neon-correction-repository';
import { createNeonDatabase } from '@/lib/persistence/db';
import { NeonHomeworkRepository } from '@/lib/persistence/neon-homework-repository';
import { NeonLearningStateRepository } from '@/lib/persistence/neon-learning-state-repository';
import { NeonPlanningRepository } from '@/lib/persistence/neon-planning-repository';
import { NeonPracticeRepository } from '@/lib/persistence/neon-practice-repository';
import { PracticeServiceImpl } from '@/lib/practice';
import { MiniMaxCorrectionProvider } from '@/lib/providers/minimax-correction';
import { MiniMaxHomeworkVisionProvider } from '@/lib/providers/minimax-homework-vision';
import { PilotHomeworkCorrectionService } from './homework-correction';
import { PilotSessionService } from './session';

function stableId(prefix: string, ...parts: string[]): string {
  const digest = createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 24);
  return `${prefix}-${digest}`;
}

export function createPilotSessionRuntime() {
  const db = createNeonDatabase();
  const learning = new NeonLearningStateRepository(db);
  const planning = new NeonPlanningRepository(db);
  const practice = new NeonPracticeRepository(db);
  const homework = new NeonHomeworkRepository(db);
  const mistakes = new NeonMistakeRepository(db);
  const adaptive = new NeonAdaptiveRepository(db);
  const correction = new CorrectionServiceImpl(
    mistakes,
    practice,
    learning,
    new RepositoryAttemptProblemResolver(practice, homework, learning),
    new MiniMaxCorrectionProvider(),
  );
  const observer = new CorrectionAttemptObserver(correction);
  const practiceService = new PracticeServiceImpl(learning, planning, practice, {
    sessionId: (lessonId, objectiveId) => stableId('practice-session', lessonId, objectiveId),
    itemId: (sessionId, sequence) => stableId('practice-item', sessionId, String(sequence)),
  }, observer);
  const homeworkService = new HomeworkServiceImpl(
    homework,
    practice,
    learning,
    new MiniMaxHomeworkVisionProvider(),
    observer,
  );
  const clock = { now: () => new Date().toISOString() };
  const pilotSession = new PilotSessionService({
    planning,
    adaptive,
    practice: practiceService,
    practiceOwnership: practice,
    clock,
    ids: {
      executionEventId: (lessonId, type, at) => stableId('lesson-execution', lessonId, type, at),
    },
  });
  const pilotHomeworkCorrection = new PilotHomeworkCorrectionService({
    homework: homeworkService,
    correction,
    homeworkOwnership: homework,
    mistakeOwnership: mistakes,
    ids: {
      submissionId: (studentId, sha256) => stableId('homework-submission', studentId, sha256),
      confirmationId: (problemId, studentId, at) => stableId('homework-confirmation', problemId, studentId, at),
    },
  });
  return { learning, pilotSession, pilotHomeworkCorrection, clock };
}
