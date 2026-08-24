import type { LessonPreparationContext } from './lesson-preparation';
import type { GeneratedLessonBriefContent } from './types';

export interface LessonBriefGenerator {
  generate(context: LessonPreparationContext): Promise<GeneratedLessonBriefContent>;
}
