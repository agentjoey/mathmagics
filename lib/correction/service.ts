import { getRepresentations, getStrategies } from '@/lib/curriculum';
import type { EvidenceRecord, LearningStateRepository } from '@/lib/learning';
import { gradeAnswer, type Attempt, type PracticeRepository } from '@/lib/practice';
import type {
  CorrectionAIProvider,
  CorrectionGuidance,
  DiagnosisCandidate,
} from '@/lib/providers/correction';
import { allowedDiagnosisTargets, diagnoseDeterministically } from './diagnosis';
import {
  projectCorrectedEvidence,
  projectTransferEvidence,
  reasoningEvidenceId,
} from './evidence';
import { buildReasoningChecks, gradeReasoningResponse } from './reasoning';
import { canonicalMistakeId, confirmedDiagnosisTarget, deriveMisconceptionSummary, projectMistakeState } from './projection';
import type { AttemptProblemResolver } from './problem-resolver';
import type { MistakeRepository } from './repository';
import { generateCorrectionTransfer, UnsupportedCorrectionTransferError } from './transfer';
import type {
  CorrectionItem,
  CorrectionReasoningCheck,
  DiagnosisTarget,
  MisconceptionSummary,
  Mistake,
  MistakeAttemptLink,
  MistakeEvent,
  MistakeProjectionInput,
  MistakeState,
  ReasoningCheckSpec,
  TrustedAttemptProblem,
} from './types';
import { assertValidDiagnosisTarget } from './validation';

export interface CorrectionIdFactory {
  mistakeId(attemptId: string): string;
  eventId(mistakeId: string, kind: string, discriminator: string): string;
  correctionItemId(mistakeId: string, kind: 'ORIGINAL_RETRY' | 'TRANSFER', round?: number): string;
  reasoningCheckId(mistakeId: string, policyVersion: string, ordinal: number): string;
  attemptId(correctionItemId: string, sequence: number): string;
}

export const defaultCorrectionIdFactory: CorrectionIdFactory = {
  mistakeId: (attemptId) => `mistake:${attemptId}`,
  eventId: (mistakeId, kind, discriminator) => `mistake-event:${mistakeId}:${kind}:${discriminator}`,
  correctionItemId: (mistakeId, kind, round) =>
    `correction-item:${mistakeId}:${kind.toLowerCase()}${round === undefined ? '' : `:${round}`}`,
  reasoningCheckId: (mistakeId, policyVersion, ordinal) =>
    `correction-reasoning-check:${mistakeId}:${policyVersion}:${ordinal}`,
  attemptId: (correctionItemId, sequence) => `correction-attempt:${correctionItemId}:${sequence}`,
};

export interface ObserveIncorrectAttemptInput { attemptId: string }
export interface ConfirmDiagnosisInput {
  mistakeId: string;
  target: DiagnosisTarget;
  confirmerRole: 'STUDENT' | 'PARENT';
}
export interface SubmitCorrectionRetryInput {
  mistakeId: string;
  correctionItemId: string;
  attemptId: string;
  answerText: string;
}
export interface SubmitReasoningCheckInput {
  mistakeId: string;
  checkId: string;
  submissionId: string;
  response: Record<string, string>;
}
export interface SubmitTransferAttemptInput {
  mistakeId: string;
  correctionItemId: string;
  attemptId: string;
  answerText: string;
}

export interface MistakeProjection {
  mistake: Mistake;
  state: MistakeState;
  confirmedTarget: DiagnosisTarget | null;
  canonicalMistakeId: string | null;
  events: MistakeEvent[];
  links: MistakeAttemptLink[];
  correctionItems: CorrectionItem[];
  reasoningChecks: CorrectionReasoningCheck[];
}

