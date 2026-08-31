import { describe, expect, it } from 'vitest';
import {
  getLearningObjective,
  getMisconceptions,
  getRepresentations,
  getStrategies,
} from '@/lib/curriculum';
import type { ObjectiveReadiness, StudentProfile } from '@/lib/learning';
import type { DailyLesson } from '@/lib/planning';
import {
  assertValidPracticeItem,
  derivePracticeBlueprint,
  getPracticeItemGenerator,
  gradeAnswer,
  supportsPracticeObjective,
} from '@/lib/practice';
import type {
  PracticeItemGenerationInput,
  PracticePreparationContext,
  PracticeSession,
  Time24HourProblemSpec,
} from '@/lib/practice';

const OBJECTIVE_ID = 'P3-TIME-003';

const student: StudentProfile = {
  id: 's-time',
  displayName: 'Alex',
  levelId: 'P3',
  learningMode: 'STRUCTURED_HOME_LEARNING',
  sessionsPerWeek: 4,
  minutesPerSession: 30,
  createdAt: '2026-08-25T00:00:00.000Z',
  updatedAt: '2026-08-25T00:00:00.000Z',
};

function inputFor24HourClock(): PracticeItemGenerationInput {
  const objective = getLearningObjective(OBJECTIVE_ID);
  const lesson: DailyLesson = {
    id: `lesson-${OBJECTIVE_ID}`,
    weeklyPlanId: 'wp-time',
    studentId: student.id,
    sequence: 1,
    intent: 'PRACTICE',
    objectiveIds: [OBJECTIVE_ID],
    estimatedMinutes: 30,
    rationale: [{ code: 'CURRENT_POSITION', objectiveId: OBJECTIVE_ID }],
    createdAt: '2026-08-25T00:00:00.000Z',
  };
  const readiness: ObjectiveReadiness = {
    studentId: student.id,
    objectiveId: OBJECTIVE_ID,
    state: 'READY',
    ready: true,
    prerequisites: [],
    blockingPrerequisites: [],
  };
  const context: PracticePreparationContext = {
    student,
    lesson,
    objective,
    mastery: {
      studentId: student.id,
      objectiveId: OBJECTIVE_ID,
      state: 'DEVELOPING',
      reviewDue: false,
      evidenceCount: 1,
      lastEvidenceAt: '2026-08-24T00:00:00.000Z',
    },
    readiness,
    representations: getRepresentations(OBJECTIVE_ID),
    strategies: getStrategies(OBJECTIVE_ID),
    misconceptions: getMisconceptions(OBJECTIVE_ID),
    policyVersion: 'practice-v1',
    preparedAt: '2026-08-25T00:00:00.000Z',
  };
  const session: PracticeSession = {
    id: `session-${OBJECTIVE_ID}`,
    studentId: student.id,
    lessonId: lesson.id,
    objectiveId: OBJECTIVE_ID,
    policyVersion: 'practice-v1',
    createdAt: '2026-08-25T00:00:00.000Z',
  };

  return {
    session,
    context,
    blueprint: derivePracticeBlueprint(OBJECTIVE_ID, context.mastery),
    itemIds: ['time-item-1', 'time-item-2', 'time-item-3', 'time-item-4'],
  };
}

describe('P3-TIME-003 24-hour clock practice', () => {
  it('generates deterministic boundary conversions in both directions', () => {
    expect(supportsPracticeObjective(OBJECTIVE_ID)).toBe(true);

    const items = getPracticeItemGenerator(OBJECTIVE_ID).generate(inputFor24HourClock());
    expect(items).toHaveLength(4);

    const specs = items.map((item) => {
      if (item.problemSpec.kind !== 'TIME_24_HOUR') throw new Error('unexpected spec');
      return item.problemSpec satisfies Time24HourProblemSpec;
    });
    expect(specs).toEqual([
      { kind: 'TIME_24_HOUR', direction: 'TWELVE_TO_24', hour24: 0, minute: 0, hour12: 12, period: 'AM' },
      { kind: 'TIME_24_HOUR', direction: 'TWENTY_FOUR_TO_12', hour24: 12, minute: 0, hour12: 12, period: 'PM' },
      { kind: 'TIME_24_HOUR', direction: 'TWELVE_TO_24', hour24: 7, minute: 5, hour12: 7, period: 'AM' },
      { kind: 'TIME_24_HOUR', direction: 'TWELVE_TO_24', hour24: 19, minute: 45, hour12: 7, period: 'PM' },
    ]);
  });

  it('accepts colon and compact forms for 24-hour answers through deterministic grading', () => {
    const items = getPracticeItemGenerator(OBJECTIVE_ID).generate(inputFor24HourClock());
    const eveningItem = items[3]!;

    expect(eveningItem.answerSpec).toEqual({
      kind: 'EXACT_TEXT',
      acceptedValues: ['19:45', '1945'],
      caseSensitive: false,
    });
    expect(gradeAnswer('19:45', eveningItem.answerSpec).outcome).toBe('CORRECT');
    expect(gradeAnswer('1945', eveningItem.answerSpec).outcome).toBe('CORRECT');
    expect(gradeAnswer('19:46', eveningItem.answerSpec).outcome).toBe('INCORRECT');
  });

  it('validates 24-hour clock coordinates and 12-hour equivalence', () => {
    const [midnight] = getPracticeItemGenerator(OBJECTIVE_ID).generate(inputFor24HourClock());
    if (!midnight || midnight.problemSpec.kind !== 'TIME_24_HOUR') throw new Error('unexpected spec');
    const timeSpec = midnight.problemSpec;

    expect(() => assertValidPracticeItem(midnight)).not.toThrow();
    expect(() => assertValidPracticeItem({
      ...midnight,
      problemSpec: { ...timeSpec, hour24: 24 },
    })).toThrow('24-hour clock hour24 must be an integer from 0 to 23');
    expect(() => assertValidPracticeItem({
      ...midnight,
      problemSpec: { ...timeSpec, period: 'PM' },
    })).toThrow('24-hour clock representations must describe the same time');
  });
});
