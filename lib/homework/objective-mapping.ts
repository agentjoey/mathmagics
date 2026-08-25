import { getLearningObjective } from '@/lib/curriculum';
import type { PracticeProblemSpec, WordProblemSpec } from '@/lib/practice';
import type { StudentLevel } from '@/lib/learning';
import type { TrustedHomeworkProblem } from './conversion';

export interface HomeworkObjectiveMappingResult {
  candidates: string[];
  version: 'homework-objective-map-v1';
}

interface HomeworkObjectiveMapper {
  level: StudentLevel;
  objectiveId: string;
  supports(problem: PracticeProblemSpec): boolean;
}

const P2_TABLES = new Set([2, 3, 4, 5, 10]);

function knownP2Multiplication(left: number, right: number): boolean {
  return Number.isInteger(left) && Number.isInteger(right)
    && left > 0 && right > 0
    && ((P2_TABLES.has(left) && right <= 10) || (P2_TABLES.has(right) && left <= 10));
}

function knownP2Division(total: number, divisor: number): boolean {
  if (!Number.isInteger(total) || !Number.isInteger(divisor) || divisor <= 0 || total <= 0 || total % divisor !== 0) return false;
  return knownP2Multiplication(divisor, total / divisor);
}

function isWord(problem: PracticeProblemSpec, structures: WordProblemSpec['structure'][]): problem is WordProblemSpec {
  return problem.kind === 'WORD_PROBLEM' && structures.includes(problem.structure);
}

function onlyOperations(problem: WordProblemSpec, operations: WordProblemSpec['steps'][number]['operation'][]): boolean {
  return problem.steps.length > 0 && problem.steps.every((step) => operations.includes(step.operation));
}

const MAPPERS: HomeworkObjectiveMapper[] = [
  { level: 'P2', objectiveId: 'P2-MD-001', supports: (problem) => problem.kind === 'ARITHMETIC' && problem.operation === 'MULTIPLY' && knownP2Multiplication(problem.left, problem.right) },
  { level: 'P2', objectiveId: 'P2-MD-004', supports: (problem) => problem.kind === 'ARITHMETIC' && problem.operation === 'DIVIDE' && knownP2Division(problem.left, problem.right) },
  { level: 'P2', objectiveId: 'P2-MD-002', supports: (problem) => problem.kind === 'EQUATION_CHOICE' && (problem.scenario === 'SHARING' || problem.scenario === 'GROUPING') },
  { level: 'P2', objectiveId: 'P2-MD-003', supports: (problem) => problem.kind === 'EQUATION_CHOICE' && problem.scenario === 'FACT_FAMILY' },
  { level: 'P2', objectiveId: 'P2-MD-005', supports: (problem) => isWord(problem, ['EQUAL_GROUPS', 'SHARING']) && problem.steps.length === 1 && onlyOperations(problem, ['MULTIPLY', 'DIVIDE']) },
  { level: 'P2', objectiveId: 'P2-AS-002', supports: (problem) => isWord(problem, ['PART_WHOLE', 'COMPARISON']) && onlyOperations(problem, ['ADD', 'SUBTRACT']) },
  { level: 'P3', objectiveId: 'P3-FRA-004', supports: (problem) => problem.kind === 'FRACTION_EQUIVALENT' },
  { level: 'P3', objectiveId: 'P3-FRA-002', supports: (problem) => problem.kind === 'FRACTION_SIMPLIFY' },
  { level: 'P3', objectiveId: 'P3-FRA-003', supports: (problem) => problem.kind === 'FRACTION_COMPARE' },
  { level: 'P3', objectiveId: 'P3-FRA-005', supports: (problem) => problem.kind === 'FRACTION_OPERATION' && (problem.operation === 'ADD' || problem.operation === 'SUBTRACT') },
  { level: 'P3', objectiveId: 'P3-MD-005', supports: (problem) => isWord(problem, ['EQUAL_GROUPS']) && problem.steps.length === 2 && problem.steps[0]?.operation === 'MULTIPLY' && problem.steps[1]?.operation === 'ADD' },
  { level: 'P3', objectiveId: 'P3-AS-002', supports: (problem) => isWord(problem, ['PART_WHOLE', 'COMPARISON']) && onlyOperations(problem, ['ADD', 'SUBTRACT']) },
];

for (const mapper of MAPPERS) {
  const objective = getLearningObjective(mapper.objectiveId);
  if (objective.levelId !== mapper.level) {
    throw new Error(`Homework objective map level mismatch: ${mapper.objectiveId}`);
  }
}

export function mapHomeworkObjective(level: StudentLevel, trusted: TrustedHomeworkProblem): HomeworkObjectiveMappingResult {
  const candidates = MAPPERS
    .filter((mapper) => mapper.level === level && mapper.supports(trusted.problemSpec))
    .map((mapper) => mapper.objectiveId);
  return { candidates, version: 'homework-objective-map-v1' };
}
