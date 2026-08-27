import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireNonProductionDatabase } from './pilot-database-guard.ts';

export interface PilotRunnerEnvironment extends Record<string, string | undefined> {
  TEST_DATABASE_URL?: string;
  DATABASE_URL?: string;
}

export function buildMigrationEnvironment(env: PilotRunnerEnvironment): PilotRunnerEnvironment {
  const testUrl = requireNonProductionDatabase(env);
  return {
    ...env,
    TEST_DATABASE_URL: testUrl,
    DATABASE_URL: testUrl,
  };
}

export function runTestDatabaseMigration(env: PilotRunnerEnvironment = process.env): number {
  const result = spawnSync('npm', ['run', 'db:migrate'], {
    stdio: 'inherit',
    env: buildMigrationEnvironment(env) as NodeJS.ProcessEnv,
    shell: false,
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && fileURLToPath(import.meta.url) === resolve(entry);
}

if (isDirectExecution()) {
  process.exit(runTestDatabaseMigration());
}
