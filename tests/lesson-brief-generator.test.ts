import { describe, expect, it } from 'vitest';
import {
  MemoryLearningStateRepository,
  type EvidenceRecord,
  type EvidenceType,
  type StudentProfile,
} from '@/lib/learning';
import {
  MemoryPlanningRepository,
  TeachingPlannerServiceImpl,
  type IdFactory,
} from '@/lib/planning';
import {
  MiniMaxLessonBriefGenerator,
  generateAndPersistLessonBrief,
  type LessonBriefLLMCall,
} from '@/lib/providers/minimax-lesson-brief';
import type { LLMRequest } from '@/lib/types';

const BASE = Date.parse('2026-08-24T09:00:00.000Z');

function student(): StudentProfile {
  return {
    id: 'student-p3',
    displayName: 'Alex',
    levelId: 'P3',
    learningMode: 'STRUCTURED_HOME_LEARNING',
    sessionsPerWeek: 2,
    minutesPerSession: 30,
    createdAt: new Date(BASE).toISOString(),
    updatedAt: new Date(BASE).toISOString(),
  };
}

function evidence(id: string, objectiveId: string, type: EvidenceType, minute: number): EvidenceRecord {
  const at = new Date(BASE + minute * 60_000).toISOString();
  return {
    id,
    studentId: 'student-p3',
    objectiveId,
    type,
    observedAt: at,
    recordedAt: at,
    origin: { kind: 'LESSON', refId: 'lesson-fixture' },
  };
}

async function addMastered(repository: MemoryLearningStateRepository, objectiveId: string, prefix: string, minute: number) {
  await repository.appendEvidence(evidence(`${prefix}-1`, objectiveId, 'independent_correct', minute));
  await repository.appendEvidence(evidence(`${prefix}-2`, objectiveId, 'explained_independently', minute + 1));
  await repository.appendEvidence(evidence(`${prefix}-3`, objectiveId, 'application_correct', minute + 2));
}

class FixedIds implements IdFactory {
  planId() { return 'plan-brief'; }
  lessonId(sequence: number) { return `lesson-brief-${sequence}`; }
}

const validJson = JSON.stringify({
  objectiveSummary: 'Compare and order unlike fractions.',
  readinessCheck: ['Ask the learner to compare familiar fractions first.'],
  teachingSequence: [
    { stage: 'CONCRETE', guidance: 'Use equal-sized physical fraction pieces.' },
    { stage: 'PICTORIAL', guidance: 'Move to fraction strips and a number line.' },
    { stage: 'ABSTRACT', guidance: 'Connect the models to equivalent-fraction notation.' },
  ],
  keyQuestions: ['How can we prove which fraction is larger?'],
  workedExampleSuggestions: ['Compare 2/3 and 3/4 with a common representation.'],
  misconceptionWatchouts: ['Do not compare denominators in isolation.'],
  masteryCheck: ['Ask the learner to justify an ordering without a hint.'],
});

async function fixture() {
  const learning = new MemoryLearningStateRepository();
  const planning = new MemoryPlanningRepository();
  const profile = student();
  await learning.saveStudent(profile);
  await learning.setCurrentPosition({
    studentId: profile.id,
    levelId: 'P3',
    objectiveId: 'P3-FRA-003',
    recordedAt: new Date(BASE).toISOString(),
    source: 'MANUAL_SETUP',
  });
  await addMastered(learning, 'P2-FRA-003', 'p2', 1);
  await addMastered(learning, 'P3-FRA-001', 'p3', 10);
  const service = new TeachingPlannerServiceImpl(learning, planning, new FixedIds());
  await service.createWeeklyPlan(profile.id, '2026-08-24', '2026-08-24T10:00:00.000Z');
  return { learning, planning, service };
}

