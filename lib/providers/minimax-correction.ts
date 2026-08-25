import type { LLMRequest } from '@/lib/types';
import {
  assertValidDiagnosisTarget,
  type DiagnosisTarget,
  type GenericDiagnosisCode,
} from '@/lib/correction';
import type {
  CorrectionAIProvider,
  CorrectionGuidance,
  DiagnosisCandidate,
  MistakeDiagnosisContext,
  TrustedCorrectionContext,
} from './correction';
import { minimaxChat } from './minimax';

export type CorrectionLLMCall = (request: LLMRequest) => Promise<string>;

const GENERIC_CODES = new Set<GenericDiagnosisCode>([
  'FACT_ERROR',
  'PROCEDURE_ERROR',
  'REPRESENTATION_ERROR',
  'UNKNOWN',
]);

async function defaultMiniMaxCall(request: LLMRequest): Promise<string> {
  const stream = await minimaxChat(request);
  let text = '';
  for await (const chunk of stream.textStream) text += chunk;
  return text;
}

function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const unfenced = trimmed.startsWith('```') && trimmed.endsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, '')
    : trimmed;
  try {
    const value = JSON.parse(unfenced) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not object');
    return value as Record<string, unknown>;
  } catch {
    throw new Error('correction provider returned invalid JSON');
  }
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: string[]): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(value).every((key) => allowedSet.has(key));
}

function isGenericDiagnosisCode(value: unknown): value is GenericDiagnosisCode {
  return typeof value === 'string' && GENERIC_CODES.has(value as GenericDiagnosisCode);
}

function parseDiagnosisTarget(value: unknown): DiagnosisTarget | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.kind === 'MISCONCEPTION' && typeof candidate.misconceptionId === 'string') {
    return { kind: 'MISCONCEPTION', misconceptionId: candidate.misconceptionId };
  }
  if (candidate.kind === 'GENERIC' && isGenericDiagnosisCode(candidate.code)) {
    return { kind: 'GENERIC', code: candidate.code };
  }
  return null;
}

function sameTarget(left: DiagnosisTarget, right: DiagnosisTarget): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'MISCONCEPTION' && right.kind === 'MISCONCEPTION') {
    return left.misconceptionId === right.misconceptionId;
  }
  return left.kind === 'GENERIC' && right.kind === 'GENERIC' && left.code === right.code;
}

function buildDiagnosisRequest(context: MistakeDiagnosisContext): LLMRequest {
  return {
    maxTokens: 700,
    system: [
      'You are MathMagics correction diagnosis language support.',
      'You may propose a candidate only; you do not confirm diagnoses or create learning facts.',
      'Return raw JSON only with exactly target and rationale.',
      'You must choose exactly one target from allowedTargets verbatim.',
      'Do not return grade, objectiveId, evidenceType, mastery, readiness, state, resolved, or studentUnderstands.',
    ].join(' '),
    messages: [{
      role: 'user',
      content: JSON.stringify({ task: 'Propose one constrained diagnosis candidate.', trustedContext: context }),
    }],
  };
}

function buildGuidanceRequest(context: TrustedCorrectionContext): LLMRequest {
  const safeProblem = {
    attempt: context.problem.attempt,
    problemSpec: context.problem.problemSpec,
    prompt: context.problem.prompt,
    hint: context.problem.hint,
    classification: context.problem.classification,
  };
  return {
    maxTokens: 1200,
    system: [
      'You are MathMagics correction teaching language support.',
      'You produce teaching language only from trusted context.',
      'Return raw JSON only with diagnosisExplanation, socraticPrompts, and optional workedExplanation.',
      'Do not return or decide ProblemSpec, AnswerSpec, correct answer, grade, Evidence, Mistake state, resolution, Mastery, Readiness, objectiveId, or diagnosis truth.',
    ].join(' '),
    messages: [{
      role: 'user',
      content: JSON.stringify({
        task: 'Prepare concise Socratic correction guidance.',
        trustedContext: {
          mistakeId: context.mistakeId,
          objectiveId: context.objectiveId,
          diagnosisTarget: context.diagnosisTarget,
          problem: safeProblem,
          strategies: context.strategies,
          representations: context.representations,
          reasoningChecks: context.reasoningChecks,
        },
      }),
    }],
  };
}

function parseGuidance(value: Record<string, unknown>): CorrectionGuidance {
  if (!hasOnlyKeys(value, ['diagnosisExplanation', 'socraticPrompts', 'workedExplanation'])) {
    throw new Error('invalid correction guidance output');
  }
  if (
    typeof value.diagnosisExplanation !== 'string'
    || !value.diagnosisExplanation.trim()
    || !Array.isArray(value.socraticPrompts)
    || value.socraticPrompts.length === 0
    || !value.socraticPrompts.every((item) => typeof item === 'string' && item.trim())
    || (value.workedExplanation !== undefined && typeof value.workedExplanation !== 'string')
  ) {
    throw new Error('invalid correction guidance output');
  }
  return {
    diagnosisExplanation: value.diagnosisExplanation,
    socraticPrompts: value.socraticPrompts.slice() as string[],
    ...(typeof value.workedExplanation === 'string' ? { workedExplanation: value.workedExplanation } : {}),
  };
}

export class MiniMaxCorrectionProvider implements CorrectionAIProvider {
  constructor(private readonly call: CorrectionLLMCall = defaultMiniMaxCall) {}

  async proposeDiagnosis(context: MistakeDiagnosisContext): Promise<DiagnosisCandidate> {
    const value = parseJsonObject(await this.call(buildDiagnosisRequest(context)));
    if (!hasOnlyKeys(value, ['target', 'rationale']) || typeof value.rationale !== 'string' || !value.rationale.trim()) {
      throw new Error('invalid diagnosis candidate output');
    }
    const target = parseDiagnosisTarget(value.target);
    if (!target) throw new Error('invalid diagnosis candidate output');
    assertValidDiagnosisTarget(context.objectiveId, target);
    if (!context.allowedTargets.some((allowed) => sameTarget(allowed, target))) {
      throw new Error('diagnosis candidate target must be one of allowedTargets');
    }
    return { target: structuredClone(target), rationale: value.rationale };
  }

  async prepareGuidance(context: TrustedCorrectionContext): Promise<CorrectionGuidance> {
    return parseGuidance(parseJsonObject(await this.call(buildGuidanceRequest(context))));
  }
}
