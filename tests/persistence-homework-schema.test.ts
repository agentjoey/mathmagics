import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import * as schema from '@/lib/persistence/schema';

describe('Phase 5 homework persistence schema', () => {
  it('exports the three structured homework tables without raw image storage', () => {
    expect(getTableName(schema.homeworkSubmissions)).toBe('homework_submissions');
    expect(getTableName(schema.homeworkProblems)).toBe('homework_problems');
    expect(getTableName(schema.homeworkConfirmations)).toBe('homework_confirmations');

    const text = readFileSync(join(process.cwd(), 'lib/persistence/schema.ts'), 'utf8');
    expect(text).not.toMatch(/raw.?image|base64|object.?url|blob.?url/i);
  });

  it('generalizes attempts with exclusive PRACTICE/HOMEWORK coordinates', () => {
    const attempts = schema.attempts;
    expect(attempts.sourceKind).toBeDefined();
    expect(attempts.homeworkSubmissionId).toBeDefined();
    expect(attempts.homeworkProblemId).toBeDefined();
  });

  it('has a Phase 5 migration for homework tables, source backfill, and exclusivity check', () => {
    const dir = join(process.cwd(), 'migrations');
    const migrationName = readdirSync(dir).find((name) => name.startsWith('0002_') && name.endsWith('.sql'));
    if (!migrationName) throw new Error('Phase 5 migration 0002_* is missing');
    const sql = readFileSync(join(dir, migrationName), 'utf8');
    expect(sql).toContain('CREATE TABLE "homework_submissions"');
    expect(sql).toContain('CREATE TABLE "homework_problems"');
    expect(sql).toContain('CREATE TABLE "homework_confirmations"');
    expect(sql).toContain('source_kind');
    expect(sql).toContain('homework_submission_id');
    expect(sql).toContain('homework_problem_id');
    expect(sql).toContain('attempt_source_coordinates_ck');
    expect(sql).toContain("'PRACTICE'");
    expect(sql).not.toMatch(/mastery_state|readiness_state|ability_score|mistakes/i);
  });
});
