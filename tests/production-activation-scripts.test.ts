import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  DELIVERY_TARGET,
  DEPLOYMENT_STATE_PATH,
  EXPECTED_MIGRATIONS,
  VERCEL_PROJECT,
  VERCEL_SCOPE,
  assertMigrationChain,
  assertProductionDatabaseBoundary,
  buildDatabaseProbeArgs,
  buildProductionMigrationArgs,
  buildReadyDeploymentLookupArgs,
  buildVercelDeployArgs,
  buildVercelLinkArgs,
  databaseProbeFromEnvironment,
  deployProduction,
  deploymentUrlFromStdout,
  parseDatabaseProbe,
  requireDeliveryEvidencePath,
  smokeCurlArgs,
  verifyProduction,
  writeDeploymentEvidence,
  type CommandRunner,
} from '@/scripts/production-activation';

describe('production activation contract', () => {
  it('uses only the trusted Vercel project identity and exact source metadata', () => {
    expect(buildVercelLinkArgs()).toEqual([
      'link', '--yes', '--project', VERCEL_PROJECT, '--scope', VERCEL_SCOPE,
    ]);
    expect(buildVercelDeployArgs('a'.repeat(40))).toEqual([
      'deploy',
      '--prod',
      '--yes',
      '--scope', VERCEL_SCOPE,
      '--meta', 'githubDeployment=1',
      '--meta', 'githubCommitRef=main',
      '--meta', `githubCommitSha=${'a'.repeat(40)}`,
    ]);
    expect(buildReadyDeploymentLookupArgs('a'.repeat(40))).toContain(`githubCommitSha=${'a'.repeat(40)}`);
  });

  it('uses Vercel environment injection for migration and database probes', () => {
    expect(buildProductionMigrationArgs()).toEqual([
      'env', 'run', '-e', 'production', '--', 'npm', 'run', 'db:migrate',
    ]);
    expect(buildDatabaseProbeArgs('production')).toEqual([
      'env', 'run', '-e', 'production', '--',
      'node', 'scripts/production-activation.ts', 'db-probe',
    ]);
    expect(buildDatabaseProbeArgs('preview')).toEqual([
      'env', 'run', '-e', 'preview', '--',
      'node', 'scripts/production-activation.ts', 'db-probe',
    ]);
  });

  it('fails closed unless production Neon is Singapore and distinct from Preview', () => {
    const prod = {
      hostname: 'ep-prod-pooler.ap-southeast-1.aws.neon.tech',
      fingerprint: `sha256:${'1'.repeat(64)}`,
    };
    const preview = {
      hostname: 'ep-preview-pooler.ap-southeast-1.aws.neon.tech',
      fingerprint: `sha256:${'2'.repeat(64)}`,
    };
    expect(() => assertProductionDatabaseBoundary(prod, preview)).not.toThrow();
    expect(() => assertProductionDatabaseBoundary(
      { ...prod, hostname: 'ep-prod-pooler.us-east-1.aws.neon.tech' },
      preview,
    )).toThrow('Singapore');
    expect(() => assertProductionDatabaseBoundary(prod, { ...preview, fingerprint: prod.fingerprint }))
      .toThrow('must differ');
  });

  it('probes database identity without exposing credentials', () => {
    const probe = databaseProbeFromEnvironment({
      DATABASE_URL: 'postgresql://user:secret@ep-prod-pooler.ap-southeast-1.aws.neon.tech/db?sslmode=require',
    });
    expect(probe.hostname).toBe('ep-prod-pooler.ap-southeast-1.aws.neon.tech');
    expect(probe.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(JSON.stringify(probe)).not.toContain('secret');
    expect(parseDatabaseProbe(JSON.stringify(probe))).toEqual(probe);
  });

  it('requires the GrandeGPT evidence channel and writes bounded deployment evidence', () => {
    expect(() => requireDeliveryEvidencePath({})).toThrow('GRANDE_DELIVERY_EVIDENCE_FILE');
    const root = mkdtempSync(join(tmpdir(), 'mathmagics-evidence-'));
    const path = join(root, 'delivery-evidence.json');
    writeDeploymentEvidence(path, {
      target: DELIVERY_TARGET,
      deploymentId: 'https://mathmagics-abc.vercel.app',
      sourceSha: 'b'.repeat(40),
    });
    const text = readFileSync(path, 'utf8');
    expect(JSON.parse(text)).toEqual({
      target: 'production',
      deploymentId: 'https://mathmagics-abc.vercel.app',
      sourceSha: 'b'.repeat(40),
    });
  });

  it('accepts only the exact committed migration chain', () => {
    const root = mkdtempSync(join(tmpdir(), 'mathmagics-migrations-'));
    mkdirSync(join(root, 'migrations', 'meta'), { recursive: true });
    for (const name of EXPECTED_MIGRATIONS) writeFileSync(join(root, 'migrations', name), '');
    for (let i = 0; i <= 4; i += 1) {
      writeFileSync(join(root, 'migrations', 'meta', `000${i}_snapshot.json`), '{}');
    }
    expect(() => assertMigrationChain(root)).not.toThrow();
    writeFileSync(join(root, 'migrations', '0005_unapproved.sql'), '');
    expect(() => assertMigrationChain(root)).toThrow('Unexpected production migration chain');
  });

  it('parses deployment URL from Vercel stdout and binds smoke calls to that deployment', () => {
    const deployment = deploymentUrlFromStdout('https://mathmagics-abc.vercel.app\n');
    expect(deployment).toBe('https://mathmagics-abc.vercel.app');
    const args = smokeCurlArgs(deployment, '/pilot/student', '/tmp/cookies', 200);
    expect(args).toContain('--deployment');
    expect(args).toContain(deployment);
    expect(args).toContain('__EXPECT__');
    expect(args).not.toContain('SITE_PASSWORD');
  });


  it('orders production boundary checks before migration and binds deploy evidence to exact HEAD', () => {
    const root = mkdtempSync(join(tmpdir(), 'mathmagics-deploy-flow-'));
    mkdirSync(join(root, 'migrations', 'meta'), { recursive: true });
    for (const name of EXPECTED_MIGRATIONS) writeFileSync(join(root, 'migrations', name), '');
    for (let i = 0; i <= 4; i += 1) {
      writeFileSync(join(root, 'migrations', 'meta', `000${i}_snapshot.json`), '{}');
    }

    const sha = 'c'.repeat(40);
    const deploymentUrl = 'https://mathmagics-prod-abc.vercel.app';
    const evidencePath = join(root, 'delivery-evidence.json');
    const calls: string[] = [];
    const runner: CommandRunner = (command, args) => {
      const key = [command, ...args].join(' ');
      calls.push(key);
      if (command === 'git' && args.join(' ') === 'status --porcelain') return { status: 0, stdout: '', stderr: '' };
      if (command === 'git' && args.join(' ') === 'rev-parse HEAD') return { status: 0, stdout: `${sha}\n`, stderr: '' };
      if (command === 'vercel' && args[0] === 'link') return { status: 0, stdout: '', stderr: '' };
      if (command === 'vercel' && args[0] === 'project') return { status: 0, stdout: 'Project mathmagics\n', stderr: '' };
      if (args.includes('db-probe') && args.includes('production')) {
        return {
          status: 0,
          stdout: `${JSON.stringify({
            hostname: 'ep-prod-pooler.ap-southeast-1.aws.neon.tech',
            fingerprint: `sha256:${'1'.repeat(64)}`,
          })}\n`,
          stderr: '',
        };
      }
      if (args.includes('db-probe') && args.includes('preview')) {
        return {
          status: 0,
          stdout: `${JSON.stringify({
            hostname: 'ep-preview-pooler.ap-southeast-1.aws.neon.tech',
            fingerprint: `sha256:${'2'.repeat(64)}`,
          })}\n`,
          stderr: '',
        };
      }
      if (command === 'vercel' && args.join(' ') === buildProductionMigrationArgs().join(' ')) {
        return { status: 0, stdout: '', stderr: '' };
      }
      if (command === 'vercel' && args[0] === 'deploy') {
        return { status: 0, stdout: `${deploymentUrl}\n`, stderr: '' };
      }
      if (command === 'vercel' && args[0] === 'inspect') return { status: 0, stdout: 'Ready\n', stderr: '' };
      throw new Error(`Unexpected command: ${key}`);
    };

    expect(deployProduction(runner, { GRANDE_DELIVERY_EVIDENCE_FILE: evidencePath }, root)).toEqual({
      target: 'production',
      deploymentId: deploymentUrl,
      sourceSha: sha,
    });

    const migrationIndex = calls.findIndex((call) => call.includes('env run -e production -- npm run db:migrate'));
    const previewProbeIndex = calls.findIndex((call) => call.includes('env run -e preview') && call.includes('db-probe'));
    const deployIndex = calls.findIndex((call) => call.includes('vercel deploy --prod'));
    expect(previewProbeIndex).toBeGreaterThan(-1);
    expect(migrationIndex).toBeGreaterThan(previewProbeIndex);
    expect(deployIndex).toBeGreaterThan(migrationIndex);
    expect(JSON.parse(readFileSync(evidencePath, 'utf8'))).toEqual({
      target: 'production',
      deploymentId: deploymentUrl,
      sourceSha: sha,
    });
    expect(JSON.parse(readFileSync(join(root, DEPLOYMENT_STATE_PATH), 'utf8'))).toEqual({
      target: 'production',
      deploymentId: deploymentUrl,
      sourceSha: sha,
    });
  });

  it('never starts migration when Production and Preview resolve to the same database', () => {
    const root = mkdtempSync(join(tmpdir(), 'mathmagics-deploy-boundary-'));
    mkdirSync(join(root, 'migrations', 'meta'), { recursive: true });
    for (const name of EXPECTED_MIGRATIONS) writeFileSync(join(root, 'migrations', name), '');
    for (let i = 0; i <= 4; i += 1) {
      writeFileSync(join(root, 'migrations', 'meta', `000${i}_snapshot.json`), '{}');
    }
    const calls: string[] = [];
    const probe = JSON.stringify({
      hostname: 'ep-same-pooler.ap-southeast-1.aws.neon.tech',
      fingerprint: `sha256:${'3'.repeat(64)}`,
    });
    const runner: CommandRunner = (command, args) => {
      const key = [command, ...args].join(' ');
      calls.push(key);
      if (command === 'git' && args.join(' ') === 'status --porcelain') return { status: 0, stdout: '', stderr: '' };
      if (command === 'git' && args.join(' ') === 'rev-parse HEAD') return { status: 0, stdout: `${'d'.repeat(40)}\n`, stderr: '' };
      if (command === 'vercel' && args[0] === 'link') return { status: 0, stdout: '', stderr: '' };
      if (command === 'vercel' && args[0] === 'project') return { status: 0, stdout: 'Project mathmagics\n', stderr: '' };
      if (args.includes('db-probe')) return { status: 0, stdout: `${probe}\n`, stderr: '' };
      throw new Error(`Unexpected command: ${key}`);
    };

    expect(() => deployProduction(
      runner,
      { GRANDE_DELIVERY_EVIDENCE_FILE: join(root, 'evidence.json') },
      root,
    )).toThrow('must differ');
    expect(calls.some((call) => call.includes('npm run db:migrate'))).toBe(false);
    expect(calls.some((call) => call.includes('vercel deploy --prod'))).toBe(false);
  });

  it('verifies the same deployment and SHA, keeps the password out of argv, and removes the smoke cookie', () => {
    const root = mkdtempSync(join(tmpdir(), 'mathmagics-verify-flow-'));
    const temp = join(root, 'tmp');
    mkdirSync(join(root, '.vercel'), { recursive: true });
    mkdirSync(temp, { recursive: true });
    const sha = 'e'.repeat(40);
    const deploymentUrl = 'https://mathmagics-prod-verify.vercel.app';
    writeFileSync(join(root, DEPLOYMENT_STATE_PATH), JSON.stringify({
      target: 'production',
      deploymentId: deploymentUrl,
      sourceSha: sha,
    }));

    const evidencePath = join(root, 'verify-evidence.json');
    const calls: Array<{ key: string; input?: string }> = [];
    let smokeCall = 0;
    const runner: CommandRunner = (command, args, options) => {
      const key = [command, ...args].join(' ');
      calls.push({ key, input: options?.input });
      if (command === 'git' && args.join(' ') === 'status --porcelain') return { status: 0, stdout: '', stderr: '' };
      if (command === 'git' && args.join(' ') === 'rev-parse HEAD') return { status: 0, stdout: `${sha}\n`, stderr: '' };
      if (command === 'vercel' && args[0] === 'link') return { status: 0, stdout: '', stderr: '' };
      if (command === 'vercel' && args[0] === 'project') return { status: 0, stdout: 'Project mathmagics\n', stderr: '' };
      if (command === 'vercel' && args[0] === 'inspect') return { status: 0, stdout: 'Ready\n', stderr: '' };
      if (command === 'vercel' && args[0] === 'list') {
        return { status: 0, stdout: `READY ${new URL(deploymentUrl).hostname}\n`, stderr: '' };
      }
      if (args.includes('db-probe')) {
        return {
          status: 0,
          stdout: `${JSON.stringify({
            hostname: 'ep-prod-pooler.ap-southeast-1.aws.neon.tech',
            fingerprint: `sha256:${'4'.repeat(64)}`,
          })}\n`,
          stderr: '',
        };
      }
      if (args.includes('site-password-probe')) return { status: 0, stdout: 'SITE_PASSWORD_READY\n', stderr: '' };
      if (args.includes('site-password-json')) return { status: 0, stdout: '{"password":"super-secret"}\n', stderr: '' };
      if (command === 'vercel' && args[0] === 'curl') {
        smokeCall += 1;
        return { status: 0, stdout: smokeCall <= 3 ? '200' : '404', stderr: '' };
      }
      throw new Error(`Unexpected command: ${key}`);
    };

    expect(verifyProduction(
      runner,
      { GRANDE_DELIVERY_EVIDENCE_FILE: evidencePath, TMPDIR: temp },
      root,
    )).toEqual({
      target: 'production',
      deploymentId: deploymentUrl,
      sourceSha: sha,
    });

    expect(calls.some(({ key }) => key.includes(`--meta githubCommitSha=${sha}`))).toBe(true);
    expect(calls.every(({ key }) => !key.includes('super-secret'))).toBe(true);
    expect(calls.filter(({ input }) => input?.includes('super-secret'))).toHaveLength(1);
    expect(existsSync(join(temp, `mathmagics-smoke-${process.pid}.cookies`))).toBe(false);
    expect(JSON.parse(readFileSync(evidencePath, 'utf8'))).toEqual({
      target: 'production',
      deploymentId: deploymentUrl,
      sourceSha: sha,
    });
  });

  it('repo deploy spec references profiles only and contains no executable argv', async () => {
    const text = await import('node:fs/promises').then((fs) =>
      fs.readFile(join(process.cwd(), '.grande', 'deploy.yaml'), 'utf8'));
    expect(text).toBe(
      'deploy:\n  profile: deploy-production\nverify:\n  profile: verify-production\n',
    );
    expect(text).not.toContain('argv');
    expect(text).not.toContain('command');
  });
});
