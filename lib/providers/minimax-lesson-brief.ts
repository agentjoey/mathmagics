import { minimaxChat } from './minimax';
import type { LLMRequest } from '@/lib/types';
import type {
  GeneratedLessonBriefContent,
  LessonBriefGenerator,
  LessonBriefRecord,
  LessonPreparationContext,
  PlanningRepository,
  TeachingPlannerService,
} from '@/lib/planning';

export type LessonBriefLLMCall = (request: LLMRequest) => Promise<string>;

const GENERATOR_NAME = 'minimax';
const MODEL_NAME = 'MiniMax-M2.7-highspeed';
const CONTEXT_VERSION = 'phase3-v1';
const VALID_STAGES = new Set(['CONCRETE', 'PICTORIAL', 'ABSTRACT']);

async function defaultMiniMaxCall(request: LLMRequest): Promise<string> {
  const stream = await minimaxChat(request);
  let text = '';
  for await (const chunk of stream.textStream) text += chunk;
  return text;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const unfenced = trimmed.startsWith('```') && trimmed.endsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, '')
    : trimmed;
  try {
    return JSON.parse(unfenced) as unknown;
  } catch {
    throw new Error('lesson brief provider returned invalid JSON');
  }
}

export function assertValidGeneratedLessonBriefContent(
  value: unknown,
): asserts value is GeneratedLessonBriefContent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid lesson brief content');
  }
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.objectiveSummary !== 'string' ||
    !stringArray(candidate.readinessCheck) ||
    !Array.isArray(candidate.teachingSequence) ||
    !stringArray(candidate.keyQuestions) ||
    !stringArray(candidate.workedExampleSuggestions) ||
    !stringArray(candidate.misconceptionWatchouts) ||
    !stringArray(candidate.masteryCheck)
  ) {
    throw new Error('invalid lesson brief content');
  }

  for (const step of candidate.teachingSequence) {
    if (!step || typeof step !== 'object' || Array.isArray(step)) {
      throw new Error('invalid lesson brief content');
    }
    const item = step as Record<string, unknown>;
    if (
      typeof item.stage !== 'string' ||
      !VALID_STAGES.has(item.stage) ||
      typeof item.guidance !== 'string'
    ) {
      throw new Error('invalid lesson brief content');
    }
  }
}

function buildRequest(context: LessonPreparationContext): LLMRequest {
  const trustedContext = {
    student: {
      id: context.student.id,
      levelId: context.student.levelId,
      learningMode: context.student.learningMode,
      minutesPerSession: context.student.minutesPerSession,
    },
    lesson: context.lesson,
    objectives: context.objectives,
  };

  return {
    maxTokens: 2200,
    system: [
      'You are MathMagics parent/tutor lesson-preparation writer.',
      'Use only the trusted curriculum and learning-state context supplied by the application.',
      'You must not change objective IDs.',
      'You must not change mastery or readiness.',
      'You must not invent prerequisites, curriculum facts, evidence, attempts, or mistakes.',
      'Return raw JSON only. Do not use markdown fences or commentary.',
      'The JSON object must contain exactly these top-level fields: objectiveSummary, readinessCheck, teachingSequence, keyQuestions, workedExampleSuggestions, misconceptionWatchouts, masteryCheck.',
      'teachingSequence items must use stage CONCRETE, PICTORIAL, or ABSTRACT and a guidance string.',
    ].join(' '),
    messages: [{
      role: 'user',
      content: JSON.stringify({
        task: 'Create a concise parent/tutor lesson brief for the immutable planned lesson.',
        trustedContext,
      }),
    }],
  };
}

export class MiniMaxLessonBriefGenerator implements LessonBriefGenerator {
  constructor(private readonly call: LessonBriefLLMCall = defaultMiniMaxCall) {}

  async generate(context: LessonPreparationContext): Promise<GeneratedLessonBriefContent> {
    const response = await this.call(buildRequest(context));
    const parsed = parseJsonObject(response);
    assertValidGeneratedLessonBriefContent(parsed);
    return structuredClone(parsed);
  }
}

export interface GenerateAndPersistLessonBriefInput {
  plannerService: TeachingPlannerService;
  planningRepository: PlanningRepository;
  generator: LessonBriefGenerator;
  lessonId: string;
  briefId: string;
  now: string;
  generatorName?: string;
  model?: string;
  contextVersion?: string;
}

export async function generateAndPersistLessonBrief(
  input: GenerateAndPersistLessonBriefInput,
): Promise<LessonBriefRecord> {
  const context = await input.plannerService.prepareLesson(input.lessonId);
  const content = await input.generator.generate(context);
  assertValidGeneratedLessonBriefContent(content);

  const record: LessonBriefRecord = {
    id: input.briefId,
    lessonId: context.lesson.id,
    studentId: context.student.id,
    generator: input.generatorName ?? GENERATOR_NAME,
    model: input.model ?? MODEL_NAME,
    contextVersion: input.contextVersion ?? CONTEXT_VERSION,
    content: structuredClone(content),
    createdAt: input.now,
  };

  await input.planningRepository.appendLessonBrief(record);
  return structuredClone(record);
}