export interface CorrectionStartProjection {
  mistake: MistakeProjection;
  item: CorrectionItem;
  reasoningChecks: ReasoningCheckSpec[];
  guidance?: CorrectionGuidance;
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function targetKey(target: DiagnosisTarget): string {
  return target.kind === 'MISCONCEPTION'
    ? `MISCONCEPTION:${target.misconceptionId}`
    : `GENERIC:${target.code}`;
}

function targetEquals(left: DiagnosisTarget | null, right: DiagnosisTarget): boolean {
  return left !== null && targetKey(left) === targetKey(right);
}

function sortAttempts(attempts: Attempt[]): Attempt[] {
  return attempts.slice().sort((left, right) =>
    left.submittedAt.localeCompare(right.submittedAt)
    || left.recordedAt.localeCompare(right.recordedAt)
    || left.id.localeCompare(right.id));
}

export class CorrectionServiceImpl {
  constructor(
    private readonly mistakeRepository: MistakeRepository,
    private readonly practiceRepository: PracticeRepository,
    private readonly learningRepository: LearningStateRepository,
    private readonly problemResolver: AttemptProblemResolver,
    private readonly aiProvider: CorrectionAIProvider,
    private readonly ids: CorrectionIdFactory = defaultCorrectionIdFactory,
  ) {}

  private async ensureEvent(event: MistakeEvent): Promise<MistakeEvent> {
    const existing = await this.mistakeRepository.getEvent(event.id);
    if (existing) {
      const { occurredAt: _existingAt, ...existingStable } = existing;
      const { occurredAt: _newAt, ...newStable } = event;
      if (!same(existingStable, newStable)) throw new Error('mistake event idempotency conflict');
      return existing;
    }
    await this.mistakeRepository.appendEvent(event);
    return event;
  }

  private async ensureLink(link: MistakeAttemptLink): Promise<MistakeAttemptLink> {
    const existing = (await this.mistakeRepository.listAttemptLinks(link.mistakeId))
      .find((candidate) => candidate.attemptId === link.attemptId);
    if (existing) {
      if (existing.role !== link.role) throw new Error('mistake attempt link idempotency conflict');
      return existing;
    }
    await this.mistakeRepository.appendAttemptLink(link);
    return link;
  }

  private async ensureEvidence(record: EvidenceRecord): Promise<EvidenceRecord> {
    const existing = await this.learningRepository.getEvidence(record.id);
    if (existing) {
      if (!same(existing, record)) throw new Error('correction evidence idempotency conflict');
      return existing;
    }
    await this.learningRepository.appendEvidence(record);
    return record;
  }

  private async hydrate(mistake: Mistake): Promise<MistakeProjectionInput> {
    const [events, links, correctionItems, reasoningChecks, evidence] = await Promise.all([
      this.mistakeRepository.listEvents(mistake.id),
      this.mistakeRepository.listAttemptLinks(mistake.id),
      this.mistakeRepository.listCorrectionItems(mistake.id),
      this.mistakeRepository.listReasoningChecks(mistake.id),
      this.learningRepository.listEvidenceForObjective(mistake.studentId, mistake.objectiveId),
    ]);
    const attempts = (await Promise.all(links.map((link) => this.practiceRepository.getAttempt(link.attemptId))))
      .filter((attempt): attempt is Attempt => attempt !== undefined);
    return { mistake, events, links, attempts, evidence, correctionItems, reasoningChecks };
  }

  private async projectionFor(mistake: Mistake): Promise<MistakeProjection> {
    const input = await this.hydrate(mistake);
    return {
      mistake: structuredClone(mistake),
      state: projectMistakeState(input),
      confirmedTarget: confirmedDiagnosisTarget(input.events),
      canonicalMistakeId: canonicalMistakeId(input.events),
      events: structuredClone(input.events),
      links: structuredClone(input.links),
      correctionItems: structuredClone(input.correctionItems),
      reasoningChecks: structuredClone(input.reasoningChecks),
    };
  }

  private async requireMistake(mistakeId: string): Promise<Mistake> {
    const mistake = await this.mistakeRepository.findMistake(mistakeId);
    if (!mistake) throw new Error(`Unknown mistake id: ${mistakeId}`);
    return mistake;
  }

  private async canonicalProjection(mistakeId: string): Promise<MistakeProjection> {
    const mistake = await this.requireMistake(mistakeId);
    const projection = await this.projectionFor(mistake);
    if (!projection.canonicalMistakeId) return projection;
    return this.canonicalProjection(projection.canonicalMistakeId);
  }

  private async findOpenEpisode(
    studentId: string,
    objectiveId: string,
    target: DiagnosisTarget,
    excludeMistakeId?: string,
  ): Promise<Mistake | undefined> {
    const mistakes = await this.mistakeRepository.listMistakesForStudentObjective(studentId, objectiveId);
    for (const candidate of mistakes) {
      if (candidate.id === excludeMistakeId) continue;
      const projection = await this.projectionFor(candidate);
      if (projection.canonicalMistakeId || projection.state === 'RESOLVED') continue;
      if (targetEquals(projection.confirmedTarget, target)) return candidate;
    }
    return undefined;
  }

