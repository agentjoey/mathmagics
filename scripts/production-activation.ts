import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const VERCEL_SCOPE = 'agentjoeys-projects';
export const VERCEL_PROJECT = 'mathmagics';
export const DELIVERY_TARGET = 'production';
export const DEPLOYMENT_STATE_PATH = '.vercel/grande-production-deployment.json';
export const SMOKE_STUDENT_ID = 'production-smoke-missing-student';

export const EXPECTED_MIGRATIONS = [
  '0000_old_bushwacker.sql',
  '0001_fantastic_shocker.sql',
  '0002_gorgeous_obadiah_stane.sql',
  '0003_stale_mercury.sql',
  '0004_strange_meteorite.sql',
] as const;

export const EXPECTED_MIGRATION_META = [
  '0000_snapshot.json',
  '0001_snapshot.json',
  '0002_snapshot.json',
  '0003_snapshot.json',
  '0004_snapshot.json',
] as const;

export interface DeploymentEvidence {
  target: string;
  deploymentId: string;
  sourceSha: string;
}

export interface DatabaseProbe {
  hostname: string;
  fingerprint: string;
}

export interface ActivationEnvironment extends Record<string, string | undefined> {
  DATABASE_URL?: string;
  GRANDE_DELIVERY_EVIDENCE_FILE?: string;
  SITE_PASSWORD?: string;
  SESSION_SECRET?: string;
  TMPDIR?: string;
}

interface CommandResult {
  status: number;
  stdout: string;
  stderr: string;
}

export interface CommandOptions {
  input?: string;
  inherit?: boolean;
}

export type CommandRunner = (
  command: string,
  args: readonly string[],
  options?: CommandOptions,
) => CommandResult;

function formatFailure(command: string, args: readonly string[], result: CommandResult): string {
  const tail = result.stderr.trim().slice(-2000);
  return `${command} ${args.join(' ')} failed with exit ${result.status}${tail ? `: ${tail}` : ''}`;
}

export const defaultCommandRunner: CommandRunner = (command, args, options = {}) => {
  const result = spawnSync(command, [...args], {
    encoding: 'utf8',
    input: options.input,
    stdio: options.inherit ? 'inherit' : ['pipe', 'pipe', 'pipe'],
    shell: false,
  });
  if (result.error) throw result.error;
  const status = result.status ?? 1;
  const stdout = typeof result.stdout === 'string' ? result.stdout : '';
  const stderr = typeof result.stderr === 'string' ? result.stderr : '';
  if (status !== 0) throw new Error(formatFailure(command, args, { status, stdout, stderr }));
  return { status, stdout, stderr };
};

function run(
  runner: CommandRunner,
  command: string,
  args: readonly string[],
  options?: CommandOptions,
): CommandResult {
  return runner(command, args, options);
}

export function requireDeliveryEvidencePath(env: ActivationEnvironment): string {
  const path = env.GRANDE_DELIVERY_EVIDENCE_FILE?.trim();
  if (!path) throw new Error('GRANDE_DELIVERY_EVIDENCE_FILE is required');
  return path;
}

export function requireExactSourceSha(value: string): string {
  const sha = value.trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`Invalid exact source SHA: ${JSON.stringify(value)}`);
  return sha;
}

export function assertMigrationChain(root: string = process.cwd()): void {
  const sql = readdirSync(join(root, 'migrations'))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const meta = readdirSync(join(root, 'migrations', 'meta'))
    .filter((name) => /^\d{4}_snapshot\.json$/.test(name))
    .sort();

  if (JSON.stringify(sql) !== JSON.stringify(EXPECTED_MIGRATIONS)) {
    throw new Error(`Unexpected production migration chain: ${sql.join(', ')}`);
  }
  if (JSON.stringify(meta) !== JSON.stringify(EXPECTED_MIGRATION_META)) {
    throw new Error(`Unexpected migration metadata chain: ${meta.join(', ')}`);
  }
}

