import type { Attempt, AttemptRecordedObserver } from '@/lib/practice';
import type { CorrectionServiceImpl } from './service';

export type CorrectionObservationService = Pick<CorrectionServiceImpl, 'observeIncorrectAttempt'>;

export class CorrectionAttemptObserver implements AttemptRecordedObserver {
  constructor(private readonly correctionService: CorrectionObservationService) {}

  async onAttemptRecorded(attempt: Attempt, now: string): Promise<void> {
    if (attempt.outcome !== 'INCORRECT' || attempt.source.kind === 'CORRECTION') return;
    await this.correctionService.observeIncorrectAttempt({ attemptId: attempt.id }, now);
  }
}
