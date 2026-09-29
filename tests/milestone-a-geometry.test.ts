import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Authoring QA only: geometry fixtures are not a deployed lesson or a production grader.
type Cell = [number, number];
type Case =
  | { id: string; kind: 'sides' | 'square_identity'; vertices: Cell[]; answer: string }
  | { id: string; kind: 'turn'; start: string; quarterTurns: number; answer: string }
  | { id: string; kind: 'squares'; rows: string[]; bySize: Record<string, number>; answer: string }
  | { id: string; kind: 'fit_demo'; target: Cell[]; piece: Cell[]; quarterTurns: number; answer: string }
  | { id: string; kind: 'fit'; target: Cell[]; options: Record<string, Cell[]>; answer: string };
const base = resolve(process.cwd(), 'docs/milestone-a/lessons');
const file = resolve(base, 'pre-a-geometry.md');
function load(): { authorOnly: boolean; cases: Case[] } {
  return JSON.parse(readFileSync(resolve(base, 'pre-a-geometry-fixtures.json'), 'utf8'));
}
function normalized(cells: Cell[]): string {
  const minX = Math.min(...cells.map(([x]) => x));
  const minY = Math.min(...cells.map(([, y]) => y));
  return cells.map(([x, y]) => `${x - minX},${y - minY}`).sort().join(';');
}
function rotate(cells: Cell[], turns: number): Cell[] {
  let result = cells;
  for (let i = 0; i < turns; i++) result = result.map(([x, y]) => [-y, x]);
  return result;
}
function fits(piece: Cell[], target: Cell[]): boolean {
  return [0, 1, 2, 3].some((n) => normalized(rotate(piece, n)) === normalized(target));
}
function edge(a: Cell, b: Cell): string {
  return [`${a[0]},${a[1]}`, `${b[0]},${b[1]}`].sort().join('|');
}
function squareCounts(rows: string[]): Record<string, number> {
  const lines = new Set<string>();
  rows.forEach((row, y) => [...row].forEach((cell, x) => {
    if (cell !== '#') return;
    const p: Cell[] = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]];
    p.forEach((point, i) => lines.add(edge(point, p[(i + 1) % 4])));
  }));
  const counts: Record<string, number> = {};
  for (let size = 1; size <= Math.min(rows.length, rows[0].length); size++) {
    for (let y = 0; y + size <= rows.length; y++) {
      for (let x = 0; x + size <= rows[0].length; x++) {
        const sides: string[] = [];
        for (let i = 0; i < size; i++) {
          sides.push(edge([x + i, y], [x + i + 1, y]), edge([x + i, y + size], [x + i + 1, y + size]));
          sides.push(edge([x, y + i], [x, y + i + 1]), edge([x + size, y + i], [x + size, y + i + 1]));
        }
        if (sides.every((segment) => lines.has(segment))) counts[size] = (counts[size] ?? 0) + 1;
      }
    }
  }
  return counts;
}

describe('Milestone A4 geometry design', () => {
  it('contains all 15 authored cases, matching prose answers and explicit difficulty limits', () => {
    const pack = load();
    const text = readFileSync(file, 'utf8');
    expect(pack.authorOnly).toBe(true);
    expect(pack.cases).toHaveLength(15);
    const rows = text.split('\n').filter((line) => /^\| A4-(PRE|W|G|I|X|R)\d+ \|/.test(line));
    expect(rows).toHaveLength(15);
    expect(new Set(pack.cases.map(({ id }) => id)).size).toBe(15);
    for (const c of pack.cases) {
      const row = rows.find((r) => r.split('|')[1].trim() === c.id);
      expect(row, c.id).toBeDefined();
      expect(row!.split('|')[4].trim(), c.id).toBe(c.answer);
    }
    for (const phrase of ['H1', 'H2', 'H3', '恢复', '不是官方真题', '待样题校准', '不改变核心课程 Mastery']) expect(text).toContain(phrase);
  });

  it('checks the rotated triangle and square without equating a tilt with a shape change', () => {
    for (const c of load().cases) {
      if (c.kind !== 'sides' && c.kind !== 'square_identity') continue;
      expect(new Set(c.vertices.map(([x, y]) => `${x},${y}`)).size).toBe(c.vertices.length);
      expect(String(c.vertices.length)).toBe(c.answer);
      const vectors = c.vertices.map(([x, y], i) => {
        const next = c.vertices[(i + 1) % c.vertices.length];
        return [next[0] - x, next[1] - y];
      });
      if (c.kind === 'square_identity') {
        expect(vectors).toHaveLength(4);
        expect(new Set(vectors.map(([x, y]) => x * x + y * y)).size).toBe(1);
        vectors.forEach(([x, y], i) => expect(x * vectors[(i + 1) % 4][0] + y * vectors[(i + 1) % 4][1]).toBe(0));
      }
    }
  });

  it('checks each direction change in the explicitly clockwise cycle', () => {
    const directions = ['UP', 'RIGHT', 'DOWN', 'LEFT'];
    for (const c of load().cases) {
      if (c.kind !== 'turn') continue;
      expect(directions).toContain(c.start);
      expect(directions[(directions.indexOf(c.start) + c.quarterTurns) % 4], c.id).toBe(c.answer);
    }
  });

  it('enumerates squares from drawn unit edges, including large and overlapping squares', () => {
    for (const c of load().cases) {
      if (c.kind !== 'squares') continue;
      expect(c.rows.every((r) => r.length === c.rows[0].length && /^[#.]+$/.test(r))).toBe(true);
      const counts = squareCounts(c.rows);
      expect(counts, c.id).toEqual(c.bySize);
      expect(String(Object.values(counts).reduce((a, b) => a + b, 0)), c.id).toBe(c.answer);
    }
  });

  it('checks exact cells and a unique answer among five pieces without reflection', () => {
    for (const c of load().cases) {
      if (c.kind !== 'fit' && c.kind !== 'fit_demo') continue;
      const pieces = c.kind === 'fit' ? Object.values(c.options) : [c.piece];
      for (const cells of [c.target, ...pieces]) {
        expect(cells).toHaveLength(4);
        expect(new Set(cells.map(([x, y]) => `${x},${y}`)).size).toBe(4);
        expect(cells.every(([x, y]) => Number.isInteger(x) && Number.isInteger(y))).toBe(true);
      }
      if (c.kind === 'fit') {
        expect(Object.keys(c.options).sort()).toEqual(['A', 'B', 'C', 'D', 'E']);
        expect(Object.entries(c.options).filter(([, p]) => fits(p, c.target)).map(([k]) => k), c.id).toEqual([c.answer]);
      } else {
        expect(normalized(rotate(c.piece, c.quarterTurns))).toBe(normalized(c.target));
      }
    }
  });

  it('rejects mirror-only fits and wrong square totals and resolves design links', () => {
    const l: Cell[] = [[0, 0], [0, 1], [0, 2], [1, 2]];
    expect(fits(l.map(([x, y]) => [-x, y]), l)).toBe(false);
    expect(squareCounts(['##', '##'])).toEqual({ 1: 4, 2: 1 });
    expect(Object.values(squareCounts(['##', '##'])).reduce((a, b) => a + b, 0)).not.toBe(4);
    const text = readFileSync(file, 'utf8');
    for (const [, target] of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      if (/^https?:\/\//.test(target) || target.startsWith('#')) continue;
      expect(existsSync(resolve(dirname(file), target.split('#')[0])), target).toBe(true);
    }
  });
});