  private async linkObservation(mistake: Mistake, attempt: Attempt, now: string): Promise<void> {
    await this.ensureLink({ mistakeId: mistake.id, attemptId: attempt.id, role: 'OBSERVATION', linkedAt: now });
    await this.ensureEvent({
      id: this.ids.eventId(mistake.id, 'ATTEMPT_LINKED', attempt.id),
      mistakeId: mistake.id,
      type: 'ATTEMPT_LINKED',
      payload: { attemptId: attempt.id, role: 'OBSERVATION' },
      actorKind: 'SYSTEM',
      policyVersion: 'mistake-diagnosis-v1',
      occurredAt: now,
    });
  }

  async observeIncorrectAttempt(input: ObserveIncorrectAttemptInput, now: string): Promise<Mistake> {
    const attempt = await this.practiceRepository.getAttempt(input.attemptId);
    if (!attempt) throw new Error(`Unknown attempt id: ${input.attemptId}`);
    if (attempt.outcome !== 'INCORRECT') throw new Error('mistake observation requires an incorrect attempt');
    if (attempt.source.kind === 'CORRECTION') throw new Error('CORRECTION attempts are not valid root mistake observations');

    const deterministicId = this.ids.mistakeId(attempt.id);
    const existingByRoot = await this.mistakeRepository.findMistake(deterministicId);
    if (existingByRoot) {
      const projection = await this.projectionFor(existingByRoot);
      if (projection.canonicalMistakeId) return this.requireMistake(projection.canonicalMistakeId);
      await this.linkObservation(existingByRoot, attempt, existingByRoot.firstObservedAt);
      return existingByRoot;
    }

    const problem = await this.problemResolver.resolve(attempt);
    const diagnosis = diagnoseDeterministically(problem);
    const proven = diagnosis.provenTargets.length === 1 ? diagnosis.provenTargets[0]! : null;
    if (proven) {
      const open = await this.findOpenEpisode(attempt.studentId, attempt.objectiveId, proven);
      if (open) {
        await this.linkObservation(open, attempt, now);
        return open;
      }
    }

    const mistake: Mistake = {
      id: deterministicId,
      studentId: attempt.studentId,
      objectiveId: attempt.objectiveId,
      initialAttemptId: attempt.id,
      initialDiagnosisTarget: proven ?? { kind: 'GENERIC', code: 'UNKNOWN' },
      diagnosisPolicyVersion: 'mistake-diagnosis-v1',
      firstObservedAt: attempt.submittedAt,
      createdAt: now,
    };
    await this.mistakeRepository.appendMistake(mistake);
    await this.linkObservation(mistake, attempt, now);
    await this.ensureEvent({
      id: this.ids.eventId(mistake.id, 'MISTAKE_OBSERVED', attempt.id),
      mistakeId: mistake.id,
      type: 'MISTAKE_OBSERVED',
      payload: { attemptId: attempt.id, observations: diagnosis.observations },
      actorKind: 'SYSTEM',
      policyVersion: 'mistake-diagnosis-v1',
      occurredAt: now,
    });
    if (proven) {
      await this.ensureEvent({
        id: this.ids.eventId(mistake.id, 'DIAGNOSIS_CONFIRMED', targetKey(proven)),
        mistakeId: mistake.id,
        type: 'DIAGNOSIS_CONFIRMED',
        payload: { target: structuredClone(proven), authority: 'DETERMINISTIC' },
        actorKind: 'SYSTEM',
        policyVersion: 'mistake-diagnosis-v1',
        occurredAt: now,
      });
    }
    return mistake;
  }

