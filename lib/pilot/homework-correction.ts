import { createHash } from 'node:crypto';
import type {
  ConfirmDiagnosisInput,
  CorrectionItem,
  CorrectionReasoningCheck,
  CorrectionServiceImpl,
  DiagnosisTarget,
  MistakeProjection,
  MistakeState,
  ReasoningCheckSpec,
  SubmitCorrectionRetryInput,
  SubmitReasoningCheckInput,
  SubmitTransferAttemptInput,
} from '@/lib/correction';
import type { MistakeRepository } from '@/lib/correction';
import type {
  ConfirmHomeworkProblemInput,
  GradeHomeworkProblemInput,
  HomeworkMimeType,
  HomeworkProblemProjection,
  HomeworkRepository,
  HomeworkServiceImpl,
  HomeworkSubmissionProjection,
} from '@/lib/homework';
import type { Attempt } from '@/lib/practice';
import type { CorrectionGuidance } from '@/lib/providers/correction';

export interface PilotHomeworkCorrectionIds {
  submissionId(studentId: string, sha256: string): string;
  confirmationId(problemId: string, studentId: string, at: string): string;
}

export interface PilotHomeworkCorrectionDependencies {
  homework: HomeworkServiceImpl;
  correction: CorrectionServiceImpl;
  homeworkOwnership: Pick<HomeworkRepository, 'getProblem'>;
  mistakeOwnership: Pick<MistakeRepository, 'findMistake'>;
  ids: PilotHomeworkCorrectionIds;
}

export interface PilotMistakeView {
  mistakeId: string;
  objectiveId: string;
  state: MistakeState;
  confirmedTarget: DiagnosisTarget | null;
  firstObservedAt: string;
  createdAt: string;
}

export interface PilotCorrectionItemView {
  id: string;
  mistakeId: string;
  objectiveId: string;
  kind: CorrectionItem['kind'];
  transferRound?: number;
  prompt: string;
  hint?: string;
  createdAt: string;
}

export type PilotReasoningCheckView =
  | {
      id: string;
      kind: 'CHOICE';
      prompt: string;
      options: Array<{ id: string; label: string }>;
    }
  | {
      id: string;
      kind: 'FIELDS';
      prompt: string;
      fields: string[];
    };

export interface PilotCorrectionStartView {
  mistake: PilotMistakeView;
  item: PilotCorrectionItemView;
  reasoningChecks: PilotReasoningCheckView[];
  guidance?: CorrectionGuidance;
}

export interface PilotAttemptView {
  id: string;
  studentId: string;
  objectiveId: string;
  answerText: string;
  outcome: Attempt['outcome'];
  hintUsed: boolean;
  retryOfAttemptId?: string;
  submittedAt: string;
}

export interface PilotHomeworkGradeView {
  attempt: PilotAttemptView;
  evidenceId: string;
}

export interface PilotReasoningSubmissionView {
  id: string;
  mistakeId: string;
  checkId: string;
  response: Record<string, string>;
  outcome: CorrectionReasoningCheck['outcome'];
  assisted: boolean;
  submittedAt: string;
}

function toPilotMistakeView(projection: MistakeProjection): PilotMistakeView {
  return {
    mistakeId: projection.mistake.id,
    objectiveId: projection.mistake.objectiveId,
    state: projection.state,
    confirmedTarget: projection.confirmedTarget ? structuredClone(projection.confirmedTarget) : null,
    firstObservedAt: projection.mistake.firstObservedAt,
    createdAt: projection.mistake.createdAt,
  };
}

function toPilotCorrectionItemView(item: CorrectionItem): PilotCorrectionItemView {
  return {
    id: item.id,
    mistakeId: item.mistakeId,
    objectiveId: item.objectiveId,
    kind: item.kind,
    ...(item.transferRound !== undefined ? { transferRound: item.transferRound } : {}),
    prompt: item.prompt,
    ...(item.hint ? { hint: item.hint } : {}),
    createdAt: item.createdAt,
  };
}

function toPilotReasoningCheckView(spec: ReasoningCheckSpec): PilotReasoningCheckView {
  return spec.kind === 'CHOICE'
    ? {
        id: spec.id,
        kind: spec.kind,
        prompt: spec.prompt,
        options: structuredClone(spec.options),
      }
    : {
        id: spec.id,
        kind: spec.kind,
        prompt: spec.prompt,
        fields: [...spec.fields],
      };
}

function toPilotAttemptView(attempt: Attempt): PilotAttemptView {
  return {
    id: attempt.id,
    studentId: attempt.studentId,
    objectiveId: attempt.objectiveId,
    answerText: attempt.answerText,
    outcome: attempt.outcome,
    hintUsed: attempt.hintUsed,
    ...(attempt.retryOfAttemptId ? { retryOfAttemptId: attempt.retryOfAttemptId } : {}),
    submittedAt: attempt.submittedAt,
  };
}

function toPilotReasoningSubmissionView(check: CorrectionReasoningCheck): PilotReasoningSubmissionView {
  return {
    id: check.id,
    mistakeId: check.mistakeId,
    checkId: check.checkSpec.id,
    response: structuredClone(check.response),
    outcome: check.outcome,
    assisted: check.assisted,
    submittedAt: check.submittedAt,
  };
}

export class PilotHomeworkCorrectionService {
  constructor(private readonly dependencies: PilotHomeworkCorrectionDependencies) {}

