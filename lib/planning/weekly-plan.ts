import { assertValidStudentProfile } from '@/lib/learning';
import type { StudentProfile } from '@/lib/learning';
import { assertValidDailyLesson, assertValidWeeklyPlan } from './validation';
import type { DailyLesson, LearningCandidate, WeeklyPlan } from './types';

export interface WeeklyPlanningInput {
  student: StudentProfile;
  weekStart: string;
  now: string;
  candidates: LearningCandidate[];
  planId: string;
  lessonIds: string[];
}

export interface WeeklyPlanBundle {
  plan: WeeklyPlan;
  lessons: DailyLesson[];
}

function rationaleFor(candidate: LearningCandidate) {
  return [{
    code: candidate.reason,
    objectiveId: candidate.objectiveId,
    targetObjectiveId: candidate.targetObjectiveId,
  }];
}

export function generateWeeklyPlan(input: WeeklyPlanningInput): WeeklyPlanBundle {
  assertValidStudentProfile(input.student);
  if (!input.planId.trim()) throw new Error('planId must be non-empty');
  const uniqueLessonIds = new Set(input.lessonIds);
  if (
    input.lessonIds.length < input.student.sessionsPerWeek ||
    uniqueLessonIds.size !== input.lessonIds.length ||
    input.lessonIds.some((id) => !id.trim())
  ) {
    throw new Error('lessonIds must provide at least sessionsPerWeek unique ids');
  }

  const plan: WeeklyPlan = {
    id: input.planId,
    studentId: input.student.id,
    weekStart: input.weekStart,
    sessionsPerWeek: input.student.sessionsPerWeek,
    minutesPerSession: input.student.minutesPerSession,
    createdAt: input.now,
  };
  assertValidWeeklyPlan(plan);

  const lessons: DailyLesson[] = [];
  let lessonIdIndex = 0;
  const scheduledLearnObjectives = new Set<string>();

  function addLesson(intent: DailyLesson['intent'], candidate: LearningCandidate): void {
    if (lessons.length >= input.student.sessionsPerWeek) return;
    const id = input.lessonIds[lessonIdIndex++];
    if (!id) throw new Error('lessonIds must provide at least sessionsPerWeek unique ids');
    const lesson: DailyLesson = {
      id,
      weeklyPlanId: plan.id,
      studentId: input.student.id,
      sequence: lessons.length + 1,
      intent,
      objectiveIds: [candidate.objectiveId],
      estimatedMinutes: input.student.minutesPerSession,
      rationale: rationaleFor(candidate),
      createdAt: input.now,
    };
    assertValidDailyLesson(lesson);
    lessons.push(lesson);
  }

  const review = input.candidates.find(
    (candidate) => candidate.reason === 'REVIEW_DUE' && candidate.mastery === 'MASTERED' && candidate.reviewDue,
  );
  if (review) addLesson('REVIEW', review);

  for (const candidate of input.candidates) {
    if (lessons.length >= input.student.sessionsPerWeek) break;
    if (candidate.reason === 'REVIEW_DUE') continue;
    if (candidate.readiness !== 'READY') continue;
    if (candidate.mastery === 'MASTERED') continue;
    if (scheduledLearnObjectives.has(candidate.objectiveId)) continue;

    addLesson('LEARN', candidate);
    scheduledLearnObjectives.add(candidate.objectiveId);
    if (lessons.length < input.student.sessionsPerWeek) addLesson('PRACTICE', candidate);
  }

  return { plan, lessons };
}