  async proposeDiagnosis(mistakeId: string, now: string): Promise<DiagnosisCandidate> {
    const projection = await this.canonicalProjection(mistakeId);
    if (projection.confirmedTarget) throw new Error('mistake diagnosis is already confirmed');
    const eventId = this.ids.eventId(projection.mistake.id, 'DIAGNOSIS_CANDIDATE_RECORDED', 'candidate');
    const existing = await this.mistakeRepository.getEvent(eventId);
    if (existing) {
      const target = existing.payload.target as DiagnosisTarget | undefined;
      const rationale = existing.payload.rationale;
      if (!target || typeof rationale !== 'string') throw new Error('persisted diagnosis candidate is invalid');
      return { target: structuredClone(target), rationale };
    }

    const attempt = await this.practiceRepository.getAttempt(projection.mistake.initialAttemptId);
    if (!attempt) throw new Error(`Unknown attempt id: ${projection.mistake.initialAttemptId}`);
    const problem = await this.problemResolver.resolve(attempt);
    const deterministic = diagnoseDeterministically(problem);
    if (deterministic.provenTargets.length === 1) {
      throw new Error('AI diagnosis is not allowed when deterministic diagnosis is available');
    }
    const candidate = await this.aiProvider.proposeDiagnosis({
      objectiveId: projection.mistake.objectiveId,
      allowedTargets: structuredClone(deterministic.allowedTargets),
      problemDescription: problem.prompt,
      studentAnswer: attempt.answerText,
      deterministicObservations: deterministic.observations.slice(),
    });
    if (!deterministic.allowedTargets.some((target) => targetKey(target) === targetKey(candidate.target))) {
      throw new Error('AI diagnosis target is outside the allowed taxonomy');
    }
    await this.ensureEvent({
      id: eventId,
      mistakeId: projection.mistake.id,
      type: 'DIAGNOSIS_CANDIDATE_RECORDED',
      payload: { target: structuredClone(candidate.target), rationale: candidate.rationale },
      actorKind: 'AI_PROVIDER',
      policyVersion: 'mistake-diagnosis-v1',
      occurredAt: now,
    });
    return structuredClone(candidate);
  }

  async confirmDiagnosis(input: ConfirmDiagnosisInput, now: string): Promise<MistakeProjection> {
    const mistake = await this.requireMistake(input.mistakeId);
    const current = await this.projectionFor(mistake);
    if (current.canonicalMistakeId) return this.canonicalProjection(current.canonicalMistakeId);
    assertValidDiagnosisTarget(mistake.objectiveId, input.target);
    if (current.confirmedTarget) {
      if (!targetEquals(current.confirmedTarget, input.target)) throw new Error('diagnosis is already confirmed to a different target');
      return current;
    }

    await this.ensureEvent({
      id: this.ids.eventId(mistake.id, 'DIAGNOSIS_CONFIRMED', targetKey(input.target)),
      mistakeId: mistake.id,
      type: 'DIAGNOSIS_CONFIRMED',
      payload: { target: structuredClone(input.target), authority: 'HUMAN' },
      actorKind: input.confirmerRole,
      policyVersion: 'mistake-diagnosis-v1',
      occurredAt: now,
    });

    const open = await this.findOpenEpisode(mistake.studentId, mistake.objectiveId, input.target, mistake.id);
    if (open) {
      await this.ensureEvent({
        id: this.ids.eventId(mistake.id, 'MISTAKE_CONSOLIDATED', open.id),
        mistakeId: mistake.id,
        type: 'MISTAKE_CONSOLIDATED',
        payload: { canonicalMistakeId: open.id },
        actorKind: 'SYSTEM',
        policyVersion: 'mistake-diagnosis-v1',
        occurredAt: now,
      });
      const initialAttempt = await this.practiceRepository.getAttempt(mistake.initialAttemptId);
      if (initialAttempt) await this.linkObservation(open, initialAttempt, now);
      return this.canonicalProjection(open.id);
    }
    return this.canonicalProjection(mistake.id);
  }

