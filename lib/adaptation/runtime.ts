import { createHash } from 'node:crypto';
import { createNeonDatabase } from '@/lib/persistence/db';
import { NeonAdaptiveRepository } from '@/lib/persistence/neon-adaptive-repository';
import { NeonMistakeRepository } from '@/lib/persistence/neon-correction-repository';
import { NeonLearningStateRepository } from '@/lib/persistence/neon-learning-state-repository';
import { NeonPlanningRepository } from '@/lib/persistence/neon-planning-repository';
import { NeonPracticeRepository } from '@/lib/persistence/neon-practice-repository';
import { NeonStrategyRepository } from '@/lib/persistence/neon-strategy-repository';
import { ParentProgressService } from '@/lib/progress';
import { CorrectionPerformanceRiskFacts } from './progress-risk';
import { AdaptiveLearningService } from './service';

function stableId(prefix: string, ...parts: string[]): string {
  const digest = createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 24);
  return `${prefix}-${digest}`;
}

export function createPhase7Runtime() {
  const db = createNeonDatabase();
  const learning = new NeonLearningStateRepository(db);
  const planning = new NeonPlanningRepository(db);
  const practice = new NeonPracticeRepository(db);
  const mistakes = new NeonMistakeRepository(db);
  const strategy = new NeonStrategyRepository(db);
  const adaptive = new NeonAdaptiveRepository(db);
  const riskFacts = new CorrectionPerformanceRiskFacts({ mistakes, practice, learning });
  const clock = { now: () => new Date().toISOString() };
  const adaptiveService = new AdaptiveLearningService({
    learningRepository: learning,
    planningRepository: planning,
    practiceRepository: practice,
    mistakeRepository: mistakes,
    strategyRepository: strategy,
    adaptiveRepository: adaptive,
    performanceRiskFacts: riskFacts,
    clock,
    ids: {
      decisionId: (sourceLessonId, cutoff) => stableId('adaptive-decision', sourceLessonId, cutoff),
      replacementLessonId: (sourceLessonId, cutoff) => stableId('adaptive-lesson', sourceLessonId, cutoff),
      supersessionId: (sourceLessonId) => stableId('lesson-supersession', sourceLessonId),
    },
  });
  const parentProgressService = new ParentProgressService({
    learning,
    planning,
    practice,
    mistakes,
    strategy,
    adaptive,
    riskFacts,
  });

  return {
    learning,
    planning,
    adaptive,
    clock,
    adaptiveService,
    parentProgressService,
  };
}
