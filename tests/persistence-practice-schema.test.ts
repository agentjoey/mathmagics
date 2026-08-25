import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import * as schema from '@/lib/persistence/schema';

describe('Phase 4 practice persistence schema', () => {
  it('exports exactly the four approved Phase 4 durable fact tables', () => {
    const keys = Object.keys(schema);
    expect(keys).toEqual(expect.arrayContaining([
      'practiceSessions',
      'practiceItems',
      'practiceHintReveals',
      'attempts',
    ]));

    const tables = [
      schema.practiceSessions,
      schema.practiceItems,
      schema.practiceHintReveals,
      schema.attempts,
    ].filter(Boolean).map((table) => getTableName(table!));

    expect(tables).toEqual([
      'practice_sessions',
      'practice_items',
      'practice_hint_reveals',
      'attempts',
    ]);
  });

  it('has a generated Phase 4 migration for all four tables and no Phase 4 derived-state storage', () => {
    const migrationsDir = join(process.cwd(), 'migrations');
    const migrationName = readdirSync(migrationsDir).find((name) => name.startsWith('0001_') && name.endsWith('.sql'));
    if (!migrationName) throw new Error('Phase 4 migration 0001_* is missing');
    const incremental = readFileSync(join(migrationsDir, migrationName), 'utf8');

    expect(incremental).toContain('CREATE TABLE "practice_sessions"');
    expect(incremental).toContain('CREATE TABLE "practice_items"');
    expect(incremental).toContain('CREATE TABLE "practice_hint_reveals"');
    expect(incremental).toContain('CREATE TABLE "attempts"');
    expect(incremental).toContain('practice_session_lesson_objective_uq');
    expect(incremental).toContain('practice_item_session_sequence_uq');
    expect(incremental).toContain('practice_hint_student_item_uq');
    expect(incremental).toContain('attempt_retry_parent_uq');
    expect(incremental).not.toContain('mastery_state');
    expect(incremental).not.toContain('readiness_state');
    expect(incremental).not.toContain('practice_status');
    expect(incremental).not.toContain('ability_score');
    expect(incremental).not.toContain('mistakes');
  });
});
