'use client';

import { useState } from 'react';
import { ProgressDimensionCard } from './ProgressDimensionCard';

const STORAGE_KEY = 'mathmagics.pilot.studentId';

function initialStudentId(): string {
  return typeof window === 'undefined' ? '' : localStorage.getItem(STORAGE_KEY) ?? '';
}

type ObjectiveView = {
  objectiveId: string;
  title: string;
  coverage: string;
  mastery: string;
  performance: string;
  reviewDue: boolean;
};

type Review = {
  studentId: string;
  evaluatedAt: string;
  progress: {
    summary: {
      objectivesIntroduced: number;
      objectivesPractised: number;
      objectivesMastered: number;
      strugglingObjectives: number;
      reviewDueObjectives: number;
      activeMistakes: number;
      recurrentMistakes: number;
      observedStrategies: number;
      developingStrategies: number;
      reliableStrategies: number;
    };
    topics: Array<{ topicId: string; title: string; objectives: ObjectiveView[] }>;
    strategies: Array<{ strategyId: string; state: string }>;
    mistakes: {
      active: Array<{ label: string; activeEpisodeCount: number }>;
      resolved: Array<{ label: string; resolvedEpisodeCount: number }>;
      recurring: Array<{ label: string; recurrenceCount: number }>;
    };
  };
  lessons: Array<{
    lessonId: string;
    intent: string;
    objectiveIds: string[];
    adapted: boolean;
    execution: {
      status: string;
      startedAt?: string;
      completedAt?: string;
      skippedAt?: string;
      actualMinutes?: number;
    };
  }>;
  nextLesson: null | {
    lessonId: string;
    intent: string;
    objectiveIds: string[];
    adapted: boolean;
    rationale: Array<{ title: string; explanation: string }>;
  };
};

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? '请求失败');
  return payload;
}

function executionTime(lesson: Review['lessons'][number]): string | undefined {
  return lesson.execution.completedAt ?? lesson.execution.skippedAt ?? lesson.execution.startedAt;
}

