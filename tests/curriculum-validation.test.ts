import { describe, expect, it } from 'vitest';
import type { CurriculumDataset, LearningObjective } from '@/lib/curriculum/types';
import { assertValidCurriculumDataset, validateCurriculumDataset } from '@/lib/curriculum/validate';

function makeValidDataset(): CurriculumDataset {
  return {
    sources: [
      { id: 'MOE-PM-2021-OCT-2025', type: 'MOE_SYLLABUS', title: 'Primary Mathematics Syllabus Primary One to Six', version: '2021 cohort syllabus; updated October 2025' },
      { id: 'PM-2022-3B', type: 'TEXTBOOK', title: 'Primary Mathematics Student Book 3B', edition: '2022', isbn: '9789814911412' },
    ],
    curriculum: { id: 'SG-MATH-2021', name: 'Singapore Primary Mathematics', country: 'Singapore', version: '2021', sourceRefs: [{ sourceId: 'MOE-PM-2021-OCT-2025', locator: 'Primary 3' }] },
    nodes: [
      { id: 'P3', type: 'level', name: 'Primary 3', parentId: null, sequence: 3, sourceRefs: [{ sourceId: 'MOE-PM-2021-OCT-2025', locator: 'Primary 3' }] },
      { id: 'P3-NUMBER', type: 'strand', name: 'Number and Algebra', parentId: 'P3', sequence: 1, sourceRefs: [{ sourceId: 'MOE-PM-2021-OCT-2025', locator: 'P3 / Number and Algebra' }] },
      { id: 'P3-FRACTIONS', type: 'topic', name: 'Fractions', parentId: 'P3-NUMBER', sequence: 4, sourceRefs: [{ sourceId: 'MOE-PM-2021-OCT-2025', locator: 'P3 / Number and Algebra / Fractions' }] },
    ],
    objectives: [makeObjective('P3-FRA-001')],
    representations: [{ id: 'REP-FRACTION-STRIP', stage: 'PICTORIAL', name: 'Fraction strip', description: 'Equal-length strips partitioned into equal parts.', sourceRefs: [{ sourceId: 'MOE-PM-2021-OCT-2025', locator: 'Pedagogy / representations' }] }],
    strategies: [{ id: 'STRAT-DRAW-DIAGRAM', name: 'Draw a diagram', description: 'Represent quantities and relationships visually.', sourceRefs: [{ sourceId: 'MOE-PM-2021-OCT-2025', locator: 'Mathematical processes / heuristics' }] }],
    misconceptions: [{ id: 'MIS-FRA-DENOMINATOR-SIZE', name: 'Larger denominator means larger fraction', description: 'Treats the denominator as a whole-number magnitude rather than number of equal parts.', evidenceSignals: ['Claims 1/8 is greater than 1/4 because 8 is greater than 4.'], sourceRefs: [{ sourceId: 'MOE-PM-2021-OCT-2025', locator: 'P3 / Fractions; MathMagics teaching annotation' }] }],
    textbookReferences: [{ id: 'PM-2022-3B-CH7-7E', sourceId: 'PM-2022-3B', series: 'Primary Mathematics', edition: '2022', book: '3B', chapter: 'Chapter 7: Fractions', lesson: '7E: Equivalent Fractions', relationship: 'DIRECT', objectiveIds: ['P3-FRA-001'] }],
  };
}

function makeObjective(id: string, overrides: Partial<LearningObjective> = {}): LearningObjective {
  return {
    id, levelId: 'P3', topicId: 'P3-FRACTIONS', title: 'Recognise equivalent fractions', description: 'Recognise when two fractions represent the same value.', sequence: 1,
    sourceRefs: [{ sourceId: 'MOE-PM-2021-OCT-2025', locator: 'P3 / Number and Algebra / Fractions' }], prerequisiteIds: [], representationIds: [], strategyIds: [], misconceptionIds: [], readinessEvidence: [], masteryEvidence: [], difficultyBand: 'CORE', ...overrides,
  };
}

describe('curriculum domain types', () => {
  it('constructs a minimal valid dataset fixture', () => {
    const dataset = makeValidDataset();
    expect(dataset.curriculum.id).toBe('SG-MATH-2021');
    expect(dataset.objectives[0]?.id).toBe('P3-FRA-001');
    expect(dataset.textbookReferences[0]?.relationship).toBe('DIRECT');
  });
});

