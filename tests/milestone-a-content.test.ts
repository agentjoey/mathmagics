import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// Design-document checks only. This is not a production grader or lesson schema.
const root = process.cwd();
const pack = 'docs/milestone-a';
const lessons = [
  { file: 'p2-count-tens-hundreds.md', prefix: 'A1', equations: 26, questions: 13 },
  { file: 'p2-equal-groups-multiply-divide.md', prefix: 'A2', equations: 16, questions: 12 },
  { file: 'p3-bar-model-two-step.md', prefix: 'A3', equations: 21, questions: 11 },
];
const documents = [
  'README.md', '.agent/CURRENT.md', '.agent/BACKLOG.md',
  'docs/superpowers/specs/2026-09-29-mathmagics-learning-product-roadmap.md',
  ...['README.md', 'classroom-and-lesson-pack.md', 'sources.md', 'acceptance.md'].map((name) => `${pack}/${name}`),
  ...lessons.map(({ file }) => `${pack}/lessons/${file}`),
];

function arithmetic(input: string): number {
  const expression = input.replace(/\s+/g, '');
  if (!/^\d+(?:[+\-*/]\d+)*$/.test(expression)) throw new Error('Unsupported expression');
  const terms = expression.match(/[+-]?\d+(?:[*/]\d+)*/g) ?? [];
  if (terms.join('') !== expression) throw new Error('Incomplete expression');
  return terms.reduce((sum, term) => {
    const sign = term.startsWith('-') ? -1 : 1;
    const tokens = term.replace(/^[+-]/, '').match(/\d+|[*/]/g)!;
    let value = Number(tokens[0]);
    for (let i = 1; i < tokens.length; i += 2) {
      const operand = Number(tokens[i + 1]);
      if (tokens[i] === '/' && operand === 0) throw new Error('Division by zero');
      value = tokens[i] === '*' ? value * operand : value / operand;
    }
    return sum + sign * value;
  }, 0);
}

describe('Milestone A document arithmetic', () => {
  it('checks arithmetic without executing text as code', () => {
    expect(arithmetic('470 + 3 * 10')).toBe(500);
    expect(arithmetic('34 - 24')).toBe(10);
    expect(arithmetic('20 / 4')).toBe(5);
    expect(() => arithmetic('process.exit()')).toThrow();
    expect(() => arithmetic('2 ** 3')).toThrow();
    expect(() => arithmetic('1 / 0')).toThrow();
    // A changed answer must not silently agree with the arithmetic oracle.
    expect(arithmetic('470 + 3 * 10')).not.toBe(501);
  });

  for (const lesson of lessons) {
    const text = readFileSync(resolve(root, pack, 'lessons', lesson.file), 'utf8');
    const equations = [...text.matchAll(/^(A[123]-[A-Z]+\d+(?:-[abc])?): ([\d\s+*/-]+) = (\d+)$/gm)];
    const questions = text.split('\n').filter((line) => /^\| A[123]-(?:PRE|W|G|I|X|R)\d+ \|/.test(line));

    it(`${lesson.prefix} has the complete authored question and proof inventory`, () => {
      expect(equations).toHaveLength(lesson.equations);
      expect(questions).toHaveLength(lesson.questions);
      const ids = questions.map((line) => line.split('|')[1].trim());
      expect(new Set(ids).size).toBe(ids.length);
      expect(new Set(equations.map((row) => row[1])).size).toBe(equations.length);
      for (const id of ids) expect(equations.some((row) => row[1].replace(/-[abc]$/, '') === id), id).toBe(true);
      expect(text).toContain('ready for design review');
      expect(text).toContain('H1');
      expect(text).toContain('H2');
      expect(text).toContain('H3');
      expect(text).toContain('恢复');
    });

    for (const [, id, expression, expectedText] of equations) {
      it(`${id}: ${expression} = ${expectedText}`, () => {
        const expected = Number(expectedText);
        expect(arithmetic(expression)).toBe(expected);
        expect(Number.isInteger(expected)).toBe(true);
        const baseId = id.replace(/-[abc]$/, '');
        const row = questions.find((line) => line.split('|')[1].trim() === baseId);
        expect(row, `Missing question row for ${baseId}`).toBeDefined();
        const answerCell = row!.split('|')[4];
        const numbers = (answerCell.match(/\d+/g) ?? []).map(Number);
        expect(numbers, `${baseId} prose answer disagrees with proof`).toContain(expected);
      });
    }
  }
});

describe('Milestone A document integrity', () => {
  it('resolves local links in every new entry document', () => {
    for (const file of documents) {
      expect(existsSync(resolve(root, file)), file).toBe(true);
      const text = readFileSync(resolve(root, file), 'utf8');
      for (const [, target] of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
        if (/^https?:\/\//.test(target) || target.startsWith('#')) continue;
        const destination = resolve(root, dirname(file), target.split('#')[0]);
        expect(destination.startsWith(`${root}${sep}`), target).toBe(true);
        expect(existsSync(destination), `${file} → ${target}`).toBe(true);
      }
    }
  });

  it('preserves the former status and backlog byte-for-byte', () => {
    const archived = [
      ['.agent/history/2026-09-29-pre-milestone-a-current.md', '4b32a2838c9bc3e7153f9cb77db6ddfd34007a822e42899c64db2d9fa742b192'],
      ['.agent/history/2026-09-29-pre-milestone-a-backlog.md', 'f15a3fc261750582e8e28f5c09be2429ae7dddf75acc5b75cc6149cf545cba76'],
    ];
    for (const [file, expected] of archived) {
      const actual = createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex');
      expect(actual, file).toBe(expected);
    }
  });
});