export function PilotParentClient() {
  const [studentId, setStudentId] = useState(initialStudentId);
  const [review, setReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function loadReview() {
    const id = studentId.trim();
    if (!id) {
      setError('请输入学生 ID。');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/pilot/review?studentId=${encodeURIComponent(id)}`, { cache: 'no-store' });
      setReview(await readJson<Review>(response));
    } catch (reason) {
      setReview(null);
      setError(reason instanceof Error ? reason.message : '读取失败');
    } finally {
      setLoading(false);
    }
  }

  const objectives = review?.progress.topics.flatMap((topic) => topic.objectives) ?? [];
  const mastered = objectives.filter((objective) => objective.mastery === 'MASTERED');
  const unstable = objectives.filter((objective) => objective.performance === 'STRUGGLING' || objective.reviewDue);
  const today = review
    ? review.lessons.filter((lesson) => executionTime(lesson)?.slice(0, 10) === review.evaluatedAt.slice(0, 10))
    : [];

  function objectiveTitle(id: string) {
    return objectives.find((objective) => objective.objectiveId === id)?.title ?? id;
  }

  return (
    <div>
      <header className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">Parent view</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">家长学习回顾</h1>
        <p className="mt-3 max-w-2xl leading-7 text-stone-600">只看可追溯的学习事实。四个维度分别呈现，不合并成一个看似精确的数字。</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <input
            value={studentId}
            onChange={(event) => setStudentId(event.target.value)}
            placeholder="学生 ID"
            className="min-w-0 flex-1 rounded-2xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-amber-500"
          />
          <button onClick={loadReview} disabled={loading} className="rounded-2xl bg-stone-900 px-5 py-3 font-semibold text-white disabled:opacity-50">
            {loading ? '读取中…' : '查看学习情况'}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      </header>

      {review && (
        <>
          <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ProgressDimensionCard
              title="学习覆盖"
              value={`${review.progress.summary.objectivesIntroduced} 个目标已接触`}
              detail={`${review.progress.summary.objectivesPractised} 个目标已经进入练习。`}
            />
            <ProgressDimensionCard
              title="知识掌握"
              value={`${review.progress.summary.objectivesMastered} 个目标稳定掌握`}
              detail="掌握来自独立、持续的学习证据，不由页面手动设置。"
            />
            <ProgressDimensionCard
              title="近期表现"
              value={`${review.progress.summary.strugglingObjectives} 个目标需要支持`}
              detail={`${review.progress.summary.reviewDueObjectives} 个目标到了复习节点。`}
            />
            <ProgressDimensionCard
              title="解题策略"
              value={`${review.progress.summary.observedStrategies} 项策略已有观察`}
              detail={`${review.progress.summary.developingStrategies} 项仍在发展，${review.progress.summary.reliableStrategies} 项表现稳定。`}
            />
          </section>

          <section className="mt-6 grid gap-5 lg:grid-cols-2">
            <article className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold">今天学了什么？</h2>
              <div className="mt-4 space-y-3 text-sm leading-6 text-stone-600">
                {today.length === 0 && <p>今天还没有课程执行记录。</p>}
                {today.map((lesson) => (
                  <div key={lesson.lessonId} className="rounded-2xl bg-stone-50 p-4">
                    <p className="font-medium text-stone-900">{lesson.objectiveIds.map(objectiveTitle).join(' · ')}</p>
                    <p className="mt-1">{lesson.intent} · {lesson.execution.status}{lesson.adapted ? ' · 已根据学习事实调整' : ''}</p>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold">哪些内容已经掌握？</h2>
              <div className="mt-4 space-y-2 text-sm text-stone-600">
                {mastered.length === 0 && <p>目前还没有达到稳定掌握标准的目标。</p>}
                {mastered.map((objective) => <p key={objective.objectiveId}>• {objective.title}</p>)}
              </div>
            </article>

            <article className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold">哪些内容最近还不稳定？</h2>
              <div className="mt-4 space-y-2 text-sm text-stone-600">
                {unstable.length === 0 && <p>近期没有系统性的不稳定信号。</p>}
                {unstable.map((objective) => (
                  <p key={objective.objectiveId}>• {objective.title}{objective.reviewDue ? ' · 需要复习' : ''}</p>
                ))}
              </div>
            </article>

            <article className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold">哪些错误仍需要订正？</h2>
              <div className="mt-4 space-y-2 text-sm text-stone-600">
                {review.progress.mistakes.active.length === 0 && <p>当前没有未解决的错误记录。</p>}
                {review.progress.mistakes.active.map((mistake) => (
                  <p key={mistake.label}>• {mistake.label} · {mistake.activeEpisodeCount} 个待处理记录</p>
                ))}
                {review.progress.mistakes.recurring.map((mistake) => (
                  <p key={`recurring-${mistake.label}`} className="text-amber-800">再次出现：{mistake.label} · {mistake.recurrenceCount} 次</p>
                ))}
              </div>
            </article>
          </section>

          <section className="mt-5 rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-semibold">下一步学什么，为什么？</h2>
            {!review.nextLesson ? (
              <p className="mt-4 text-sm leading-6 text-stone-600">当前没有新的课程安排。</p>
            ) : (
              <div className="mt-4">
                <p className="font-medium text-stone-900">{review.nextLesson.objectiveIds.map(objectiveTitle).join(' · ')}</p>
                <p className="mt-1 text-sm text-stone-500">{review.nextLesson.intent}{review.nextLesson.adapted ? ' · 本节已根据近期事实调整' : ' · 保持当前计划'}</p>
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {review.nextLesson.rationale.length === 0 && (
                    <div className="rounded-2xl bg-stone-50 p-4 text-sm leading-6 text-stone-600">当前没有更高优先级的学习事实需要改变安排。</div>
                  )}
                  {review.nextLesson.rationale.map((rationale, index) => (
                    <div key={`${rationale.title}-${index}`} className="rounded-2xl bg-amber-50 p-4">
                      <p className="font-medium text-stone-900">{rationale.title}</p>
                      <p className="mt-1 text-sm leading-6 text-stone-600">{rationale.explanation}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
