import { describe, expect, it } from 'vitest';
import { requireNonProductionDatabase } from '@/scripts/pilot-database-guard';

describe('pilot database guard', () => {
  it('requires explicit TEST_DATABASE_URL', () => {
    expect(() => requireNonProductionDatabase({})).toThrow('TEST_DATABASE_URL is required');
  });

  it('rejects a test url equal to production', () => {
    const url = 'postgresql://same.example/db';
    expect(() => requireNonProductionDatabase({ TEST_DATABASE_URL: url, DATABASE_URL: url }))
      .toThrow('TEST_DATABASE_URL must not equal DATABASE_URL');
  });

  it('returns an isolated explicit test url', () => {
    expect(requireNonProductionDatabase({
      TEST_DATABASE_URL: 'postgresql://test.example/db',
      DATABASE_URL: 'postgresql://prod.example/db',
    })).toBe('postgresql://test.example/db');
  });
});
