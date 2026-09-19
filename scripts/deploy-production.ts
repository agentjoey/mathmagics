import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PRODUCTION_STATE_PATH,
  assertCleanStatus,
  assertExactMigrationChain,
  assertProductionDatabaseEnvironment,
  assertSourceSha,
  buildProductionState,
  parseProductionDeploymentUrl,
  writeDeliveryEvidence,
} from './production-delivery.ts';

function run(command: string, args: string[], options: { capture?: boolean; env?: NodeJS.ProcessEnv } = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    env: options.env ?? process.env,
    shell: false,
  });
  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) {
    const detail = options.capture ? `\n${result.stdout ?? ''}\n${result.stderr ?? ''}` : '';
    throw new Error(`${command} ${args.join(' ')} failed with exit ${result.status}.${detail}`);
  }
  return result;
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && fileURLToPath(import.meta.url) === resolve(entry);
}

export function runProductionDeploy(): void {
  assertCleanStatus(run('git', ['status', '--porcelain'], { capture: true }).stdout ?? '');
  const sourceSha = assertSourceSha(run('git', ['rev-parse', 'HEAD'], { capture: true }).stdout ?? '');
  assertExactMigrationChain(readdirSync('migrations'));

  // Fetch Production Vercel environment only inside the child process. This avoids writing
  // DATABASE_URL or other Production secrets into repository files or GrandeGPT config.
  const envCheck = run('vercel', [
    'env', 'run', '-e', 'production', '--',
    'node', '-e',
    `const u=new URL(process.env.DATABASE_URL||'');if(!u.hostname.includes('ap-southeast-1'))process.exit(42);if(process.env.TEST_DATABASE_URL&&process.env.TEST_DATABASE_URL===process.env.DATABASE_URL)process.exit(43)`,
  ]);
  void envCheck;

  // Drizzle receives DATABASE_URL from the Vercel Production environment.
  run('vercel', ['env', 'run', '-e', 'production', '--', 'npm', 'run', 'db:migrate']);

  const deployed = run('vercel', ['deploy', '--prod', '--yes', '--no-color'], { capture: true });
  const combined = `${deployed.stdout ?? ''}\n${deployed.stderr ?? ''}`;
  const deploymentId = parseProductionDeploymentUrl(combined);
  const state = buildProductionState(sourceSha, deploymentId);

  mkdirSync(dirname(PRODUCTION_STATE_PATH), { recursive: true });
  writeFileSync(PRODUCTION_STATE_PATH, JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 });
  writeDeliveryEvidence(process.env.GRANDE_DELIVERY_EVIDENCE_FILE, state);

  process.stdout.write(`Production deployment recorded: ${deploymentId}\n`);
}

if (isDirectExecution()) {
  try {
    // Validation helper is imported/tested independently; this call documents the intended
    // Production environment invariant and guards direct execution when env is already present.
    if (process.env.DATABASE_URL) assertProductionDatabaseEnvironment(process.env);
    runProductionDeploy();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
