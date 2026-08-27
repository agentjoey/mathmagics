import { loadCurriculumDataset } from '../lib/curriculum/loader.ts';

const dataset = loadCurriculumDataset();
const p2Objectives = dataset.objectives.filter((objective) => objective.levelId === 'P2').length;
const p3Objectives = dataset.objectives.filter((objective) => objective.levelId === 'P3').length;

console.log(
  `Curriculum valid: ${dataset.nodes.length} nodes, ${dataset.objectives.length} objectives ` +
  `(P2=${p2Objectives}, P3=${p3Objectives}), ${dataset.textbookReferences.length} textbook mappings.`,
);
