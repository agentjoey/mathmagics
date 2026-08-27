import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireNonProductionDatabase } from './pilot-database-guard.ts';
import type { PilotRunnerEnvironment } from './migrate-test-database.ts';

export const PILOT_NEON_TEST_FILES = [
  'tests/persistence-neon-contract.test.ts',
  'tests/persistence-neon-practice-contract.test.ts',
  'tests/persistence-neon-homework-contract.test.ts',
  'tests/persistence-neon-correction-contract.test.ts',
  'tests/persistence-neon-phase7-contract.test.ts',
  'tests/pilot-neon-full-loop.test.ts',
] as const;

export function buildVerificationEnvironment(env: PilotRunnerEnvironment): PilotRunnerEnvironment {
  const testUrl = requireNonProductionDatabase(env);
  const childEnv: PilotRunnerEnvironment = {
    ...env,
    TEST_DATABASE_URL: testUrl,
  };
  delete childEnv.DATABASE_URL;
  return childEnv;
}

export function runPilotNeonVerification(env: PilotRunnerEnvironment = process.env): number {
  const result = spawnSync('npx', ['vitest', 'run', ...PILOT_NEON_TEST_FILES], {
    stdio: 'inherit',
    env: buildVerificationEnvironment(env) as NodeJS.ProcessEnv,
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
  process.exit(runPilotNeonVerification());
}
