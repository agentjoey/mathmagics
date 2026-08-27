import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const files = [
  'app/pilot/page.tsx',
  'app/pilot/student/page.tsx',
  'app/pilot/parent/page.tsx',
  'components/pilot/PilotStudentClient.tsx',
  'components/pilot/PilotParentClient.tsx',
  'components/pilot/ProgressDimensionCard.tsx',
] as const;

function source(path: string): string {
  expect(existsSync(join(ROOT, path)), `missing ${path}`).toBe(true);
  return readFileSync(join(ROOT, path), 'utf8');
}

describe('Phase 8 family pilot shell', () => {
  it('exposes only the two primary family entry choices', () => {
    const text = source('app/pilot/page.tsx');
    expect(text).toContain('学生学习');
    expect(text).toContain('家长查看');
    expect(text).toContain('/pilot/student');
    expect(text).toContain('/pilot/parent');
  });

  it('keeps the student experience on the bounded daily learning loop', () => {
    const text = source('components/pilot/PilotStudentClient.tsx');
    for (const phrase of [
      '今天学什么？',
      '开始学习',
      '练习',
      '查看提示',
      '提交答案',
      '上传作业',
      '订正',
      '完成本节',
      '跳过本节',
      '接下来',
    ]) expect(text).toContain(phrase);
    for (const endpoint of [
      '/api/learning/next',
      '/api/pilot/lesson',
      '/api/pilot/practice',
      '/api/pilot/homework',
      '/api/pilot/correction',
    ]) expect(text).toContain(endpoint);
  });

  it('keeps parent progress dimensions separate and explains the next lesson in family language', () => {
    const text = [
      source('components/pilot/PilotParentClient.tsx'),
      source('components/pilot/ProgressDimensionCard.tsx'),
    ].join('\n');
    for (const label of ['学习覆盖', '知识掌握', '近期表现', '解题策略']) expect(text).toContain(label);
    for (const question of [
      '今天学了什么？',
      '哪些内容已经掌握？',
      '哪些内容最近还不稳定？',
      '哪些错误仍需要订正？',
      '下一步学什么，为什么？',
    ]) expect(text).toContain(question);
    expect(text).toContain('/api/pilot/review');
    expect(text).toContain('rationale');
    expect(text).toContain('title');
    expect(text).toContain('explanation');
  });

  it('does not reintroduce aggregate scores, gamification, answer keys, or internal authority fields', () => {
    const text = files.map(source).join('\n');
    for (const forbidden of [
      '总分',
      '综合能力分',
      '综合掌握率',
      '排名',
      '连续打卡',
      'answerSpec',
      'solutionOutline',
      'expectedOptionId',
      'gradingPolicyVersion',
      'setMastery',
      'adaptiveRanking',
    ]) expect(text).not.toContain(forbidden);
  });

  it('makes /pilot the primary home entry while retaining legacy fixtures as demos', () => {
    const text = source('app/page.tsx');
    expect(text).toContain('/pilot');
    expect(text).toContain('家庭试用');
    expect(text).toContain('旧版演示');
    expect(text.indexOf('/pilot')).toBeLessThan(text.indexOf('/q/'));
  });
});
