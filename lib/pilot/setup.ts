import { getLearningObjective } from '@/lib/curriculum';
import type { LearningStateRepository, StudentLevel } from '@/lib/learning';
import type { TeachingPlannerService } from '@/lib/planning';

export interface PilotSetupInput {
  displayName: string;
  levelId: StudentLevel;
  currentObjectiveId: string;
  sessionsPerWeek: number;
  minutesPerSession: number;
}

export interface PilotSetupResult {
  studentId: string;
  weekStart: string;
}

export class PilotSetupValidationError extends Error {}

export interface PilotSetupDependencies {
  learning: LearningStateRepository;
  planner: Pick<TeachingPlannerService, 'createWeeklyPlan'>;
  studentId(): string;
}

function mondayForInstant(now: string): string {
  const parsed = new Date(now);
  if (Number.isNaN(parsed.getTime())) throw new PilotSetupValidationError('now must be a valid ISO date-time string');
  const weekday = parsed.getUTCDay();
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
  parsed.setUTCDate(parsed.getUTCDate() - daysSinceMonday);
  return parsed.toISOString().slice(0, 10);
}

function validateInput(input: PilotSetupInput): PilotSetupInput {
  const displayName = input.displayName.trim();
  const currentObjectiveId = input.currentObjectiveId.trim();
  if (!displayName) throw new PilotSetupValidationError('displayName is required');
  if (input.levelId !== 'P2' && input.levelId !== 'P3') throw new PilotSetupValidationError('levelId must be P2 or P3');
  if (!currentObjectiveId) throw new PilotSetupValidationError('currentObjectiveId is required');
  if (!Number.isInteger(input.sessionsPerWeek) || input.sessionsPerWeek < 1 || input.sessionsPerWeek > 7) {
    throw new PilotSetupValidationError('sessionsPerWeek must be an integer from 1 through 7');
  }
  if (!Number.isInteger(input.minutesPerSession) || input.minutesPerSession < 10 || input.minutesPerSession > 180) {
    throw new PilotSetupValidationError('minutesPerSession must be an integer from 10 through 180');
  }
  let objective;
  try {
    objective = getLearningObjective(currentObjectiveId);
  } catch {
    throw new PilotSetupValidationError('currentObjectiveId is unknown');
  }
  if (objective.levelId !== input.levelId) {
    throw new PilotSetupValidationError('currentObjectiveId must belong to the selected level');
  }
  return { ...input, displayName, currentObjectiveId };
}

export class PilotSetupService {
  constructor(private readonly dependencies: PilotSetupDependencies) {}

  async create(rawInput: PilotSetupInput, now: string): Promise<PilotSetupResult> {
    const input = validateInput(rawInput);
    const weekStart = mondayForInstant(now);
    const studentId = this.dependencies.studentId();
    if (!studentId.trim()) throw new Error('generated student id must be non-empty');

    await this.dependencies.learning.saveStudent({
      id: studentId,
      displayName: input.displayName,
      levelId: input.levelId,
      learningMode: 'STRUCTURED_HOME_LEARNING',
      sessionsPerWeek: input.sessionsPerWeek,
      minutesPerSession: input.minutesPerSession,
      createdAt: now,
      updatedAt: now,
    });
    await this.dependencies.learning.setCurrentPosition({
      studentId,
      levelId: input.levelId,
      objectiveId: input.currentObjectiveId,
      recordedAt: now,
      source: 'MANUAL_SETUP',
    });
    await this.dependencies.planner.createWeeklyPlan(studentId, weekStart, now);

    return { studentId, weekStart };
  }
}