describe('MiniMaxLessonBriefGenerator', () => {
  it('serializes only trusted lesson context and explicit authority constraints into the LLM request', async () => {
    let observed: LLMRequest | undefined;
    const fake: LessonBriefLLMCall = async (request) => {
      observed = request;
      return validJson;
    };
    const { service } = await fixture();
    const context = await service.prepareLesson('lesson-brief-1');
    const generator = new MiniMaxLessonBriefGenerator(fake);

    await generator.generate(context);

    expect(observed).toBeDefined();
    const serialized = JSON.stringify(observed);
    expect(serialized).toContain('P3-FRA-003');
    expect(serialized).toContain('REP-FRACTION-STRIP');
    expect(serialized).toContain('MIS-FRA-DENOMINATOR-SIZE');
    expect(serialized).toContain('MASTERED');
    expect(serialized).toContain('READY');
    expect(serialized).toContain('must not change objective IDs');
    expect(serialized).toContain('must not change mastery or readiness');
    expect(serialized).not.toContain('DATABASE_URL');
  });

  it('returns validated structured content and rejects malformed model output', async () => {
    const { service } = await fixture();
    const context = await service.prepareLesson('lesson-brief-1');
    const validGenerator = new MiniMaxLessonBriefGenerator(async () => validJson);
    await expect(validGenerator.generate(context)).resolves.toMatchObject({
      objectiveSummary: 'Compare and order unlike fractions.',
      teachingSequence: expect.arrayContaining([expect.objectContaining({ stage: 'PICTORIAL' })]),
    });

    const invalidGenerator = new MiniMaxLessonBriefGenerator(async () => JSON.stringify({ objectiveSummary: 'incomplete' }));
    await expect(invalidGenerator.generate(context)).rejects.toThrow('invalid lesson brief content');

    const nonJsonGenerator = new MiniMaxLessonBriefGenerator(async () => 'not json');
    await expect(nonJsonGenerator.generate(context)).rejects.toThrow('lesson brief provider returned invalid JSON');
  });

  it('prepares context, calls AI, then appends an immutable lesson brief record', async () => {
    const { planning, service } = await fixture();
    const generator = new MiniMaxLessonBriefGenerator(async () => validJson);

    const record = await generateAndPersistLessonBrief({
      plannerService: service,
      planningRepository: planning,
      generator,
      lessonId: 'lesson-brief-1',
      briefId: 'brief-1',
      now: '2026-08-24T10:30:00.000Z',
      generatorName: 'minimax',
      model: 'MiniMax-M2.7-highspeed',
    });

    expect(record).toMatchObject({
      id: 'brief-1',
      lessonId: 'lesson-brief-1',
      studentId: 'student-p3',
      generator: 'minimax',
      model: 'MiniMax-M2.7-highspeed',
      contextVersion: 'phase3-v1',
    });
    await expect(planning.listLessonBriefs('lesson-brief-1')).resolves.toEqual([record]);
  });

  it('does not append an empty brief or alter the deterministic plan when the provider fails', async () => {
    const { planning, service } = await fixture();
    const planBefore = await planning.getWeeklyPlan('plan-brief');
    const lessonsBefore = await planning.listDailyLessonsForPlan('plan-brief');
    const generator = new MiniMaxLessonBriefGenerator(async () => {
      throw new Error('provider unavailable');
    });

    await expect(generateAndPersistLessonBrief({
      plannerService: service,
      planningRepository: planning,
      generator,
      lessonId: 'lesson-brief-1',
      briefId: 'brief-failed',
      now: '2026-08-24T10:30:00.000Z',
      generatorName: 'minimax',
      model: 'MiniMax-M2.7-highspeed',
    })).rejects.toThrow('provider unavailable');

    await expect(planning.listLessonBriefs('lesson-brief-1')).resolves.toEqual([]);
    await expect(planning.getWeeklyPlan('plan-brief')).resolves.toEqual(planBefore);
    await expect(planning.listDailyLessonsForPlan('plan-brief')).resolves.toEqual(lessonsBefore);
  });
});
