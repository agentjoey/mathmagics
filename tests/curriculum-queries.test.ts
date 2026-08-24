import { describe, expect, it } from 'vitest';
import {
  getLearningObjective,
  getMisconceptions,
  getPrerequisites,
  getRepresentations,
  getStrategies,
  getTextbookReferences,
  listObjectivesForTopic,
  loadCurriculumDataset,
} from '@/lib/curriculum';

describe('curriculum query API', () => {
  const dataset = loadCurriculumDataset();

  it('lists P3 fraction objectives in deterministic sequence order', () => {
    const objectives = listObjectivesForTopic('P3-FRACTIONS', dataset);
    expect(objectives.length).toBeGreaterThanOrEqual(5);
    expect(objectives.map((item) => item.sequence)).toEqual(
      [...objectives.map((item) => item.sequence)].sort((a, b) => a - b),
    );
    expect(objectives[0]?.id).toBe('P3-FRA-001');
  });

  it('resolves cross-level prerequisites from a deep P3 fraction objective', () => {
    const prerequisites = getPrerequisites('P3-FRA-001', dataset);
    expect(prerequisites.map((item) => item.id)).toEqual(
      expect.arrayContaining(['P2-FRA-001', 'P2-FRA-002', 'P2-FRA-003']),
    );
  });

  it('resolves full representation, strategy and misconception records', () => {
    expect(getRepresentations('P3-FRA-003', dataset).map((item) => item.id)).toContain('REP-FRACTION-STRIP');
    expect(getStrategies('P3-MD-005', dataset).map((item) => item.id)).toContain('STRAT-BAR-COMPARISON');
    expect(getMisconceptions('P3-FRA-003', dataset).map((item) => item.id)).toContain('MIS-FRA-DENOMINATOR-SIZE');
  });

  it('returns edition-specific textbook references and preserves extension status', () => {
    const references = getTextbookReferences('P3-FRA-003', dataset);
    expect(references.some((reference) => reference.sourceId === 'PM-2022-3B')).toBe(true);
    expect(references.some((reference) => reference.relationship === 'EXTENSION')).toBe(true);
  });

  it('returns a named objective without mutating the dataset', () => {
    const before = dataset.objectives.length;
    expect(getLearningObjective('P2-MD-005', dataset).title).toMatch(/word problems/i);
    expect(dataset.objectives.length).toBe(before);
  });

  it('throws clear errors for unknown objective and topic IDs', () => {
    expect(() => getLearningObjective('NOPE', dataset)).toThrow('Unknown learning objective id: NOPE');
    expect(() => listObjectivesForTopic('NOPE', dataset)).toThrow('Unknown curriculum topic id: NOPE');
  });
});