export function parseDatabaseProbe(raw: string): DatabaseProbe {
  const lastLine = raw.trim().split(/\r?\n/).at(-1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(lastLine ?? '');
  } catch {
    throw new Error('Database probe did not return valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Database probe must return an object');
  }
  const probe = parsed as Record<string, unknown>;
  if (typeof probe.hostname !== 'string' || probe.hostname.length === 0) {
    throw new Error('Database probe hostname is missing');
  }
  if (typeof probe.fingerprint !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(probe.fingerprint)) {
    throw new Error('Database probe fingerprint is invalid');
  }
  return { hostname: probe.hostname, fingerprint: probe.fingerprint };
}

export function assertProductionDatabaseBoundary(
  production: DatabaseProbe,
  preview: DatabaseProbe,
): void {
  if (!production.hostname.includes('ap-southeast-1')) {
    throw new Error(`Production Neon must be in Singapore (ap-southeast-1), got ${production.hostname}`);
  }
  if (production.fingerprint === preview.fingerprint) {
    throw new Error('Production and Preview DATABASE_URL fingerprints must differ');
  }
}

export function databaseProbeFromEnvironment(env: ActivationEnvironment): DatabaseProbe {
  const raw = env.DATABASE_URL?.trim();
  if (!raw) throw new Error('DATABASE_URL is required for database probe');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('DATABASE_URL is not a valid URL');
  }
  if (!url.hostname.endsWith('.neon.tech')) {
    throw new Error(`DATABASE_URL must point to Neon, got host ${url.hostname}`);
  }
  return {
    hostname: url.hostname,
    fingerprint: `sha256:${createHash('sha256').update(raw).digest('hex')}`,
  };
}

export function buildVercelLinkArgs(): readonly string[] {
  return ['link', '--yes', '--project', VERCEL_PROJECT, '--scope', VERCEL_SCOPE];
}

export function buildDatabaseProbeArgs(environment: 'production' | 'preview'): readonly string[] {
  return [
    'env', 'run', '-e', environment, '--',
    'node', 'scripts/production-activation.ts', 'db-probe',
  ];
}

export function buildProductionMigrationArgs(): readonly string[] {
  return ['env', 'run', '-e', 'production', '--', 'npm', 'run', 'db:migrate'];
}

export function buildVercelDeployArgs(sourceSha: string): readonly string[] {
  const sha = requireExactSourceSha(sourceSha);
  return [
    'deploy',
    '--prod',
    '--yes',
    '--scope', VERCEL_SCOPE,
    '--meta', 'githubDeployment=1',
    '--meta', 'githubCommitRef=main',
    '--meta', `githubCommitSha=${sha}`,
  ];
}

export function buildReadyDeploymentLookupArgs(sourceSha: string): readonly string[] {
  const sha = requireExactSourceSha(sourceSha);
  return [
    'list',
    VERCEL_PROJECT,
    '--prod',
    '--status', 'READY',
    '--meta', `githubCommitSha=${sha}`,
    '--scope', VERCEL_SCOPE,
    '--yes',
    '--no-color',
  ];
}

export function deploymentUrlFromStdout(stdout: string): string {
  const url = stdout.trim().split(/\s+/).find((value) => /^https:\/\/[^\s]+$/.test(value));
  if (!url) throw new Error('Vercel deploy did not return a deployment URL on stdout');
  return url;
}

