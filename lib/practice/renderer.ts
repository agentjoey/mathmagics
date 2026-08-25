import type { DifficultyBand } from '@/lib/curriculum';

export interface LockedPracticeRenderInput {
  itemId: string;
  objectiveId: string;
  difficultyBand: DifficultyBand;
  promptFrame: string;
  lockedTokens: Record<string, string>;
  hintFrame?: string;
}

export interface RenderedPracticeContent {
  prose?: string;
  explanation?: string;
}

export interface PracticeContentRenderer {
  render(input: LockedPracticeRenderInput): Promise<RenderedPracticeContent>;
}

export class PassthroughPracticeContentRenderer implements PracticeContentRenderer {
  async render(input: LockedPracticeRenderInput): Promise<RenderedPracticeContent> {
    void input;
    return {};
  }
}