  async startCorrection(mistakeId: string, now: string): Promise<CorrectionStartProjection> {
    const projection = await this.canonicalProjection(mistakeId);
    if (projection.state === 'OBSERVED') throw new Error('correction requires confirmed diagnosis');
    if (projection.state === 'RESOLVED') throw new Error('resolved mistake cannot start correction');
    const target = projection.confirmedTarget!;
    const rootAttempt = await this.practiceRepository.getAttempt(projection.mistake.initialAttemptId);
    if (!rootAttempt) throw new Error(`Unknown attempt id: ${projection.mistake.initialAttemptId}`);
    const problem = await this.problemResolver.resolve(rootAttempt);
    const itemId = this.ids.correctionItemId(projection.mistake.id, 'ORIGINAL_RETRY');
    let item = await this.mistakeRepository.getCorrectionItem(itemId);
    if (!item) {
      item = {
        id: itemId,
        mistakeId: projection.mistake.id,
        studentId: projection.mistake.studentId,
        objectiveId: projection.mistake.objectiveId,
        kind: 'ORIGINAL_RETRY',
        sourceAttemptId: rootAttempt.id,
        problemSpec: structuredClone(problem.problemSpec),
        answerSpec: structuredClone(problem.answerSpec),
        prompt: problem.prompt,
        hint: problem.hint,
        solutionOutline: problem.solutionOutline.slice(),
        generator: 'correction-original-retry',
        generatorVersion: 'correction-original-retry-v1',
        createdAt: now,
      };
      await this.mistakeRepository.appendCorrectionItem(item);
    }
    await this.ensureEvent({
      id: this.ids.eventId(projection.mistake.id, 'CORRECTION_STARTED', 'v1'),
      mistakeId: projection.mistake.id,
      type: 'CORRECTION_STARTED',
      payload: { correctionItemId: item.id },
      actorKind: 'SYSTEM',
      policyVersion: 'correction-v1',
      occurredAt: item.createdAt,
    });

    const reasoningChecks = buildReasoningChecks(problem, target);
    const guidanceEventId = this.ids.eventId(projection.mistake.id, 'GUIDANCE_PREPARED', 'v1');
    const existingGuidance = await this.mistakeRepository.getEvent(guidanceEventId);
    let guidance: CorrectionGuidance | undefined;
    if (existingGuidance) {
      guidance = existingGuidance.payload.guidance as CorrectionGuidance | undefined;
    } else {
      const representations = getRepresentations(projection.mistake.objectiveId)
        .map(({ id, name, description }) => ({ id, name, description }));
      const strategies = getStrategies(projection.mistake.objectiveId)
        .map(({ id, name, description }) => ({ id, name, description }));
      guidance = await this.aiProvider.prepareGuidance({
        mistakeId: projection.mistake.id,
        objectiveId: projection.mistake.objectiveId,
        diagnosisTarget: structuredClone(target),
        problem: {
          attempt: structuredClone(problem.attempt),
          problemSpec: structuredClone(problem.problemSpec),
          prompt: problem.prompt,
          hint: problem.hint,
          solutionOutline: problem.solutionOutline.slice(),
          classification: problem.classification,
        },
        strategies,
        representations,
        reasoningChecks: structuredClone(reasoningChecks),
      });
      await this.ensureEvent({
        id: guidanceEventId,
        mistakeId: projection.mistake.id,
        type: 'GUIDANCE_PREPARED',
        payload: { guidance: structuredClone(guidance) },
        actorKind: 'AI_PROVIDER',
        policyVersion: 'correction-v1',
        occurredAt: now,
      });
    }
    return {
      mistake: await this.canonicalProjection(projection.mistake.id),
      item: structuredClone(item),
      reasoningChecks: structuredClone(reasoningChecks),
      guidance: guidance ? structuredClone(guidance) : undefined,
    };
  }

  private async correctedEvidenceFor(mistakeId: string): Promise<EvidenceRecord | undefined> {
    const projection = await this.canonicalProjection(mistakeId);
    const input = await this.hydrate(projection.mistake);
    const linked = new Set(input.links.filter((link) => link.role === 'CORRECTION_RETRY').map((link) => link.attemptId));
    return input.evidence.find((record) =>
      record.type === 'corrected' && record.origin.kind === 'CORRECTION' && !!record.origin.refId && linked.has(record.origin.refId));
  }

  private async explainedEvidenceFor(mistakeId: string): Promise<EvidenceRecord | undefined> {
    const projection = await this.canonicalProjection(mistakeId);
    return (await this.learningRepository.listEvidenceForObjective(
      projection.mistake.studentId,
      projection.mistake.objectiveId,
    )).find((record) =>
      record.type === 'explained_independently'
      && record.origin.kind === 'CORRECTION'
      && record.origin.refId === projection.mistake.id);
  }

