import type {
  CurriculumDataset,
  SourceRef,
  TextbookRelationship,
} from './types';

const TEXTBOOK_RELATIONSHIPS = new Set<TextbookRelationship>(['DIRECT', 'SUPPORTING', 'EXTENSION']);

function duplicateIds<T extends { id: string }>(label: string, items: T[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) duplicates.add(item.id);
    seen.add(item.id);
  }
  return [...duplicates].sort().map((id) => `Duplicate ${label} id: ${id}`);
}

function validateSourceRefs(owner: string, refs: SourceRef[], sourceIds: Set<string>): string[] {
  const errors: string[] = [];
  for (const ref of refs) {
    if (!sourceIds.has(ref.sourceId)) errors.push(`${owner} references unknown source: ${ref.sourceId}`);
    if (!ref.locator.trim()) errors.push(`${owner} has an empty source locator for: ${ref.sourceId}`);
  }
  return errors;
}

function findPrerequisiteCycles(dataset: CurriculumDataset): string[] {
  const objectiveIds = new Set(dataset.objectives.map((objective) => objective.id));
  const edges = new Map(dataset.objectives.map((objective) => [objective.id, objective.prerequisiteIds.filter((id) => objectiveIds.has(id))]));
  const state = new Map<string, 'visiting' | 'visited'>();
  const stack: string[] = [];
  const cycles = new Set<string>();

  function visit(id: string) {
    if (state.get(id) === 'visited') return;
    if (state.get(id) === 'visiting') {
      const start = stack.indexOf(id);
      cycles.add(`Prerequisite cycle: ${[...stack.slice(start), id].join(' -> ')}`);
      return;
    }
    state.set(id, 'visiting');
    stack.push(id);
    for (const next of edges.get(id) ?? []) visit(next);
    stack.pop();
    state.set(id, 'visited');
  }

  for (const id of objectiveIds) visit(id);
  return [...cycles].sort();
}

export function validateCurriculumDataset(dataset: CurriculumDataset): string[] {
  const errors: string[] = [];
  errors.push(...duplicateIds('source', dataset.sources));
  errors.push(...duplicateIds('node', dataset.nodes));
  errors.push(...duplicateIds('objective', dataset.objectives));
  errors.push(...duplicateIds('representation', dataset.representations));
  errors.push(...duplicateIds('strategy', dataset.strategies));
  errors.push(...duplicateIds('misconception', dataset.misconceptions));
  errors.push(...duplicateIds('textbook reference', dataset.textbookReferences));

  const sourceIds = new Set(dataset.sources.map((source) => source.id));
  const sourceTypeById = new Map(dataset.sources.map((source) => [source.id, source.type]));
  const nodeIds = new Set(dataset.nodes.map((node) => node.id));
  const topicIds = new Set(dataset.nodes.filter((node) => node.type === 'topic').map((node) => node.id));
  const objectiveIds = new Set(dataset.objectives.map((objective) => objective.id));
  const representationIds = new Set(dataset.representations.map((item) => item.id));
  const strategyIds = new Set(dataset.strategies.map((item) => item.id));
  const misconceptionIds = new Set(dataset.misconceptions.map((item) => item.id));

  errors.push(...validateSourceRefs(`Curriculum ${dataset.curriculum.id}`, dataset.curriculum.sourceRefs, sourceIds));

  for (const node of dataset.nodes) {
    if (node.parentId !== null && !nodeIds.has(node.parentId)) errors.push(`Node ${node.id} references unknown parent: ${node.parentId}`);
    errors.push(...validateSourceRefs(`Node ${node.id}`, node.sourceRefs, sourceIds));
  }

  for (const objective of dataset.objectives) {
    if (!topicIds.has(objective.topicId)) errors.push(`Objective ${objective.id} references unknown topic: ${objective.topicId}`);
    if (!nodeIds.has(objective.levelId)) errors.push(`Objective ${objective.id} references unknown level: ${objective.levelId}`);
    for (const ref of objective.sourceRefs) {
      if (sourceTypeById.get(ref.sourceId) === 'TEXTBOOK') {
        errors.push(`Objective ${objective.id} uses textbook source directly: ${ref.sourceId}; use textbookReferences instead`);
      }
    }
    for (const id of objective.prerequisiteIds) {
      if (!objectiveIds.has(id)) errors.push(`Objective ${objective.id} references unknown prerequisite: ${id}`);
    }
    for (const id of objective.representationIds) {
      if (!representationIds.has(id)) errors.push(`Objective ${objective.id} references unknown representation: ${id}`);
    }
    for (const id of objective.strategyIds) {
      if (!strategyIds.has(id)) errors.push(`Objective ${objective.id} references unknown strategy: ${id}`);
    }
    for (const id of objective.misconceptionIds) {
      if (!misconceptionIds.has(id)) errors.push(`Objective ${objective.id} references unknown misconception: ${id}`);
    }
    errors.push(...validateSourceRefs(`Objective ${objective.id}`, objective.sourceRefs, sourceIds));
  }

  for (const representation of dataset.representations) errors.push(...validateSourceRefs(`Representation ${representation.id}`, representation.sourceRefs, sourceIds));
  for (const strategy of dataset.strategies) errors.push(...validateSourceRefs(`Strategy ${strategy.id}`, strategy.sourceRefs, sourceIds));
  for (const misconception of dataset.misconceptions) errors.push(...validateSourceRefs(`Misconception ${misconception.id}`, misconception.sourceRefs, sourceIds));

  for (const reference of dataset.textbookReferences) {
    if (!sourceIds.has(reference.sourceId)) errors.push(`Textbook reference ${reference.id} references unknown source: ${reference.sourceId}`);
    if (sourceTypeById.get(reference.sourceId) !== 'TEXTBOOK') errors.push(`Textbook reference ${reference.id} source is not a textbook: ${reference.sourceId}`);
    if (!TEXTBOOK_RELATIONSHIPS.has(reference.relationship)) errors.push(`Textbook reference ${reference.id} has invalid relationship: ${String(reference.relationship)}`);
    for (const id of reference.objectiveIds) {
      if (!objectiveIds.has(id)) errors.push(`Textbook reference ${reference.id} references unknown objective: ${id}`);
    }
  }

  errors.push(...findPrerequisiteCycles(dataset));
  return [...new Set(errors)].sort();
}

export function assertValidCurriculumDataset(dataset: CurriculumDataset): void {
  const errors = validateCurriculumDataset(dataset);
  if (errors.length > 0) throw new Error(`Invalid curriculum dataset:\n${errors.join('\n')}`);
}
