import { describe, expect, it } from 'vitest';
import { loadCurriculumDataset } from '@/lib/curriculum/loader';
import { validateCurriculumDataset } from '@/lib/curriculum/validate';

describe('loadCurriculumDataset', () => {
  it('loads the explicit P2/P3 curriculum dataset and validates it', () => {
    const dataset = loadCurriculumDataset();
    expect(validateCurriculumDataset(dataset)).toEqual([]);
    expect(dataset.nodes.some((node) => node.id === 'P2')).toBe(true);
    expect(dataset.nodes.some((node) => node.id === 'P3')).toBe(true);
    expect(dataset.objectives.some((objective) => objective.id === 'P2-MD-005')).toBe(true);
    expect(dataset.objectives.some((objective) => objective.id === 'P3-FRA-003')).toBe(true);
    expect(dataset.textbookReferences.some((reference) => reference.sourceId === 'PM-2022-3B')).toBe(true);
  });

  it('loads completed teaching metadata for all three deep slices', () => {
    const dataset = loadCurriculumDataset();
    const p2Multiplication = dataset.objectives.find((objective) => objective.id === 'P2-MD-005');
    const p3Fractions = dataset.objectives.find((objective) => objective.id === 'P3-FRA-003');
    const p3WordProblems = dataset.objectives.find((objective) => objective.id === 'P3-MD-005');

    expect(p2Multiplication?.prerequisiteIds.length).toBeGreaterThan(0);
    expect(p2Multiplication?.masteryEvidence.length).toBeGreaterThan(0);
    expect(p3Fractions?.representationIds).toContain('REP-FRACTION-STRIP');
    expect(p3Fractions?.misconceptionIds.length).toBeGreaterThan(0);
    expect(p3WordProblems?.strategyIds).toContain('STRAT-BAR-COMPARISON');
  });

  it('keeps textbook extensions distinguishable from direct curriculum mappings', () => {
    const dataset = loadCurriculumDataset();
    const extension = dataset.textbookReferences.find((reference) => reference.id === 'PM-2022-3B-CH7-7C');
    expect(extension?.relationship).toBe('EXTENSION');
  });
});