  async submitCorrectionRetry(input: SubmitCorrectionRetryInput, now: string): Promise<Attempt> {
    const projection = await this.canonicalProjection(input.mistakeId);
    if (projection.state !== 'CORRECTING') throw new Error('correction retry requires CORRECTING state');
    const item = await this.mistakeRepository.getCorrectionItem(input.correctionItemId);
    if (!item || item.mistakeId !== projection.mistake.id || item.kind !== 'ORIGINAL_RETRY') {
      throw new Error('invalid ORIGINAL_RETRY correction item');
    }

    let attempt = await this.practiceRepository.getAttempt(input.attemptId);
    if (attempt) {
      if (
        attempt.source.kind !== 'CORRECTION'
        || attempt.source.mistakeId !== projection.mistake.id
        || attempt.source.correctionItemId !== item.id
        || attempt.answerText !== input.answerText
      ) throw new Error('correction attempt idempotency conflict');
    } else {
      const previous = sortAttempts(await this.practiceRepository.listAttemptsForCorrectionItem(item.id));
      const parentId = previous.length > 0 ? previous[previous.length - 1]!.id : projection.mistake.initialAttemptId;
      const grade = gradeAnswer(input.answerText, item.answerSpec);
      attempt = {
        id: input.attemptId,
        source: { kind: 'CORRECTION', mistakeId: projection.mistake.id, correctionItemId: item.id },
        studentId: projection.mistake.studentId,
        objectiveId: projection.mistake.objectiveId,
        answerText: input.answerText,
        outcome: grade.outcome,
        hintUsed: true,
        retryOfAttemptId: parentId,
        gradingPolicyVersion: 'grading-v1',
        submittedAt: now,
        recordedAt: now,
      };
      await this.practiceRepository.appendAttempt(attempt);
    }
    await this.ensureLink({ mistakeId: projection.mistake.id, attemptId: attempt.id, role: 'CORRECTION_RETRY', linkedAt: attempt.recordedAt });
    const evidence = projectCorrectedEvidence(attempt, item);
    if (evidence) await this.ensureEvidence(evidence);
    return structuredClone(attempt);
  }

  private async reasoningContext(mistakeId: string): Promise<{
    projection: MistakeProjection;
    problem: TrustedAttemptProblem;
    specs: ReasoningCheckSpec[];
  }> {
    const projection = await this.canonicalProjection(mistakeId);
    if (projection.state !== 'CORRECTING') throw new Error('reasoning requires CORRECTING state');
    if (!(await this.correctedEvidenceFor(projection.mistake.id))) throw new Error('reasoning requires corrected evidence');
    const target = projection.confirmedTarget!;
    const root = await this.practiceRepository.getAttempt(projection.mistake.initialAttemptId);
    if (!root) throw new Error(`Unknown attempt id: ${projection.mistake.initialAttemptId}`);
    const problem = await this.problemResolver.resolve(root);
    const specs = buildReasoningChecks(problem, target);
    if (specs.length === 0) throw new Error('reasoning policy is unsupported for this correction');
    return { projection, problem, specs };
  }

  async revealReasoningHelp(mistakeId: string, checkId: string, now: string): Promise<void> {
    const { projection, specs } = await this.reasoningContext(mistakeId);
    if (!specs.some((spec) => spec.id === checkId)) throw new Error('unknown reasoning check id');
    const existingHelps = projection.events.filter((event) =>
      event.type === 'REASONING_ASSISTANCE_REVEALED' && event.payload.checkId === checkId);
    const discriminator = String(existingHelps.length + 1);
    await this.ensureEvent({
      id: this.ids.eventId(projection.mistake.id, 'REASONING_ASSISTANCE_REVEALED', `${checkId}:${discriminator}`),
      mistakeId: projection.mistake.id,
      type: 'REASONING_ASSISTANCE_REVEALED',
      payload: { checkId },
      actorKind: 'STUDENT',
      policyVersion: 'correction-reasoning-v1',
      occurredAt: now,
    });
  }

