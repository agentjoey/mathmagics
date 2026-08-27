import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildMigrationEnvironment } from '@/scripts/migrate-test-database';
import {
  buildVerificationEnvironment,
  PILOT_NEON_TEST_FILES,
  PILOT_NEON_VITEST_ARGS,
} from '@/scripts/verify-pilot-neon';

describe('pilot database runners', () => {
  it('maps only the validated TEST_DATABASE_URL into the migration child DATABASE_URL', () => {
    const env = buildMigrationEnvironment({
      TEST_DATABASE_URL: 'postgresql://test.example/db',
      DATABASE_URL: 'postgresql://prod.example/db',
      KEEP_ME: 'yes',
    });

    expect(env.TEST_DATABASE_URL).toBe('postgresql://test.example/db');
    expect(env.DATABASE_URL).toBe('postgresql://test.example/db');
    expect(env.KEEP_ME).toBe('yes');
  });

  it('fails closed before mapping when test and production urls are equal', () => {
    const url = 'postgresql://same.example/db';
    expect(() => buildMigrationEnvironment({ TEST_DATABASE_URL: url, DATABASE_URL: url }))
      .toThrow('TEST_DATABASE_URL must not equal DATABASE_URL');
  });

  it('removes production DATABASE_URL from the Neon verification child environment', () => {
    const env = buildVerificationEnvironment({
      TEST_DATABASE_URL: 'postgresql://test.example/db',
      DATABASE_URL: 'postgresql://prod.example/db',
      KEEP_ME: 'yes',
    });

    expect(env.TEST_DATABASE_URL).toBe('postgresql://test.example/db');
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.KEEP_ME).toBe('yes');
  });

  it('uses the fixed approved Neon contract whitelist', () => {
    expect(PILOT_NEON_TEST_FILES).toEqual([
      'tests/persistence-neon-contract.test.ts',
      'tests/persistence-neon-practice-contract.test.ts',
      'tests/persistence-neon-homework-contract.test.ts',
      'tests/persistence-neon-correction-contract.test.ts',
      'tests/persistence-neon-phase7-contract.test.ts',
      'tests/pilot-neon-full-loop.test.ts',
    ]);
  });

  it('serializes live Neon files and gives remote integration work an explicit timeout', () => {
    expect(PILOT_NEON_VITEST_ARGS).toEqual([
      'vitest',
      'run',
      '--no-file-parallelism',
      '--testTimeout=120000',
      ...PILOT_NEON_TEST_FILES,
    ]);
  });

  it('exposes the safe Node-native pilot scripts through package.json', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };

    expect(pkg.scripts?.['db:migrate:test']).toBe('node scripts/migrate-test-database.ts');
    expect(pkg.scripts?.['verify:pilot-neon']).toBe('node scripts/verify-pilot-neon.ts');
  });
});
