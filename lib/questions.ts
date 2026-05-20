import fs from 'node:fs';
import path from 'node:path';
import type { Question } from './types';

const QUESTIONS_DIR = path.join(process.cwd(), 'questions');
const AVAILABLE_IDS = ['Q05', 'Q18'] as const;

export function listQuestionIds(): string[] {
  return [...AVAILABLE_IDS];
}

export function loadQuestion(id: string): Question {
  if (!AVAILABLE_IDS.includes(id as typeof AVAILABLE_IDS[number])) {
    throw new Error(`Unknown question id: ${id}`);
  }
  const filePath = path.join(QUESTIONS_DIR, `${id}.json`);
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as Question;
}