  async submitReasoningCheck(input: SubmitReasoningCheckInput, now: string): Promise<CorrectionReasoningCheck> {
    const { projection, specs } = await this.reasoningContext(input.mistakeId);
    const spec = specs.find((candidate) => candidate.id === input.checkId);
    if (!spec) throw new Error('unknown reasoning check id');
    const existing = await this.mistakeRepository.getReasoningCheck(input.submissionId);
    if (existing) {
      if (existing.mistakeId !== projection.mistake.id || existing.checkSpec.id !== spec.id || !same(existing.response, input.response)) {
        throw new Error('reasoning submission idempotency conflict');
      }
      await this.maybeAppendExplainedEvidence(projection.mistake.id, specs);
      return existing;
    }

    const previousForSpec = (await this.mistakeRepository.listReasoningChecks(projection.mistake.id))
      .filter((check) => check.checkSpec.id === spec.id);
    const lastSubmissionAt = previousForSpec.length > 0
      ? previousForSpec[previousForSpec.length - 1]!.submittedAt
      : null;
    const events = await this.mistakeRepository.listEvents(projection.mistake.id);
    const assisted = events.some((event) =>
      event.type === 'REASONING_ASSISTANCE_REVEALED'
      && event.payload.checkId === spec.id
      && (lastSubmissionAt === null || event.occurredAt > lastSubmissionAt)
      && event.occurredAt <= now);
    const check: CorrectionReasoningCheck = {
      id: input.submissionId,
      mistakeId: projection.mistake.id,
      studentId: projection.mistake.studentId,
      objectiveId: projection.mistake.objectiveId,
      checkSpec: structuredClone(spec),
      response: structuredClone(input.response),
      outcome: gradeReasoningResponse(spec, input.response),
      assisted,
      policyVersion: 'correction-reasoning-v1',
      submittedAt: now,
      recordedAt: now,
    };
    await this.mistakeRepository.appendReasoningCheck(check);
    await this.maybeAppendExplainedEvidence(projection.mistake.id, specs);
    return structuredClone(check);
  }

  private async maybeAppendExplainedEvidence(mistakeId: string, specs: ReasoningCheckSpec[]): Promise<void> {
    const projection = await this.canonicalProjection(mistakeId);
    const checks = await this.mistakeRepository.listReasoningChecks(projection.mistake.id);
    const qualifying = specs.map((spec) => checks
      .filter((check) => check.checkSpec.id === spec.id && check.outcome === 'PASS' && !check.assisted)
      .sort((left, right) => left.submittedAt.localeCompare(right.submittedAt) || left.id.localeCompare(right.id))[0]);
    if (qualifying.some((check) => check === undefined)) return;
    const completed = qualifying.filter((check): check is CorrectionReasoningCheck => check !== undefined);
    const observedAt = completed.map((check) => check.submittedAt).sort().at(-1)!;
    const recordedAt = completed.map((check) => check.recordedAt).sort().at(-1)!;
    const evidence: EvidenceRecord = {
      id: reasoningEvidenceId(projection.mistake.id, 'correction-reasoning-v1'),
      studentId: projection.mistake.studentId,
      objectiveId: projection.mistake.objectiveId,
      type: 'explained_independently',
      observedAt,
      recordedAt,
      origin: { kind: 'CORRECTION', refId: projection.mistake.id },
    };
    await this.ensureEvidence(evidence);
  }

  async prepareTransfer(mistakeId: string, now: string): Promise<CorrectionItem> {
    const projection = await this.canonicalProjection(mistakeId);
    if (projection.state === 'RESOLVED') throw new Error('resolved mistake does not need transfer');
    if (projection.state !== 'CORRECTING') throw new Error('transfer requires CORRECTING state');
    if (!(await this.correctedEvidenceFor(projection.mistake.id))) throw new Error('transfer requires corrected evidence');
    if (!(await this.explainedEvidenceFor(projection.mistake.id))) throw new Error('transfer requires explained reasoning evidence');

    const transfers = (await this.mistakeRepository.listCorrectionItems(projection.mistake.id))
      .filter((item) => item.kind === 'TRANSFER')
      .sort((left, right) => (left.transferRound ?? 0) - (right.transferRound ?? 0));
    const latest = transfers.at(-1);
    let round = 1;
    if (latest) {
      const attempts = sortAttempts(await this.practiceRepository.listAttemptsForCorrectionItem(latest.id));
      if (attempts.length === 0) return latest;
      const first = attempts[0]!;
      if (first.outcome === 'CORRECT' && !first.hintUsed) return latest;

      const root = await this.practiceRepository.getAttempt(projection.mistake.initialAttemptId);
      if (!root) throw new Error(`Unknown attempt id: ${projection.mistake.initialAttemptId}`);
      const problem = await this.problemResolver.resolve(root);
      const specs = buildReasoningChecks(problem, projection.confirmedTarget!);
      const checks = await this.mistakeRepository.listReasoningChecks(projection.mistake.id);
      const recovered = specs.every((spec) => checks.some((check) =>
        check.checkSpec.id === spec.id
        && check.outcome === 'PASS'
        && !check.assisted
        && check.submittedAt > first.submittedAt));
      if (!recovered) throw new Error('additional independent reasoning is required after failed transfer');
      round = (latest.transferRound ?? 1) + 1;
    }

    const itemId = this.ids.correctionItemId(projection.mistake.id, 'TRANSFER', round);
    const existing = await this.mistakeRepository.getCorrectionItem(itemId);
    if (existing) return existing;
    const root = await this.practiceRepository.getAttempt(projection.mistake.initialAttemptId);
    if (!root) throw new Error(`Unknown attempt id: ${projection.mistake.initialAttemptId}`);
    const original = await this.problemResolver.resolve(root);
    const item = generateCorrectionTransfer({
      mistakeId: projection.mistake.id,
      studentId: projection.mistake.studentId,
      objectiveId: projection.mistake.objectiveId,
      sourceAttemptId: root.id,
      original,
      round,
      itemId,
      now,
    });
    await this.mistakeRepository.appendCorrectionItem(item);
    return structuredClone(item);
  }

