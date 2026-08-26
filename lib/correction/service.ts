import type { LearningStateRepository } from '@/lib/learning';
import type { Attempt, PracticeRepository } from '@/lib/practice';
import type { CorrectionAIProvider } from '@/lib/providers/correction';
import type { AttemptProblemResolver } from './problem-resolver';
import type { MistakeRepository } from './repository';
import {
  CorrectionServiceImpl as CoreCorrectionServiceImpl,
  defaultCorrectionIdFactory,
  type CorrectionIdFactory,
  type SubmitTransferAttemptInput,
} from './service-core';

export {
  defaultCorrectionIdFactory,
  UnsupportedCorrectionTransferError,
} from './service-core';
export type {
  ConfirmDiagnosisInput,
  CorrectionIdFactory,
  CorrectionStartProjection,
  MistakeProjection,
  ObserveIncorrectAttemptInput,
  SubmitCorrectionRetryInput,
  SubmitReasoningCheckInput,
  SubmitTransferAttemptInput,
} from './service-core';

export class CorrectionServiceImpl extends CoreCorrectionServiceImpl {
  constructor(
    private readonly replayMistakeRepository: MistakeRepository,
    private readonly replayPracticeRepository: PracticeRepository,
    private readonly replayLearningRepository: LearningStateRepository,
    problemResolver: AttemptProblemResolver,
    aiProvider: CorrectionAIProvider,
    private readonly replayIds: CorrectionIdFactory = defaultCorrectionIdFactory,
  ) {
    super(
      replayMistakeRepository,
      replayPracticeRepository,
      replayLearningRepository,
      problemResolver,
      aiProvider,
      replayIds,
    );
  }

  override async submitTransferAttempt(input: SubmitTransferAttemptInput, now: string): Promise<Attempt> {
    try {
      return await super.submitTransferAttempt(input, now);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'transfer attempt requires CORRECTING state') {
        throw error;
      }

      const projection = await this.getMistake(input.mistakeId);
      if (projection.state !== 'RESOLVED') throw error;

      const item = await this.replayMistakeRepository.getCorrectionItem(input.correctionItemId);
      if (!item || item.kind !== 'TRANSFER' || item.mistakeId !== projection.mistake.id) {
        throw new Error('invalid TRANSFER correction item');
      }
      const attempt = await this.replayPracticeRepository.getAttempt(input.attemptId);
      if (!attempt) throw error;
      if (
        attempt.source.kind !== 'CORRECTION'
        || attempt.source.mistakeId !== projection.mistake.id
        || attempt.source.correctionItemId !== item.id
        || attempt.answerText !== input.answerText
      ) {
        throw new Error('transfer attempt idempotency conflict');
      }

      const receiptId = this.replayIds.eventId(projection.mistake.id, 'MISTAKE_RESOLVED', 'v1');
      const existingReceipt = await this.replayMistakeRepository.getEvent(receiptId);
      if (!existingReceipt) {
        const links = await this.replayMistakeRepository.listAttemptLinks(projection.mistake.id);
        const transferAttemptIds = new Set(
          links.filter((link) => link.role === 'TRANSFER').map((link) => link.attemptId),
        );
        const evidence = await this.replayLearningRepository.listEvidenceForObjective(
          projection.mistake.studentId,
          projection.mistake.objectiveId,
        );
        const qualifyingAttemptIds = evidence
          .filter((record) =>
            record.type === 'application_correct'
            && record.origin.kind === 'CORRECTION'
            && !!record.origin.refId
            && transferAttemptIds.has(record.origin.refId))
          .map((record) => record.origin.refId!);
        const qualifyingAttempts = (await Promise.all(
          qualifyingAttemptIds.map((attemptId) => this.replayPracticeRepository.getAttempt(attemptId)),
        )).filter((candidate): candidate is Attempt => candidate !== undefined)
          .sort((left, right) =>
            left.recordedAt.localeCompare(right.recordedAt) || left.id.localeCompare(right.id));
        const resolvedAt = qualifyingAttempts.at(-1)?.recordedAt ?? attempt.recordedAt;
        await this.replayMistakeRepository.appendEvent({
          id: receiptId,
          mistakeId: projection.mistake.id,
          type: 'MISTAKE_RESOLVED',
          payload: {},
          actorKind: 'SYSTEM',
          policyVersion: 'correction-v1',
          occurredAt: resolvedAt,
        });
      } else if (
        existingReceipt.mistakeId !== projection.mistake.id
        || existingReceipt.type !== 'MISTAKE_RESOLVED'
      ) {
        throw new Error('mistake resolution receipt idempotency conflict');
      }

      return structuredClone(attempt);
    }
  }
}
