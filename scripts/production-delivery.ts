import { writeFileSync } from 'node:fs';
import { URL } from 'node:url';

export const GRANDE_PRODUCTION_TARGET = 'deployment-host:mathmagics/deploy-production';
export const PRODUCTION_STATE_PATH = '.vercel/grande-production-deploy.json';

export const EXPECTED_PRODUCTION_MIGRATIONS = [
  '0000_old_bushwacker.sql',
  '0001_fantastic_shocker.sql',
  '0002_gorgeous_obadiah_stane.sql',
  '0003_stale_mercury.sql',
  '0004_strange_meteorite.sql',
] as const;

export interface ProductionDeploymentState {
  target: typeof GRANDE_PRODUCTION_TARGET;
  deploymentId: string;
  sourceSha: string;
  deployedAt: string;
}

export interface DeliveryEvidence {
  target: typeof GRANDE_PRODUCTION_TARGET;
  deploymentId: string;
  sourceSha: string;
}

const SHA_RE = /^[0-9a-f]{40}$/;

export function assertExactMigrationChain(files: readonly string[]): void {
  const sqlFiles = [...files].filter((file) => /^\d{4}_.+\.sql$/.test(file)).sort();
  const expected = [...EXPECTED_PRODUCTION_MIGRATIONS];
  if (sqlFiles.length !== expected.length || sqlFiles.some((file, index) => file !== expected[index])) {
    throw new Error(
      `Production migration chain mismatch. Expected ${expected.join(', ')}, got ${sqlFiles.join(', ') || '(none)'}.`,
    );
  }
}

export function assertProductionDatabaseEnvironment(env: Record<string, string | undefined>): URL {
  const raw = env.DATABASE_URL?.trim();
  if (!raw) throw new Error('Production DATABASE_URL is missing.');

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Production DATABASE_URL is not a valid URL.');
  }

  if (!url.hostname.includes('ap-southeast-1')) {
    throw new Error(`Production Neon must be in Singapore (ap-southeast-1); got host ${url.hostname}.`);
  }

  const testUrl = env.TEST_DATABASE_URL?.trim();
  if (testUrl && testUrl === raw) {
    throw new Error('Production DATABASE_URL must not equal TEST_DATABASE_URL.');
  }
  return url;
}

export function assertCleanStatus(status: string): void {
  if (status.trim() !== '') {
    throw new Error('Production deploy requires a clean canonical checkout.');
  }
}

export function assertSourceSha(value: string): string {
  const sha = value.trim();
  if (!SHA_RE.test(sha)) throw new Error(`Invalid source SHA: ${value}`);
  return sha;
}

export function parseProductionDeploymentUrl(output: string): string {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const productionLine = [...lines].reverse().find((line) => /production:/i.test(line) && /https:\/\//i.test(line));
  const candidateLine = productionLine ?? [...lines].reverse().find((line) => /https:\/\/[A-Za-z0-9.-]+/i.test(line));
  const match = candidateLine?.match(/https:\/\/[A-Za-z0-9.-]+/i);
  if (!match) throw new Error('Could not determine Vercel production deployment URL.');
  return match[0].replace(/\/$/, '');
}

export function buildProductionState(sourceSha: string, deploymentId: string, deployedAt = new Date().toISOString()): ProductionDeploymentState {
  assertSourceSha(sourceSha);
  if (!deploymentId.startsWith('https://')) throw new Error('deploymentId must be an https URL.');
  return {
    target: GRANDE_PRODUCTION_TARGET,
    deploymentId,
    sourceSha,
    deployedAt,
  };
}

export function buildDeliveryEvidence(state: ProductionDeploymentState): DeliveryEvidence {
  return {
    target: state.target,
    deploymentId: state.deploymentId,
    sourceSha: state.sourceSha,
  };
}

export function writeDeliveryEvidence(path: string | undefined, state: ProductionDeploymentState): void {
  if (!path?.trim()) throw new Error('GRANDE_DELIVERY_EVIDENCE_FILE is required.');
  writeFileSync(path, JSON.stringify(buildDeliveryEvidence(state)), { encoding: 'utf8', mode: 0o600 });
}
