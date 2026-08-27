import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

function runNpmScript(script: 'typecheck' | 'validate:curriculum'): string {
  const result = spawnSync('npm', ['run', script], {
    cwd: process.cwd(),
    env: { ...process.env, NO_COLOR: '1' },
    encoding: 'utf8',
    shell: false,
  });

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`npm run ${script} failed with exit ${result.status}\n${output}`);
  }
  return output;
}

describe('release gate scripts', () => {
  it('runs the exact typecheck script successfully', () => {
    expect(runNpmScript('typecheck')).toContain('tsc --noEmit');
  });

  it('runs the exact curriculum validator and reports the approved dataset counts', () => {
    expect(runNpmScript('validate:curriculum')).toContain(
      'Curriculum valid: 25 nodes, 68 objectives (P2=32, P3=36), 18 textbook mappings.',
    );
  });
});
