import { assertValidPracticeItem } from '../validation';
import type { AnswerSpec, PracticeItem, Time24HourProblemSpec } from '../types';
import type { PracticeItemGenerationInput, PracticeItemGenerator } from './registry';

const OBJECTIVE_ID = 'P3-TIME-003';

const CASES: readonly Time24HourProblemSpec[] = [
  { kind: 'TIME_24_HOUR', direction: 'TWELVE_TO_24', hour24: 0, minute: 0, hour12: 12, period: 'AM' },
  { kind: 'TIME_24_HOUR', direction: 'TWENTY_FOUR_TO_12', hour24: 12, minute: 0, hour12: 12, period: 'PM' },
  { kind: 'TIME_24_HOUR', direction: 'TWELVE_TO_24', hour24: 7, minute: 5, hour12: 7, period: 'AM' },
  { kind: 'TIME_24_HOUR', direction: 'TWELVE_TO_24', hour24: 19, minute: 45, hour12: 7, period: 'PM' },
];

function requireInput(input: PracticeItemGenerationInput): void {
  if (input.session.objectiveId !== input.context.objective.id || input.blueprint.objectiveId !== input.session.objectiveId) {
    throw new Error('practice generation objective coordinates must match');
  }
  if (input.itemIds.length < input.blueprint.slots.length || new Set(input.itemIds).size !== input.itemIds.length) {
    throw new Error('practice generation itemIds must provide unique ids for every slot');
  }
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

function time24(spec: Time24HourProblemSpec): string {
  return `${twoDigits(spec.hour24)}:${twoDigits(spec.minute)}`;
}

function time12(spec: Time24HourProblemSpec): string {
  return `${spec.hour12}:${twoDigits(spec.minute)} ${spec.period}`;
}

function answerFor(spec: Time24HourProblemSpec): AnswerSpec {
  if (spec.direction === 'TWELVE_TO_24') {
    const withColon = time24(spec);
    return {
      kind: 'EXACT_TEXT',
      acceptedValues: [withColon, withColon.replace(':', '')],
      caseSensitive: false,
    };
  }

  const withSpace = time12(spec);
  return {
    kind: 'EXACT_TEXT',
    acceptedValues: [withSpace, withSpace.replace(' ', '')],
    caseSensitive: false,
  };
}

function promptFor(spec: Time24HourProblemSpec): string {
  if (spec.direction === 'TWELVE_TO_24') {
    return `Write ${time12(spec)} using the 24-hour clock.`;
  }
  return `Write ${time24(spec)} using the 12-hour clock.`;
}

export const time24HourPracticeGenerator: PracticeItemGenerator = {
  supports(objectiveId) {
    return objectiveId === OBJECTIVE_ID;
  },
  generate(input) {
    requireInput(input);
    const objectiveId = input.session.objectiveId;
    if (objectiveId !== OBJECTIVE_ID) throw new Error(`Unsupported practice objective: ${objectiveId}`);

    return input.blueprint.slots.map((difficultyBand, index) => {
      const sequence = index + 1;
      const problemSpec = CASES[index % CASES.length]!;
      const answerSpec = answerFor(problemSpec);
      const item: PracticeItem = {
        id: input.itemIds[index]!,
        sessionId: input.session.id,
        studentId: input.session.studentId,
        objectiveId,
        sequence,
        difficultyBand,
        problemSpec: { ...problemSpec },
        prompt: promptFor(problemSpec),
        answerSpec,
        hint: problemSpec.direction === 'TWELVE_TO_24'
          ? 'For PM times after 12 noon, add 12 to the hour. Midnight starts at 00.'
          : 'Hours from 13 to 23 become PM by subtracting 12. 12:00 is noon.',
        solutionOutline: problemSpec.direction === 'TWELVE_TO_24'
          ? [`${time12(problemSpec)} is ${time24(problemSpec)} in the 24-hour clock.`]
          : [`${time24(problemSpec)} is ${time12(problemSpec)} in the 12-hour clock.`],
        generator: 'time-24-hour-conversion',
        generatorVersion: 'time-24-hour-v1',
        createdAt: input.session.createdAt,
      };
      assertValidPracticeItem(item);
      return item;
    });
  },
};