  async submitHomework(
    studentId: string,
    bytes: Uint8Array,
    mimeType: HomeworkMimeType,
    at: string,
  ): Promise<HomeworkSubmissionProjection> {
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    return this.dependencies.homework.submitHomework({
      submissionId: this.dependencies.ids.submissionId(studentId, sha256),
      studentId,
      bytes,
      mimeType,
      sha256,
    }, at);
  }

  async confirmHomeworkProblem(
    studentId: string,
    problemId: string,
    corrections: Record<string, string>,
    confirmerRole: ConfirmHomeworkProblemInput['confirmerRole'],
    at: string,
  ): Promise<HomeworkProblemProjection> {
    await this.requireOwnedHomeworkProblem(studentId, problemId);
    return this.dependencies.homework.confirmHomeworkProblem({
      confirmationId: this.dependencies.ids.confirmationId(problemId, studentId, at),
      problemId,
      studentId,
      corrections: structuredClone(corrections),
      confirmerRole,
    }, at);
  }

  async gradeHomeworkProblem(
    studentId: string,
    problemId: string,
    attemptId: GradeHomeworkProblemInput['attemptId'],
    at: string,
  ): Promise<PilotHomeworkGradeView> {
    await this.requireOwnedHomeworkProblem(studentId, problemId);
    const result = await this.dependencies.homework.gradeHomeworkProblem({ problemId, attemptId }, at);
    return { attempt: toPilotAttemptView(result.attempt), evidenceId: result.evidenceId };
  }

  async listOpenMistakes(studentId: string): Promise<PilotMistakeView[]> {
    return (await this.dependencies.correction.listOpenMistakes(studentId)).map(toPilotMistakeView);
  }

  async getMistake(studentId: string, mistakeId: string): Promise<PilotMistakeView> {
    await this.requireOwnedMistake(studentId, mistakeId);
    return toPilotMistakeView(await this.dependencies.correction.getMistake(mistakeId));
  }

  async proposeDiagnosis(studentId: string, mistakeId: string, at: string) {
    await this.requireOwnedMistake(studentId, mistakeId);
    return this.dependencies.correction.proposeDiagnosis(mistakeId, at);
  }

  async confirmDiagnosis(studentId: string, input: ConfirmDiagnosisInput, at: string): Promise<PilotMistakeView> {
    await this.requireOwnedMistake(studentId, input.mistakeId);
    return toPilotMistakeView(await this.dependencies.correction.confirmDiagnosis(input, at));
  }

  async startCorrection(studentId: string, mistakeId: string, at: string): Promise<PilotCorrectionStartView> {
    await this.requireOwnedMistake(studentId, mistakeId);
    const result = await this.dependencies.correction.startCorrection(mistakeId, at);
    return {
      mistake: toPilotMistakeView(result.mistake),
      item: toPilotCorrectionItemView(result.item),
      reasoningChecks: result.reasoningChecks.map(toPilotReasoningCheckView),
      ...(result.guidance ? { guidance: structuredClone(result.guidance) } : {}),
    };
  }

  async submitCorrectionRetry(studentId: string, input: SubmitCorrectionRetryInput, at: string): Promise<PilotAttemptView> {
    await this.requireOwnedMistake(studentId, input.mistakeId);
    return toPilotAttemptView(await this.dependencies.correction.submitCorrectionRetry(input, at));
  }

  async revealReasoningHelp(studentId: string, mistakeId: string, checkId: string, at: string): Promise<void> {
    await this.requireOwnedMistake(studentId, mistakeId);
    return this.dependencies.correction.revealReasoningHelp(mistakeId, checkId, at);
  }

  async submitReasoningCheck(
    studentId: string,
    input: SubmitReasoningCheckInput,
    at: string,
  ): Promise<PilotReasoningSubmissionView> {
    await this.requireOwnedMistake(studentId, input.mistakeId);
    return toPilotReasoningSubmissionView(await this.dependencies.correction.submitReasoningCheck(input, at));
  }

  async prepareTransfer(studentId: string, mistakeId: string, at: string): Promise<PilotCorrectionItemView> {
    await this.requireOwnedMistake(studentId, mistakeId);
    return toPilotCorrectionItemView(await this.dependencies.correction.prepareTransfer(mistakeId, at));
  }

  async submitTransferAttempt(studentId: string, input: SubmitTransferAttemptInput, at: string): Promise<PilotAttemptView> {
    await this.requireOwnedMistake(studentId, input.mistakeId);
    return toPilotAttemptView(await this.dependencies.correction.submitTransferAttempt(input, at));
  }

  private async requireOwnedHomeworkProblem(studentId: string, problemId: string): Promise<void> {
    const problem = await this.dependencies.homeworkOwnership.getProblem(problemId);
    if (!problem) throw new Error(`Unknown homework problem id: ${problemId}`);
    if (problem.studentId !== studentId) throw new Error('homework problem does not belong to student');
  }

  private async requireOwnedMistake(studentId: string, mistakeId: string): Promise<void> {
    const mistake = await this.dependencies.mistakeOwnership.findMistake(mistakeId);
    if (!mistake) throw new Error(`Unknown mistake id: ${mistakeId}`);
    if (mistake.studentId !== studentId) throw new Error('mistake does not belong to student');
  }
}