export function writeDeploymentEvidence(path: string, evidence: DeploymentEvidence): void {
  requireExactSourceSha(evidence.sourceSha);
  if (evidence.target !== DELIVERY_TARGET) throw new Error('Unexpected deployment target');
  if (!/^https:\/\//.test(evidence.deploymentId)) throw new Error('deploymentId must be the exact Vercel deployment URL');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(evidence)}\n`, 'utf8');
}

export function readDeploymentState(root: string = process.cwd()): DeploymentEvidence {
  const path = join(root, DEPLOYMENT_STATE_PATH);
  if (!existsSync(path)) throw new Error(`Missing deployment state: ${DEPLOYMENT_STATE_PATH}`);
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as DeploymentEvidence;
  requireExactSourceSha(parsed.sourceSha);
  if (parsed.target !== DELIVERY_TARGET || !/^https:\/\//.test(parsed.deploymentId)) {
    throw new Error('Deployment state is invalid');
  }
  return parsed;
}

function writeDeploymentState(root: string, evidence: DeploymentEvidence): void {
  const path = join(root, DEPLOYMENT_STATE_PATH);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(evidence)}\n`, 'utf8');
}

export function smokeCurlArgs(
  deploymentUrl: string,
  path: string,
  cookiePath: string,
  expectedStatus: number,
  method: 'GET' | 'POST' = 'GET',
): readonly string[] {
  const args = [
    'curl',
    path,
    '--deployment', deploymentUrl,
    '--scope', VERCEL_SCOPE,
    '--no-color',
    '-sS',
    '-o', '/dev/null',
    '-w', '%{http_code}',
    '-b', cookiePath,
  ];
  if (method === 'POST') {
    args.push('-X', 'POST', '-H', 'Content-Type: application/json', '--data-binary', '@-', '-c', cookiePath);
  }
  args.push('--max-time', '30');
  return [...args, '__EXPECT__', String(expectedStatus)];
}

function runExpectedStatus(
  runner: CommandRunner,
  argsWithExpectation: readonly string[],
  input?: string,
): void {
  const marker = argsWithExpectation.lastIndexOf('__EXPECT__');
  if (marker < 0) throw new Error('Missing smoke expectation marker');
  const args = argsWithExpectation.slice(0, marker);
  const expected = Number(argsWithExpectation[marker + 1]);
  const result = run(runner, 'vercel', args, { input });
  const actual = Number(result.stdout.trim().slice(-3));
  if (actual !== expected) {
    throw new Error(`Smoke request expected HTTP ${expected}, got ${result.stdout.trim() || 'no status'}`);
  }
}

function currentSourceSha(runner: CommandRunner): string {
  const status = run(runner, 'git', ['status', '--porcelain']).stdout.trim();
  if (status) throw new Error('Production activation requires a clean canonical checkout');
  return requireExactSourceSha(run(runner, 'git', ['rev-parse', 'HEAD']).stdout);
}

function linkAndConfirmProject(runner: CommandRunner): void {
  run(runner, 'vercel', buildVercelLinkArgs());
  const inspected = run(runner, 'vercel', [
    'project', 'inspect', '--non-interactive', '--scope', VERCEL_SCOPE, '--no-color',
  ]).stdout;
  if (!inspected.toLowerCase().includes(VERCEL_PROJECT)) {
    throw new Error(`Vercel project inspection did not confirm ${VERCEL_PROJECT}`);
  }
}

function databaseBoundary(runner: CommandRunner): void {
  const production = parseDatabaseProbe(run(runner, 'vercel', buildDatabaseProbeArgs('production')).stdout);
  const preview = parseDatabaseProbe(run(runner, 'vercel', buildDatabaseProbeArgs('preview')).stdout);
  assertProductionDatabaseBoundary(production, preview);
}

export function deployProduction(
  runner: CommandRunner = defaultCommandRunner,
  env: ActivationEnvironment = process.env,
  root: string = process.cwd(),
): DeploymentEvidence {
  const evidencePath = requireDeliveryEvidencePath(env);
  const sourceSha = currentSourceSha(runner);
  assertMigrationChain(root);
  linkAndConfirmProject(runner);
  databaseBoundary(runner);

  run(runner, 'vercel', buildProductionMigrationArgs(), { inherit: true });

  const deploy = run(runner, 'vercel', buildVercelDeployArgs(sourceSha));
  const deploymentId = deploymentUrlFromStdout(deploy.stdout);
  run(runner, 'vercel', ['inspect', deploymentId, '--wait', '--scope', VERCEL_SCOPE, '--no-color']);

  const evidence = { target: DELIVERY_TARGET, deploymentId, sourceSha };
  writeDeploymentState(root, evidence);
  writeDeploymentEvidence(evidencePath, evidence);
  return evidence;
}

export function verifyProduction(
  runner: CommandRunner = defaultCommandRunner,
  env: ActivationEnvironment = process.env,
  root: string = process.cwd(),
): DeploymentEvidence {
  const evidencePath = requireDeliveryEvidencePath(env);
  const sourceSha = currentSourceSha(runner);
  linkAndConfirmProject(runner);

  const evidence = readDeploymentState(root);
  if (evidence.sourceSha !== sourceSha) {
    throw new Error(`Deployment state SHA ${evidence.sourceSha} does not match current SHA ${sourceSha}`);
  }

  run(runner, 'vercel', ['inspect', evidence.deploymentId, '--wait', '--scope', VERCEL_SCOPE, '--no-color']);
  const lookup = run(runner, 'vercel', buildReadyDeploymentLookupArgs(sourceSha)).stdout;
  const hostname = new URL(evidence.deploymentId).hostname;
  if (!lookup.includes(hostname)) {
    throw new Error('READY production deployment lookup did not contain the exact deployed URL');
  }

  const cookiePath = join(env.TMPDIR ?? '/tmp', `mathmagics-smoke-${process.pid}.cookies`);
  writeFileSync(cookiePath, '', { encoding: 'utf8', mode: 0o600 });
  try {
    const passwordProbe = run(runner, 'vercel', buildDatabaseProbeArgs('production')).stdout;
    parseDatabaseProbe(passwordProbe);

    const productionEnv = run(runner, 'vercel', [
      'env', 'run', '-e', 'production', '--',
      'node', 'scripts/production-activation.ts', 'site-password-probe',
    ]).stdout.trim();
    if (!productionEnv.split(/\r?\n/).includes('SITE_PASSWORD_READY')) {
      throw new Error('Production SITE_PASSWORD is unavailable');
    }

    const passwordJson = run(runner, 'vercel', [
      'env', 'run', '-e', 'production', '--',
      'node', 'scripts/production-activation.ts', 'site-password-json',
    ]).stdout.trim().split(/\r?\n/).at(-1);
    if (!passwordJson) throw new Error('Production SITE_PASSWORD payload is unavailable');

    runExpectedStatus(
      runner,
      smokeCurlArgs(evidence.deploymentId, '/api/auth', cookiePath, 200, 'POST'),
      passwordJson,
    );
    runExpectedStatus(runner, smokeCurlArgs(evidence.deploymentId, '/pilot/student', cookiePath, 200));
    runExpectedStatus(runner, smokeCurlArgs(evidence.deploymentId, '/pilot/parent', cookiePath, 200));
    runExpectedStatus(
      runner,
      smokeCurlArgs(
        evidence.deploymentId,
        `/api/pilot/review?studentId=${encodeURIComponent(SMOKE_STUDENT_ID)}`,
        cookiePath,
        404,
      ),
    );
    runExpectedStatus(
      runner,
      smokeCurlArgs(
        evidence.deploymentId,
        `/api/learning/next?studentId=${encodeURIComponent(SMOKE_STUDENT_ID)}`,
        cookiePath,
        404,
      ),
    );

    writeDeploymentEvidence(evidencePath, evidence);
    return evidence;
  } finally {
    rmSync(cookiePath, { force: true });
  }
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && fileURLToPath(import.meta.url) === resolve(entry);
}

if (isDirectExecution()) {
  const command = process.argv[2];
  if (command === 'db-probe') {
    process.stdout.write(`${JSON.stringify(databaseProbeFromEnvironment(process.env))}\n`);
  } else if (command === 'site-password-probe') {
    if (!process.env.SITE_PASSWORD || !process.env.SESSION_SECRET) {
      throw new Error('SITE_PASSWORD and SESSION_SECRET are required');
    }
    process.stdout.write('SITE_PASSWORD_READY\n');
  } else if (command === 'site-password-json') {
    const password = process.env.SITE_PASSWORD;
    if (!password) throw new Error('SITE_PASSWORD is required');
    process.stdout.write(`${JSON.stringify({ password })}\n`);
  } else if (command === 'deploy') {
    deployProduction();
  } else if (command === 'verify') {
    verifyProduction();
  } else {
    throw new Error('Usage: node scripts/production-activation.ts <deploy|verify|db-probe|site-password-probe|site-password-json>');
  }
}