describe('validateCurriculumDataset', () => {
  it('accepts a valid dataset', () => {
    expect(validateCurriculumDataset(makeValidDataset())).toEqual([]);
    expect(() => assertValidCurriculumDataset(makeValidDataset())).not.toThrow();
  });

  it('reports duplicate entity IDs', () => {
    const dataset = makeValidDataset();
    dataset.objectives.push({ ...dataset.objectives[0]! });
    expect(validateCurriculumDataset(dataset)).toContain('Duplicate objective id: P3-FRA-001');
  });

  it('reports missing node parents and unknown topic references', () => {
    const dataset = makeValidDataset();
    dataset.nodes[1]!.parentId = 'MISSING';
    dataset.objectives[0]!.topicId = 'MISSING-TOPIC';
    const errors = validateCurriculumDataset(dataset);
    expect(errors).toContain('Node P3-NUMBER references unknown parent: MISSING');
    expect(errors).toContain('Objective P3-FRA-001 references unknown topic: MISSING-TOPIC');
  });

  it('reports unknown objective annotation references', () => {
    const dataset = makeValidDataset();
    Object.assign(dataset.objectives[0]!, { prerequisiteIds: ['MISSING-OBJECTIVE'], representationIds: ['MISSING-REP'], strategyIds: ['MISSING-STRATEGY'], misconceptionIds: ['MISSING-MISCONCEPTION'] });
    expect(validateCurriculumDataset(dataset)).toEqual(expect.arrayContaining([
      'Objective P3-FRA-001 references unknown prerequisite: MISSING-OBJECTIVE',
      'Objective P3-FRA-001 references unknown representation: MISSING-REP',
      'Objective P3-FRA-001 references unknown strategy: MISSING-STRATEGY',
      'Objective P3-FRA-001 references unknown misconception: MISSING-MISCONCEPTION',
    ]));
  });

  it('reports unknown provenance sources', () => {
    const dataset = makeValidDataset();
    dataset.curriculum.sourceRefs[0]!.sourceId = 'UNKNOWN-SOURCE';
    expect(validateCurriculumDataset(dataset)).toContain('Curriculum SG-MATH-2021 references unknown source: UNKNOWN-SOURCE');
  });

  it('reports broken textbook references and invalid relationship values', () => {
    const dataset = makeValidDataset();
    dataset.textbookReferences[0]!.sourceId = 'UNKNOWN-TEXTBOOK';
    dataset.textbookReferences[0]!.objectiveIds = ['UNKNOWN-OBJECTIVE'];
    (dataset.textbookReferences[0] as { relationship: string }).relationship = 'MAGIC';
    expect(validateCurriculumDataset(dataset)).toEqual(expect.arrayContaining([
      'Textbook reference PM-2022-3B-CH7-7E references unknown source: UNKNOWN-TEXTBOOK',
      'Textbook reference PM-2022-3B-CH7-7E references unknown objective: UNKNOWN-OBJECTIVE',
      'Textbook reference PM-2022-3B-CH7-7E has invalid relationship: MAGIC',
    ]));
  });

  it('reports prerequisite cycles with involved objective IDs', () => {
    const dataset = makeValidDataset();
    dataset.objectives = [makeObjective('P3-FRA-A', { prerequisiteIds: ['P3-FRA-B'] }), makeObjective('P3-FRA-B', { prerequisiteIds: ['P3-FRA-A'], sequence: 2 })];
    dataset.textbookReferences = [];
    const errors = validateCurriculumDataset(dataset);
    expect(errors.some((error) => error.includes('Prerequisite cycle:') && error.includes('P3-FRA-A') && error.includes('P3-FRA-B'))).toBe(true);
  });

  it('throws one error containing all validation failures', () => {
    const dataset = makeValidDataset();
    dataset.nodes[1]!.parentId = 'MISSING';
    dataset.objectives[0]!.topicId = 'MISSING-TOPIC';
    expect(() => assertValidCurriculumDataset(dataset)).toThrow(/MISSING[\s\S]*MISSING-TOPIC|MISSING-TOPIC[\s\S]*MISSING/);
  });
});

export { makeValidDataset };
