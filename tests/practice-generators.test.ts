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
  derivePracticeBlueprint,
  getPracticeItemGenerator,
} from '@/lib/practice';
import type {
  PracticeItemGenerationInput,
  PracticePreparationContext,
  PracticeSession,
  WordProblemSpec,
} from '@/lib/practice';

const student: StudentProfile = {
  id: 's1', displayName: 'Alex', levelId: 'P3', learningMode: 'STRUCTURED_HOME_LEARNING',
  sessionsPerWeek: 4, minutesPerSession: 30,
  createdAt: '2026-08-25T00:00:00.000Z', updatedAt: '2026-08-25T00:00:00.000Z',
};

function inputFor(objectiveId: string): PracticeItemGenerationInput {
  const objective = getLearningObjective(objectiveId);
  const lesson: DailyLesson = {
    id: `lesson-${objectiveId}`,
    weeklyPlanId: 'wp1',
    studentId: student.id,
    sequence: 1,
    intent: 'PRACTICE',
    objectiveIds: [objectiveId],
    estimatedMinutes: 30,
    rationale: [{ code: 'CURRENT_POSITION', objectiveId }],
    createdAt: '2026-08-25T00:00:00.000Z',
  };
  const readiness: ObjectiveReadiness = {
    studentId: student.id,
    objectiveId,
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
      objectiveId,
      state: 'DEVELOPING',
      reviewDue: false,
      evidenceCount: 1,
      lastEvidenceAt: '2026-08-24T00:00:00.000Z',
    },
    readiness,
    representations: getRepresentations(objectiveId),
    strategies: getStrategies(objectiveId),
    misconceptions: getMisconceptions(objectiveId),
    policyVersion: 'practice-v1',
    preparedAt: '2026-08-25T00:00:00.000Z',
  };
  const session: PracticeSession = {
    id: `session-${objectiveId}`,
    studentId: student.id,
    lessonId: lesson.id,
    objectiveId,
    policyVersion: 'practice-v1',
    createdAt: '2026-08-25T00:00:00.000Z',
  };
  return {
    session,
    context,
    blueprint: derivePracticeBlueprint(objectiveId, context.mastery),
    itemIds: ['item-1', 'item-2', 'item-3', 'item-4'],
  };
}

function evaluateWordStep(operation: WordProblemSpec['steps'][number]['operation'], operands: number[]): number {
  const [first, ...rest] = operands;
  if (first === undefined) throw new Error('missing operand');
  if (operation === 'ADD') return rest.reduce((value, item) => value + item, first);
  if (operation === 'SUBTRACT') return rest.reduce((value, item) => value - item, first);
  if (operation === 'MULTIPLY') return rest.reduce((value, item) => value * item, first);
  return rest.reduce((value, item) => value / item, first);
}

describe('structured practice generators', () => {
  it('derives every P2 multiplication answer from arithmetic problemSpec', () => {
    const items = getPracticeItemGenerator('P2-MD-001').generate(inputFor('P2-MD-001'));
    expect(items).toHaveLength(4);
    for (const item of items) {
      expect(item.problemSpec.kind).toBe('ARITHMETIC');
      if (item.problemSpec.kind !== 'ARITHMETIC') throw new Error('unexpected spec');
      const expected = item.problemSpec.operation === 'MULTIPLY'
        ? item.problemSpec.left * item.problemSpec.right
        : item.problemSpec.left / item.problemSpec.right;
      expect(item.answerSpec).toEqual({ kind: 'INTEGER', value: String(expected) });
      expect(Number.isInteger(expected)).toBe(true);
    }
  });

  it('uses code-owned equation choices for P2 division-symbol practice', () => {
    const items = getPracticeItemGenerator('P2-MD-002').generate(inputFor('P2-MD-002'));
    for (const item of items) {
      expect(item.problemSpec.kind).toBe('EQUATION_CHOICE');
      if (item.problemSpec.kind !== 'EQUATION_CHOICE') throw new Error('unexpected spec');
      const ids = item.problemSpec.options.map((option) => option.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toContain(item.problemSpec.correctOptionId);
      expect(item.answerSpec).toEqual({ kind: 'CHOICE', optionId: item.problemSpec.correctOptionId });
      const correct = item.problemSpec.options.find((option) => option.id === item.problemSpec.correctOptionId);
      expect(correct?.expression).toContain('÷');
    }
  });

  it('compares P3 unlike fractions by integer cross multiplication with denominator <= 12', () => {
    const items = getPracticeItemGenerator('P3-FRA-003').generate(inputFor('P3-FRA-003'));
    for (const item of items) {
      expect(item.problemSpec.kind).toBe('FRACTION_COMPARE');
      if (item.problemSpec.kind !== 'FRACTION_COMPARE') throw new Error('unexpected spec');
      expect(item.problemSpec.leftDenominator).toBeLessThanOrEqual(12);
      expect(item.problemSpec.rightDenominator).toBeLessThanOrEqual(12);
      const left = item.problemSpec.leftNumerator * item.problemSpec.rightDenominator;
      const right = item.problemSpec.rightNumerator * item.problemSpec.leftDenominator;
      const symbol = left < right ? '<' : left > right ? '>' : '=';
      expect(item.answerSpec).toEqual({ kind: 'EXACT_TEXT', acceptedValues: [symbol], caseSensitive: false });
    }
  });

  it('persists auditable one/two-step word-problem math and final answer', () => {
    const items = getPracticeItemGenerator('P3-MD-005').generate(inputFor('P3-MD-005'));
    expect(items.some((item) => item.problemSpec.kind === 'WORD_PROBLEM' && item.problemSpec.steps.length === 2)).toBe(true);
    for (const item of items) {
      expect(item.problemSpec.kind).toBe('WORD_PROBLEM');
      if (item.problemSpec.kind !== 'WORD_PROBLEM') throw new Error('unexpected spec');
      for (const step of item.problemSpec.steps) {
        expect(step.result).toBe(evaluateWordStep(step.operation, step.operands));
      }
      expect(item.problemSpec.answer).toBe(item.problemSpec.steps.at(-1)?.result);
      expect(item.answerSpec).toEqual({ kind: 'INTEGER', value: String(item.problemSpec.answer) });
    }
  });

  it('supports exactly the approved deep-slice objective registry and fails closed otherwise', () => {
    const supported = [
      'P2-MD-001', 'P2-MD-002', 'P2-MD-003', 'P2-MD-004', 'P2-MD-005', 'P2-MD-006',
      'P3-FRA-001', 'P3-FRA-002', 'P3-FRA-003', 'P3-FRA-004', 'P3-FRA-005',
      'P2-AS-002', 'P3-AS-002', 'P3-MD-005',
    ];
    for (const objectiveId of supported) {
      expect(getPracticeItemGenerator(objectiveId).supports(objectiveId)).toBe(true);
      expect(getPracticeItemGenerator(objectiveId).generate(inputFor(objectiveId))).toHaveLength(4);
    }
    expect(() => getPracticeItemGenerator('P3-MONEY-001'))
      .toThrow('Unsupported practice objective: P3-MONEY-001');
  });
});
