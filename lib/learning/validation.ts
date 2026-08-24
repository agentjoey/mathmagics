import { getLearningObjective, loadCurriculumDataset } from '@/lib/curriculum';
import type { CurriculumDataset, CurriculumNode } from '@/lib/curriculum';
import type { CurrentPositionAssumption, EvidenceRecord, StudentLevel, StudentProfile } from './types';

function requireNonEmpty(value: string, field: string): void {
  if (!value.trim()) throw new Error(`${field} must be non-empty`);
}

function parseTimestamp(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (!value || Number.isNaN(parsed)) throw new Error(`${field} must be a valid ISO date-time string`);
  return parsed;
}

function isStudentLevel(value: string): value is StudentLevel {
  return value === 'P2' || value === 'P3';
}

function datasetOrDefault(dataset?: CurriculumDataset): CurriculumDataset {
  return dataset ?? loadCurriculumDataset();
}

function getTopicNode(topicId: string, dataset: CurriculumDataset): CurriculumNode {
  const topic = dataset.nodes.find((node) => node.id === topicId && node.type === 'topic');
  if (!topic) throw new Error(`Unknown curriculum topic id: ${topicId}`);
  return topic;
}

function levelForNode(node: CurriculumNode, dataset: CurriculumDataset): StudentLevel {
  let current: CurriculumNode | undefined = node;
  const visited = new Set<string>();

  while (current) {
    if (visited.has(current.id)) throw new Error(`Curriculum node parent cycle at: ${current.id}`);
    visited.add(current.id);

    if (current.type === 'level') {
      if (!isStudentLevel(current.id)) throw new Error(`Unsupported curriculum level id: ${current.id}`);
      return current.id;
    }

    if (!current.parentId) break;
    current = dataset.nodes.find((candidate) => candidate.id === current!.parentId);
  }

  throw new Error(`Curriculum node ${node.id} is not attached to a supported level`);
}

export function assertValidStudentProfile(student: StudentProfile): void {
  requireNonEmpty(student.id, 'student id');
  requireNonEmpty(student.displayName, 'displayName');
  if (!isStudentLevel(student.levelId)) throw new Error('levelId must be P2 or P3');
  if (student.learningMode !== 'FOLLOW_SCHOOL' && student.learningMode !== 'STRUCTURED_HOME_LEARNING') {
    throw new Error('learningMode must be FOLLOW_SCHOOL or STRUCTURED_HOME_LEARNING');
  }
  if (!Number.isInteger(student.sessionsPerWeek) || student.sessionsPerWeek < 1 || student.sessionsPerWeek > 7) {
    throw new Error('sessionsPerWeek must be an integer from 1 through 7');
  }
  if (!Number.isInteger(student.minutesPerSession) || student.minutesPerSession <= 0) {
    throw new Error('minutesPerSession must be a positive integer');
  }

  const createdAt = parseTimestamp(student.createdAt, 'createdAt');
  const updatedAt = parseTimestamp(student.updatedAt, 'updatedAt');
  if (updatedAt < createdAt) throw new Error('updatedAt must not precede createdAt');
}

export function assertValidCurrentPosition(
  student: StudentProfile,
  position: CurrentPositionAssumption,
  dataset?: CurriculumDataset,
): void {
  assertValidStudentProfile(student);
  if (position.studentId !== student.id) throw new Error('current position studentId must match student id');
  if (position.levelId !== student.levelId) throw new Error('current position levelId must match student active level');
  if (!position.topicId && !position.objectiveId) {
    throw new Error('current position requires topicId or objectiveId');
  }
  parseTimestamp(position.recordedAt, 'recordedAt');

  const resolved = datasetOrDefault(dataset);
  let topic: CurriculumNode | undefined;
  if (position.topicId) {
    topic = getTopicNode(position.topicId, resolved);
    if (levelForNode(topic, resolved) !== student.levelId) {
      throw new Error(`current position topic must belong to student active level ${student.levelId}`);
    }
  }

  if (position.objectiveId) {
    const objective = getLearningObjective(position.objectiveId, resolved);
    if (objective.levelId !== student.levelId) {
      throw new Error(`current position objective must belong to student active level ${student.levelId}`);
    }
    if (topic && objective.topicId !== topic.id) {
      throw new Error(`current position objective ${objective.id} does not belong to topic ${topic.id}`);
    }
  }
}

export function assertValidEvidenceRecord(
  student: StudentProfile,
  record: EvidenceRecord,
  dataset?: CurriculumDataset,
): void {
  assertValidStudentProfile(student);
  requireNonEmpty(record.id, 'evidence id');
  requireNonEmpty(record.studentId, 'evidence studentId');
  requireNonEmpty(record.objectiveId, 'evidence objectiveId');
  if (record.studentId !== student.id) throw new Error('evidence studentId must match student id');

  const resolved = datasetOrDefault(dataset);
  const objective = getLearningObjective(record.objectiveId, resolved);
  if (student.levelId === 'P2' && objective.levelId === 'P3') {
    throw new Error('cannot record P3 evidence for P2 student');
  }

  const observedAt = parseTimestamp(record.observedAt, 'observedAt');
  const recordedAt = parseTimestamp(record.recordedAt, 'recordedAt');
  if (recordedAt < observedAt) throw new Error('recordedAt must not precede observedAt');
  if (record.origin.refId !== undefined && !record.origin.refId.trim()) {
    throw new Error('origin.refId must be non-empty when provided');
  }
}
