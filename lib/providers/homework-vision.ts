import type { HomeworkMimeType, HomeworkVisionResult } from '@/lib/homework/types';

export interface HomeworkVisionInput {
  submissionId: string;
  studentId: string;
  bytes: Uint8Array;
  mimeType: HomeworkMimeType;
  now: string;
}

export interface HomeworkVisionProvider {
  extract(input: HomeworkVisionInput): Promise<HomeworkVisionResult>;
}
