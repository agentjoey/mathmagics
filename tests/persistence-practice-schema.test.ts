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

  it('has a generated incremental migration for all four Phase 4 tables and no derived-state storage', () => {
    const migrationsDir = join(process.cwd(), 'migrations');
    const sqlFiles = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();
    expect(sqlFiles.length).toBeGreaterThanOrEqual(2);
    const incremental = sqlFiles.slice(1).map((name) => readFileSync(join(migrationsDir, name), 'utf8')).join('\n');

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
