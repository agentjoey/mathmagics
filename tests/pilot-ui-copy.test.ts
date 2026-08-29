import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const files = [
  'app/pilot/page.tsx',
  'app/pilot/student/page.tsx',
  'app/pilot/parent/page.tsx',
  'components/pilot/PilotSetupClient.tsx',
  'components/pilot/PilotStudentClient.tsx',
  'components/pilot/PilotStudentIdentityShell.tsx',
  'components/pilot/PilotParentClient.tsx',
  'components/pilot/ProgressDimensionCard.tsx',
] as const;

function source(path: string): string {
  expect(existsSync(join(ROOT, path)), `missing ${path}`).toBe(true);
  return readFileSync(join(ROOT, path), 'utf8');
}

describe('Phase 8 family pilot shell', () => {
  it('exposes the two family views plus a bounded first-student setup', () => {
    const text = source('app/pilot/page.tsx');
    expect(text).toContain('学生学习');
    expect(text).toContain('家长查看');
    expect(text).toContain('/pilot/student');
    expect(text).toContain('/pilot/parent');
    expect(text).toContain('PilotSetupClient');
  });

  it('creates the first student through the authenticated setup endpoint and stores only its generated id locally', () => {
    const text = source('components/pilot/PilotSetupClient.tsx');
    expect(text).toContain('/api/pilot/setup');
    expect(text).toContain('mathmagics.pilot.studentId');
    expect(text).toContain('localStorage.setItem');
    expect(text).not.toContain('mastery');
    expect(text).not.toContain('evidence');
  });

  it('keeps the student experience on the bounded daily learning loop and routes correction before a dead lesson start', () => {
    const text = [
      source('components/pilot/PilotStudentClient.tsx'),
      source('components/pilot/PilotStudentIdentityShell.tsx'),
    ].join('\n');
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
      '去订正',
      '本轮学习安排已完成',
      '家长确认',
    ]) expect(text).toContain(phrase);
    for (const endpoint of [
      '/api/pilot/student',
      '/api/learning/next',
      '/api/pilot/lesson?studentId=',
      '/api/pilot/lesson',
      '/api/pilot/practice',
      '/api/pilot/homework',
      '/api/pilot/correction',
    ]) expect(text).toContain(endpoint);
    expect(text).toContain('PROPOSE_DIAGNOSIS');
    expect(text).toContain('CONFIRM_DIAGNOSIS');
    expect(text).toContain('mathmagics.pilot.studentId');
    expect(text).toContain('localStorage.getItem');
    expect(text).toContain('displayName');
    expect(text).toContain('levelId');
  });

  it('offers the practice action only for lesson intents accepted by PracticeService', () => {
    const text = source('components/pilot/PilotStudentClient.tsx');
    expect(text).toContain("lesson.intent === 'PRACTICE' || lesson.intent === 'REVIEW'");
    expect(text).not.toContain("lesson.intent !== 'CORRECTION'");
  });

  it('keeps parent progress dimensions separate, explains the next lesson, and reuses saved student id', () => {
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
    expect(text).toContain('mathmagics.pilot.studentId');
    expect(text).toContain('localStorage.getItem');
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
