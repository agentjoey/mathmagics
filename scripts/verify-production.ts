import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GRANDE_PRODUCTION_TARGET,
  PRODUCTION_STATE_PATH,
  assertSourceSha,
  writeDeliveryEvidence,
  type ProductionDeploymentState,
} from './production-delivery.ts';

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env, shell: false });
  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit ${result.status}.`);
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && fileURLToPath(import.meta.url) === resolve(entry);
}

function readState(): ProductionDeploymentState {
  const parsed = JSON.parse(readFileSync(PRODUCTION_STATE_PATH, 'utf8')) as ProductionDeploymentState;
  if (parsed.target !== GRANDE_PRODUCTION_TARGET) throw new Error('Production deployment state target mismatch.');
  assertSourceSha(parsed.sourceSha);
  if (!parsed.deploymentId?.startsWith('https://')) throw new Error('Production deployment state has invalid deploymentId.');
  return parsed;
}

function cookieFrom(setCookie: string | null): string {
  const match = setCookie?.match(/(?:^|,\s*)(mm_session=[^;]+)/);
  if (!match) throw new Error('Production auth did not return mm_session cookie.');
  return match[1];
}

async function requireStatus(url: string, init: RequestInit, expected: number, label: string): Promise<Response> {
  const response = await fetch(url, { redirect: 'manual', ...init });
  if (response.status !== expected) {
    const body = await response.text().catch(() => '');
    throw new Error(`${label} expected HTTP ${expected}, got ${response.status}: ${body.slice(0, 300)}`);
  }
  return response;
}

async function innerVerify(): Promise<void> {
  const state = readState();
  const sitePassword = process.env.SITE_PASSWORD;
  if (!sitePassword) throw new Error('Production SITE_PASSWORD is missing.');

  const auth = await requireStatus(
    `${state.deploymentId}/api/auth`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: sitePassword }),
    },
    200,
    'auth',
  );
  const cookie = cookieFrom(auth.headers.get('set-cookie'));
  const headers = { cookie };

  await requireStatus(`${state.deploymentId}/pilot`, { headers }, 200, 'pilot entry');
  await requireStatus(`${state.deploymentId}/pilot/student`, { headers }, 200, 'student page');
  await requireStatus(`${state.deploymentId}/pilot/parent`, { headers }, 200, 'parent page');

  const smokeStudent = '__mathmagics_production_smoke_missing_student__';
  await requireStatus(
    `${state.deploymentId}/api/pilot/review?studentId=${encodeURIComponent(smokeStudent)}`,
    { headers },
    404,
    'PilotReview read path',
  );
  await requireStatus(
    `${state.deploymentId}/api/learning/next?studentId=${encodeURIComponent(smokeStudent)}`,
    { headers },
    404,
    'next-lesson read path',
  );

  writeDeliveryEvidence(process.env.GRANDE_DELIVERY_EVIDENCE_FILE, state);
  process.stdout.write(`Production smoke passed: ${state.deploymentId}\n`);
}

export function runProductionVerify(): void {
  if (process.argv.includes('--with-production-env')) {
    void innerVerify().catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
    return;
  }

  run('vercel', [
    'env', 'run', '-e', 'production', '--',
    'node', 'scripts/verify-production.ts', '--with-production-env',
  ]);
}

if (isDirectExecution()) {
  try {
    runProductionVerify();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
