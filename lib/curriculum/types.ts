export type SourceType = 'MOE_SYLLABUS' | 'TEXTBOOK' | 'TEACHER_GUIDE' | 'HOUSEHOLD_NOTE';
export type CurriculumNodeType = 'level' | 'strand' | 'topic' | 'subtopic';
export type CpaStage = 'CONCRETE' | 'PICTORIAL' | 'ABSTRACT';
export type DifficultyBand = 'FOUNDATION' | 'CORE' | 'APPLICATION' | 'CHALLENGE';

export interface SourceRef {
  sourceId: string;
  locator: string;
}

export interface CurriculumSource {
  id: string;
  type: SourceType;
  title: string;
  version?: string;
  edition?: string;
  isbn?: string;
  url?: string;
}

export interface Curriculum {
  id: string;
  name: string;
  country: string;
  version: string;
  sourceRefs: SourceRef[];
}

export interface CurriculumNode {
  id: string;
  type: CurriculumNodeType;
  name: string;
  parentId: string | null;
  sequence: number;
  sourceRefs: SourceRef[];
}

export interface Representation {
  id: string;
  stage: CpaStage;
  name: string;
  description: string;
  sourceRefs: SourceRef[];
}

export interface ProblemSolvingStrategy {
  id: string;
  name: string;
  description: string;
  sourceRefs: SourceRef[];
}

export interface Misconception {
  id: string;
  name: string;
  description: string;
  evidenceSignals: string[];
  sourceRefs: SourceRef[];
}

export interface LearningObjective {
  id: string;
  levelId: 'P2' | 'P3';
  topicId: string;
  title: string;
  description: string;
  sequence: number;
  sourceRefs: SourceRef[];
  prerequisiteIds: string[];
  representationIds: string[];
  strategyIds: string[];
  misconceptionIds: string[];
  readinessEvidence: string[];
  masteryEvidence: string[];
  difficultyBand: DifficultyBand;
}

export interface TextbookReference {
  id: string;
  sourceId: string;
  series: string;
  edition: string;
  book: string;
  chapter: string;
  lesson: string;
  pageStart?: number;
  pageEnd?: number;
  objectiveIds: string[];
}

export interface CurriculumDataset {
  sources: CurriculumSource[];
  curriculum: Curriculum;
  nodes: CurriculumNode[];
  objectives: LearningObjective[];
  representations: Representation[];
  strategies: ProblemSolvingStrategy[];
  misconceptions: Misconception[];
  textbookReferences: TextbookReference[];
}
