'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

const STORAGE_KEY = 'mathmagics.pilot.studentId';

type ObjectiveOption = { id: string; title: string; levelId: 'P2' | 'P3' };
type SetupResult = { studentId: string; weekStart: string };

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? '创建学生失败');
  return payload;
}

export function PilotSetupClient({ objectives }: { objectives: ObjectiveOption[] }) {
  const [displayName, setDisplayName] = useState('');
  const [levelId, setLevelId] = useState<'P2' | 'P3'>('P3');
  const availableObjectives = useMemo(() => objectives.filter((objective) => objective.levelId === levelId), [levelId, objectives]);
  const [currentObjectiveId, setCurrentObjectiveId] = useState(objectives.find((objective) => objective.levelId === 'P3')?.id ?? '');
  const [sessionsPerWeek, setSessionsPerWeek] = useState(4);
  const [minutesPerSession, setMinutesPerSession] = useState(30);
  const [result, setResult] = useState<SetupResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function chooseLevel(nextLevel: 'P2' | 'P3') {
    setLevelId(nextLevel);
    setCurrentObjectiveId(objectives.find((objective) => objective.levelId === nextLevel)?.id ?? '');
  }

  async function createStudent() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/pilot/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, levelId, currentObjectiveId, sessionsPerWeek, minutesPerSession }),
      });
      const created = await readJson<SetupResult>(response);
      localStorage.setItem(STORAGE_KEY, created.studentId);
      setResult(created);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '创建学生失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-10 rounded-[2rem] border border-stone-200 bg-white p-7 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">First setup</p>
      <h2 className="mt-3 text-2xl font-semibold">首次设置学生</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">只设置当前年级、学习起点和每周节奏。系统会生成学生 ID 和本周学习计划。</p>
      {!result ? (
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="学生称呼" className="rounded-2xl border border-stone-300 px-4 py-3 outline-none focus:border-amber-500" />
          <select value={levelId} onChange={(event) => chooseLevel(event.target.value as 'P2' | 'P3')} className="rounded-2xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-amber-500">
            <option value="P2">Primary 2</option><option value="P3">Primary 3</option>
          </select>
          <select value={currentObjectiveId} onChange={(event) => setCurrentObjectiveId(event.target.value)} className="md:col-span-2 rounded-2xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-amber-500">
            {availableObjectives.map((objective) => <option key={objective.id} value={objective.id}>{objective.title}</option>)}
          </select>
          <label className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 px-4 py-3 text-sm text-stone-600">每周学习次数<input type="number" min={1} max={7} value={sessionsPerWeek} onChange={(event) => setSessionsPerWeek(Number(event.target.value))} className="w-16 text-right outline-none" /></label>
          <label className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 px-4 py-3 text-sm text-stone-600">每次分钟<input type="number" min={10} max={180} value={minutesPerSession} onChange={(event) => setMinutesPerSession(Number(event.target.value))} className="w-16 text-right outline-none" /></label>
          <button onClick={createStudent} disabled={busy || !displayName.trim() || !currentObjectiveId} className="md:col-span-2 rounded-2xl bg-amber-600 px-5 py-3 font-semibold text-white disabled:opacity-50">{busy ? '正在建立学习计划…' : '创建并开始家庭试用'}</button>
        </div>
      ) : (
        <div className="mt-6 rounded-2xl bg-amber-50 p-5">
          <p className="font-medium text-stone-900">学生已建立，本周计划从 {result.weekStart} 开始。</p>
          <p className="mt-1 break-all text-xs text-stone-500">学生 ID：{result.studentId}</p>
          <div className="mt-4 flex flex-wrap gap-3"><Link href="/pilot/student" className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white">进入学生学习</Link><Link href="/pilot/parent" className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800">进入家长查看</Link></div>
        </div>
      )}
      {error && <p className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
    </section>
  );
}
