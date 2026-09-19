import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EXPECTED_PRODUCTION_MIGRATIONS,
  GRANDE_PRODUCTION_TARGET,
  assertCleanStatus,
  assertExactMigrationChain,
  assertProductionDatabaseEnvironment,
  assertSourceSha,
  buildDeliveryEvidence,
  buildProductionState,
  parseProductionDeploymentUrl,
} from '@/scripts/production-delivery';

describe('production delivery contract', () => {
  it('pins the exact approved migration chain and rejects incidental 0005', () => {
    expect(() => assertExactMigrationChain(EXPECTED_PRODUCTION_MIGRATIONS)).not.toThrow();
    expect(() => assertExactMigrationChain([...EXPECTED_PRODUCTION_MIGRATIONS, '0005_surprise.sql']))
      .toThrow('Production migration chain mismatch');
  });

  it('requires a clean exact source SHA', () => {
    expect(assertSourceSha('8fc76bd5cf3b711ff5413260c336035e4744e49c\n'))
      .toBe('8fc76bd5cf3b711ff5413260c336035e4744e49c');
    expect(() => assertSourceSha('main')).toThrow('Invalid source SHA');
    expect(() => assertCleanStatus(' M app/page.tsx')).toThrow('clean canonical checkout');
  });

  it('requires Singapore Production Neon and distinct test credentials', () => {
    expect(assertProductionDatabaseEnvironment({
      DATABASE_URL: 'postgresql://u:p@ep-example.ap-southeast-1.aws.neon.tech/db',
    }).hostname).toContain('ap-southeast-1');

    expect(() => assertProductionDatabaseEnvironment({
      DATABASE_URL: 'postgresql://u:p@ep-example.us-east-1.aws.neon.tech/db',
    })).toThrow('Singapore');

    const same = 'postgresql://u:p@ep-example.ap-southeast-1.aws.neon.tech/db';
    expect(() => assertProductionDatabaseEnvironment({ DATABASE_URL: same, TEST_DATABASE_URL: same }))
      .toThrow('must not equal');
  });

  it('parses the production deployment URL from Vercel output', () => {
    expect(parseProductionDeploymentUrl([
      'Inspect: https://vercel.com/team/mathmagics/dpl_123',
      'Production: https://mathmagics-abc.vercel.app [25s]',
    ].join('\n'))).toBe('https://mathmagics-abc.vercel.app');
  });

  it('binds GrandeGPT deployment only to the two trusted production profiles', () => {
    expect(readFileSync(join(process.cwd(), '.grande/deploy.yaml'), 'utf8')).toBe([
      'deploy:',
      '  profile: deploy-production',
      'verify:',
      '  profile: verify-production',
      '',
    ].join('\n'));
  });

  it('writes GrandeGPT-compatible identity values', () => {
    const state = buildProductionState(
      '8fc76bd5cf3b711ff5413260c336035e4744e49c',
      'https://mathmagics-abc.vercel.app',
      '2026-09-20T00:00:00.000Z',
    );
    expect(buildDeliveryEvidence(state)).toEqual({
      target: GRANDE_PRODUCTION_TARGET,
      deploymentId: 'https://mathmagics-abc.vercel.app',
      sourceSha: '8fc76bd5cf3b711ff5413260c336035e4744e49c',
    });
  });
});