  async submitTransferAttempt(input: SubmitTransferAttemptInput, now: string): Promise<Attempt> {
    const projection = await this.canonicalProjection(input.mistakeId);
    if (projection.state !== 'CORRECTING') throw new Error('transfer attempt requires CORRECTING state');
    const item = await this.mistakeRepository.getCorrectionItem(input.correctionItemId);
    if (!item || item.mistakeId !== projection.mistake.id || item.kind !== 'TRANSFER') {
      throw new Error('invalid TRANSFER correction item');
    }
    const prior = sortAttempts(await this.practiceRepository.listAttemptsForCorrectionItem(item.id));
    let attempt = await this.practiceRepository.getAttempt(input.attemptId);
    if (attempt) {
      if (
        attempt.source.kind !== 'CORRECTION'
        || attempt.source.mistakeId !== projection.mistake.id
        || attempt.source.correctionItemId !== item.id
        || attempt.answerText !== input.answerText
      ) throw new Error('transfer attempt idempotency conflict');
    } else {
      const grade = gradeAnswer(input.answerText, item.answerSpec);
      attempt = {
        id: input.attemptId,
        source: { kind: 'CORRECTION', mistakeId: projection.mistake.id, correctionItemId: item.id },
        studentId: projection.mistake.studentId,
        objectiveId: projection.mistake.objectiveId,
        answerText: input.answerText,
        outcome: grade.outcome,
        hintUsed: false,
        gradingPolicyVersion: 'grading-v1',
        submittedAt: now,
        recordedAt: now,
      };
      await this.practiceRepository.appendAttempt(attempt);
    }
    await this.ensureLink({ mistakeId: projection.mistake.id, attemptId: attempt.id, role: 'TRANSFER', linkedAt: attempt.recordedAt });
    const evidence = projectTransferEvidence(attempt, item, prior.filter((candidate) => candidate.id !== attempt!.id));
    if (evidence) await this.ensureEvidence(evidence);

    const hydrated = await this.hydrate(projection.mistake);
    if (projectMistakeState(hydrated) === 'RESOLVED') {
      await this.ensureEvent({
        id: this.ids.eventId(projection.mistake.id, 'MISTAKE_RESOLVED', 'v1'),
        mistakeId: projection.mistake.id,
        type: 'MISTAKE_RESOLVED',
        payload: {},
        actorKind: 'SYSTEM',
        policyVersion: 'correction-v1',
        occurredAt: attempt.recordedAt,
      });
    }
    return structuredClone(attempt);
  }

  async getMistake(mistakeId: string): Promise<MistakeProjection> {
    return this.canonicalProjection(mistakeId);
  }

  async listOpenMistakes(studentId: string): Promise<MistakeProjection[]> {
    const mistakes = await this.mistakeRepository.listMistakesForStudent(studentId);
    const projections = await Promise.all(mistakes.map((mistake) => this.projectionFor(mistake)));
    return projections.filter((projection) => !projection.canonicalMistakeId && projection.state !== 'RESOLVED');
  }

  async getMisconceptionSummary(studentId: string): Promise<MisconceptionSummary[]> {
    const mistakes = await this.mistakeRepository.listMistakesForStudent(studentId);
    const inputs = await Promise.all(mistakes.map((mistake) => this.hydrate(mistake)));
    return deriveMisconceptionSummary(inputs);
  }
}

export { UnsupportedCorrectionTransferError };
