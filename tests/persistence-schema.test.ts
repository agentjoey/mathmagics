import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  currentPositions,
  dailyLessons,
  evidenceRecords,
  lessonBriefs,
  lessonExecutionEvents,
  students,
  weeklyPlans,
} from '@/lib/persistence/schema';

describe('Phase 3 persistence schema', () => {
  it('exports exactly the approved durable table names', () => {
    expect([
      students,
      currentPositions,
      evidenceRecords,
      weeklyPlans,
      dailyLessons,
      lessonExecutionEvents,
      lessonBriefs,
    ].map(getTableName)).toEqual([
      'students',
      'current_positions',
      'evidence_records',
      'weekly_plans',
      'daily_lessons',
      'lesson_execution_events',
      'lesson_briefs',
    ]);
  });

  it('commits a migration without mutable mastery/readiness persistence', () => {
    const sql = readFileSync(join(process.cwd(), 'migrations/0000_phase3_learning_and_planning.sql'), 'utf8');
    expect(sql).toContain('CREATE TABLE "students"');
    expect(sql).toContain('CREATE TABLE "evidence_records"');
    expect(sql).toContain('CREATE TABLE "weekly_plans"');
    expect(sql).toContain('CREATE TABLE "lesson_execution_events"');
    expect(sql).not.toContain('mastery_state');
    expect(sql).not.toContain('readiness_state');
    expect(sql).not.toContain('learning_position');
  });
});
