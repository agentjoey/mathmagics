'use client';

import { useMemo, useState } from 'react';
import { derivePilotStudentFlow } from '@/lib/pilot/student-flow';

const STORAGE_KEY = 'mathmagics.pilot.studentId';

function initialStudentId(): string {
  return typeof window === 'undefined' ? '' : localStorage.getItem(STORAGE_KEY) ?? '';
}

type NextLesson = {
  lessonId: string;
  intent: string;
  objectiveSummary: string;
  adapted: boolean;
};

type LessonSession = {
  lessonId: string;
  intent: string;
  objectiveIds: string[];
  practiceAvailable: boolean;
  adapted: boolean;
  execution: { status: string };
};

type PracticeItemView = {
  id: string;
  sessionId: string;
  objectiveId: string;
  sequence: number;
  difficultyBand: string;
  prompt: string;
};

type PracticeSessionView = {
  session: { id: string; lessonId: string; objectiveId: string; createdAt: string };
  items: PracticeItemView[];
};

type PracticeAttemptView = {
  id: string;
  outcome: 'CORRECT' | 'INCORRECT';
  hintUsed: boolean;
  retryOfAttemptId?: string;
  submittedAt: string;
};

type HomeworkProblemView = {
  problem: { id: string; question: { value: string } };
  trustState: string;
  objectiveCandidates: string[];
};

type HomeworkView = {
  submission: { id: string };
  problems: HomeworkProblemView[];
};

type DiagnosisTarget =
  | { kind: 'MISCONCEPTION'; misconceptionId: string }
  | { kind: 'GENERIC'; code: 'FACT_ERROR' | 'PROCEDURE_ERROR' | 'REPRESENTATION_ERROR' | 'UNKNOWN' };

type DiagnosisCandidateView = {
  mistakeId: string;
  target: DiagnosisTarget;
  rationale: string;
};

type MistakeView = {
  mistakeId: string;
  objectiveId: string;
  state: 'OBSERVED' | 'CONFIRMED' | 'CORRECTING' | 'RESOLVED';
  confirmedTarget: unknown;
  firstObservedAt: string;
  createdAt: string;
};

type CorrectionItemView = {
  id: string;
  mistakeId: string;
  objectiveId: string;
  kind: string;
  transferRound?: number;
  prompt: string;
  hint?: string;
  createdAt: string;
};

type ReasoningCheckView =
  | { id: string; kind: 'CHOICE'; prompt: string; options: Array<{ id: string; label: string }> }
  | { id: string; kind: 'FIELDS'; prompt: string; fields: string[] };

type CorrectionStartView = {
  mistake: MistakeView;
  item: CorrectionItemView;
  reasoningChecks: ReasoningCheckView[];
  guidance?: { diagnosisExplanation: string; socraticPrompts: string[]; workedExplanation?: string };
};

type CorrectionAttemptView = {
  id: string;
  outcome: 'CORRECT' | 'INCORRECT';
  hintUsed: boolean;
  retryOfAttemptId?: string;
  submittedAt: string;
};

type ReasoningResultView = {
  id: string;
  mistakeId: string;
  checkId: string;
  response: Record<string, string>;
  outcome: 'PASS' | 'FAIL';
  assisted: boolean;
  submittedAt: string;
};

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? '请求失败');
  return payload;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.onload = () => {
      const value = String(reader.result ?? '');
      const comma = value.indexOf(',');
      if (comma < 0) reject(new Error('图片编码失败'));
      else resolve(value.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function diagnosisLabel(target: DiagnosisTarget): string {
  if (target.kind === 'MISCONCEPTION') return '具体知识误区';
  switch (target.code) {
    case 'FACT_ERROR': return '基础事实或记忆错误';
    case 'PROCEDURE_ERROR': return '步骤或方法错误';
    case 'REPRESENTATION_ERROR': return '表示或理解错误';
    case 'UNKNOWN': return '暂时无法进一步细分';
  }
}

export function PilotStudentClient() {
  const [studentId, setStudentId] = useState(initialStudentId);
  const [nextLesson, setNextLesson] = useState<NextLesson | null>(null);
  const [lesson, setLesson] = useState<LessonSession | null>(null);
  const [practice, setPractice] = useState<PracticeSessionView | null>(null);
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [practiceAnswer, setPracticeAnswer] = useState('');
  const [practiceResult, setPracticeResult] = useState<PracticeAttemptView | null>(null);
  const [previousAttemptId, setPreviousAttemptId] = useState<string | undefined>();
  const [hint, setHint] = useState('');
  const [homework, setHomework] = useState<HomeworkView | null>(null);
  const [homeworkCorrections, setHomeworkCorrections] = useState<Record<string, string>>({});
  const [homeworkResults, setHomeworkResults] = useState<Record<string, string>>({});
  const [mistakes, setMistakes] = useState<MistakeView[]>([]);
  const [diagnosisCandidate, setDiagnosisCandidate] = useState<DiagnosisCandidateView | null>(null);
  const [correction, setCorrection] = useState<CorrectionStartView | null>(null);
  const [correctionAnswer, setCorrectionAnswer] = useState('');
  const [correctionAttempt, setCorrectionAttempt] = useState<CorrectionAttemptView | null>(null);
  const [reasoningResponses, setReasoningResponses] = useState<Record<string, Record<string, string>>>({});
  const [reasoningResults, setReasoningResults] = useState<Record<string, ReasoningResultView>>({});
  const [transfer, setTransfer] = useState<CorrectionItemView | null>(null);
  const [transferAnswer, setTransferAnswer] = useState('');
  const [actualMinutes, setActualMinutes] = useState(30);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const currentPracticeItem = practice?.items[practiceIndex] ?? null;
  const activeMistake = mistakes.find((mistake) => mistake.state !== 'RESOLVED') ?? null;
  const reasoningComplete = correction?.reasoningChecks.length
    ? correction.reasoningChecks.every((check) => reasoningResults[check.id]?.outcome === 'PASS')
    : false;
  const flow = derivePilotStudentFlow({
    hasStartedLesson: lesson !== null,
    hasNextLesson: nextLesson !== null,
    mistakeState: activeMistake?.state ?? null,
    correctionActive: correction !== null,
  });

  const stepLabel = useMemo(() => {
    if (practice && lesson) return '练习';
    if (flow === 'CORRECTION') return '订正';
    if (flow === 'ACTIVE_LESSON') return '学习中';
    if (flow === 'NEXT_LESSON') return '准备开始';
    return '本轮完成';
  }, [flow, lesson, practice]);

  async function post<T>(url: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return readJson<T>(response);
  }

  async function refresh() {
    const id = studentId.trim();
    if (!id) {
      setError('请输入学生 ID。');
      return;
    }
    setBusy('refresh');
    setError('');
    try {
      const [currentResponse, nextResponse, correctionResponse] = await Promise.all([
        fetch(`/api/pilot/lesson?studentId=${encodeURIComponent(id)}`, { cache: 'no-store' }),
        fetch(`/api/learning/next?studentId=${encodeURIComponent(id)}`, { cache: 'no-store' }),
        fetch(`/api/pilot/correction?studentId=${encodeURIComponent(id)}`, { cache: 'no-store' }),
      ]);
      const currentPayload = await readJson<{ lesson: LessonSession | null }>(currentResponse);
      const nextPayload = await readJson<{ nextLesson: NextLesson | null }>(nextResponse);
      const correctionPayload = await readJson<{ mistakes: MistakeView[] }>(correctionResponse);
      setLesson(currentPayload.lesson);
      setNextLesson(nextPayload.nextLesson);
      setMistakes(correctionPayload.mistakes);
      const observed = correctionPayload.mistakes.find((mistake) => mistake.state === 'OBSERVED');
      if (!observed || diagnosisCandidate?.mistakeId !== observed.mistakeId) setDiagnosisCandidate(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '读取失败');
    } finally {
      setBusy('');
    }
  }

  async function startLesson() {
    const id = studentId.trim();
    if (!id) return setError('请输入学生 ID。');
    if (flow !== 'NEXT_LESSON') return;
    setBusy('lesson');
    setError('');
    try {
      const started = await post<LessonSession>('/api/pilot/lesson', { command: 'START', studentId: id });
      setLesson(started);
      setPractice(null);
      setPracticeIndex(0);
      setPracticeResult(null);
      setPreviousAttemptId(undefined);
      setHint('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法开始课程');
    } finally {
      setBusy('');
    }
  }

  async function finishLesson(command: 'COMPLETE' | 'SKIP') {
    if (!lesson) return;
    setBusy('lesson');
    setError('');
    try {
      await post('/api/pilot/lesson', {
        command,
        studentId: studentId.trim(),
        lessonId: lesson.lessonId,
        ...(command === 'COMPLETE' ? { actualMinutes } : {}),
      });
      setLesson(null);
      setPractice(null);
      setCorrection(null);
      setTransfer(null);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法更新课程状态');
    } finally {
      setBusy('');
    }
  }

  async function beginPractice() {
    if (!lesson?.objectiveIds[0]) return;
    setBusy('practice');
    setError('');
    try {
      const result = await post<PracticeSessionView>('/api/pilot/practice', {
        command: 'CREATE_SESSION',
        studentId: studentId.trim(),
        lessonId: lesson.lessonId,
        objectiveId: lesson.objectiveIds[0],
      });
      setPractice(result);
      setPracticeIndex(0);
      setPracticeAnswer('');
      setPracticeResult(null);
      setPreviousAttemptId(undefined);
      setHint('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法创建练习');
    } finally {
      setBusy('');
    }
  }

  async function revealPracticeHint() {
    if (!currentPracticeItem || !practice) return;
    setBusy('practice');
    setError('');
    try {
      const result = await post<{ hint: string }>('/api/pilot/practice', {
        command: 'REVEAL_HINT',
        studentId: studentId.trim(),
        sessionId: practice.session.id,
        itemId: currentPracticeItem.id,
      });
      setHint(result.hint);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '没有可用提示');
    } finally {
      setBusy('');
    }
  }

  async function submitPractice() {
    if (!currentPracticeItem || !practice) return;
    setBusy('practice');
    setError('');
    try {
      const result = await post<PracticeAttemptView>('/api/pilot/practice', {
        command: 'SUBMIT_ATTEMPT',
        studentId: studentId.trim(),
        attemptId: newId('practice-attempt'),
        sessionId: practice.session.id,
        itemId: currentPracticeItem.id,
        answerText: practiceAnswer,
        ...(previousAttemptId ? { retryOfAttemptId: previousAttemptId } : {}),
      });
      setPracticeResult(result);
      if (result.outcome === 'INCORRECT') setPreviousAttemptId(result.id);
      else setPreviousAttemptId(undefined);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '提交失败');
    } finally {
      setBusy('');
    }
  }

  function nextPracticeItem() {
    setPracticeIndex((index) => index + 1);
    setPracticeAnswer('');
    setPracticeResult(null);
    setPreviousAttemptId(undefined);
    setHint('');
  }

  async function uploadHomework(file: File | null) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('作业图片仅支持 JPEG、PNG 或 WebP。');
      return;
    }
    setBusy('homework');
    setError('');
    try {
      const result = await post<HomeworkView>('/api/pilot/homework', {
        command: 'SUBMIT',
        studentId: studentId.trim(),
        bytesBase64: await fileToBase64(file),
        mimeType: file.type,
      });
      setHomework(result);
      setHomeworkResults({});
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '作业识别失败');
    } finally {
      setBusy('');
    }
  }

  async function confirmHomework(problem: HomeworkProblemView) {
    const answer = homeworkCorrections[problem.problem.id]?.trim();
    if (!answer) return setError('请输入要确认的答案。');
    setBusy('homework');
    setError('');
    try {
      await post('/api/pilot/homework', {
        command: 'CONFIRM',
        studentId: studentId.trim(),
        problemId: problem.problem.id,
        corrections: { answer },
        confirmerRole: 'STUDENT',
      });
      setHomeworkResults((current) => ({ ...current, [problem.problem.id]: '已确认，可以提交判定。' }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '确认失败');
    } finally {
      setBusy('');
    }
  }

  async function gradeHomework(problem: HomeworkProblemView) {
    setBusy('homework');
    setError('');
    try {
      const result = await post<{ attempt: { outcome: 'CORRECT' | 'INCORRECT' } }>('/api/pilot/homework', {
        command: 'GRADE',
        studentId: studentId.trim(),
        problemId: problem.problem.id,
        attemptId: newId('homework-attempt'),
      });
      setHomeworkResults((current) => ({
        ...current,
        [problem.problem.id]: result.attempt.outcome === 'CORRECT' ? '这题记录为正确。' : '这题需要订正，已加入订正记录。',
      }));
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '这题还不能判定，请先确认识别结果。');
    } finally {
      setBusy('');
    }
  }

  async function proposeDiagnosis() {
    if (!activeMistake || activeMistake.state !== 'OBSERVED') return;
    setBusy('correction');
    setError('');
    try {
      const result = await post<{ target: DiagnosisTarget; rationale: string }>('/api/pilot/correction', {
        command: 'PROPOSE_DIAGNOSIS',
        studentId: studentId.trim(),
        mistakeId: activeMistake.mistakeId,
      });
      setDiagnosisCandidate({ mistakeId: activeMistake.mistakeId, ...result });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '暂时无法生成诊断建议');
    } finally {
      setBusy('');
    }
  }

  async function confirmDiagnosis() {
    if (!activeMistake || activeMistake.state !== 'OBSERVED' || diagnosisCandidate?.mistakeId !== activeMistake.mistakeId) return;
    setBusy('correction');
    setError('');
    try {
      await post<MistakeView>('/api/pilot/correction', {
        command: 'CONFIRM_DIAGNOSIS',
        studentId: studentId.trim(),
        mistakeId: activeMistake.mistakeId,
        target: diagnosisCandidate.target,
        confirmerRole: 'PARENT',
      });
      setDiagnosisCandidate(null);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '诊断确认失败');
    } finally {
      setBusy('');
    }
  }

  function scrollToCorrection() {
    document.getElementById('pilot-correction')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function startCorrection() {
    if (!activeMistake || activeMistake.state === 'OBSERVED') return;
    setBusy('correction');
    setError('');
    try {
      const result = await post<CorrectionStartView>('/api/pilot/correction', {
        command: 'START',
        studentId: studentId.trim(),
        mistakeId: activeMistake.mistakeId,
      });
      setCorrection(result);
      setCorrectionAnswer('');
      setCorrectionAttempt(null);
      setReasoningResponses({});
      setReasoningResults({});
      setTransfer(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法开始订正');
    } finally {
      setBusy('');
    }
  }

  async function submitCorrectionRetry() {
    if (!correction) return;
    setBusy('correction');
    setError('');
    try {
      const result = await post<CorrectionAttemptView>('/api/pilot/correction', {
        command: 'SUBMIT_RETRY',
        studentId: studentId.trim(),
        mistakeId: correction.mistake.mistakeId,
        correctionItemId: correction.item.id,
        attemptId: newId('correction-attempt'),
        answerText: correctionAnswer,
      });
      setCorrectionAttempt(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '订正提交失败');
    } finally {
      setBusy('');
    }
  }

  function updateReasoning(checkId: string, field: string, value: string) {
    setReasoningResponses((current) => ({
      ...current,
      [checkId]: { ...(current[checkId] ?? {}), [field]: value },
    }));
  }

  async function submitReasoning(check: ReasoningCheckView) {
    setBusy('correction');
    setError('');
    try {
      const result = await post<ReasoningResultView>('/api/pilot/correction', {
        command: 'SUBMIT_REASONING',
        studentId: studentId.trim(),
        mistakeId: correction!.mistake.mistakeId,
        checkId: check.id,
        submissionId: newId('reasoning'),
        response: reasoningResponses[check.id] ?? {},
      });
      setReasoningResults((current) => ({ ...current, [check.id]: result }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '思路检查提交失败');
    } finally {
      setBusy('');
    }
  }

  async function prepareTransfer() {
    if (!correction) return;
    setBusy('correction');
    setError('');
    try {
      setTransfer(await post<CorrectionItemView>('/api/pilot/correction', {
        command: 'PREPARE_TRANSFER',
        studentId: studentId.trim(),
        mistakeId: correction.mistake.mistakeId,
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '还没到迁移练习这一步。');
    } finally {
      setBusy('');
    }
  }

  async function submitTransfer() {
    if (!correction || !transfer) return;
    setBusy('correction');
    setError('');
    try {
      const result = await post<CorrectionAttemptView>('/api/pilot/correction', {
        command: 'SUBMIT_TRANSFER',
        studentId: studentId.trim(),
        mistakeId: correction.mistake.mistakeId,
        correctionItemId: transfer.id,
        attemptId: newId('transfer-attempt'),
        answerText: transferAnswer,
      });
      if (result.outcome === 'CORRECT') {
        setCorrection(null);
        setTransfer(null);
        setTransferAnswer('');
        await refresh();
      } else {
        setError('迁移练习还没有通过，需要继续订正。');
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '迁移练习提交失败');
    } finally {
      setBusy('');
    }
  }

  return (
    <div>
      <header className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">Student loop</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">今天学什么？</h1>
          </div>
          <span className="rounded-full bg-stone-100 px-3 py-1.5 text-sm text-stone-600">{stepLabel}</span>
        </div>
        <p className="mt-3 max-w-2xl leading-7 text-stone-600">按当前学习事实完成这一节。页面不让你手动决定掌握状态，也不提前透露答案。</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <input
            value={studentId}
            onChange={(event) => setStudentId(event.target.value)}
            placeholder="学生 ID"
            className="min-w-0 flex-1 rounded-2xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-amber-500"
          />
          <button onClick={refresh} disabled={busy !== ''} className="rounded-2xl bg-stone-900 px-5 py-3 font-semibold text-white disabled:opacity-50">
            {busy === 'refresh' ? '读取中…' : '接下来'}
          </button>
        </div>
        {error && <p className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      </header>

      <section className="mt-5 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">Today</p>
            <h2 className="mt-2 text-xl font-semibold">学习安排</h2>
            {flow === 'CORRECTION' ? (
              <p className="mt-3 text-sm leading-6 text-stone-600">当前有需要处理的订正。完成订正后，系统再决定下一步学习安排。</p>
            ) : flow === 'COMPLETE' ? (
              <p className="mt-3 text-sm leading-6 text-stone-600">本轮学习安排已完成。没有待开始课程时不会再发送无效的开始请求。</p>
            ) : nextLesson ? (
              <div className="mt-3 text-sm leading-6 text-stone-600">
                <p className="font-medium text-stone-900">{nextLesson.objectiveSummary}</p>
                <p>{nextLesson.intent}{nextLesson.adapted ? ' · 已根据近期学习事实调整' : ''}</p>
              </div>
            ) : (
              <p className="mt-3 text-sm leading-6 text-stone-600">当前课程正在进行，完成这一节后再读取下一步安排。</p>
            )}
          </div>
          {flow === 'CORRECTION' ? (
            <button onClick={scrollToCorrection} disabled={busy !== ''} className="rounded-2xl bg-amber-600 px-5 py-3 font-semibold text-white disabled:opacity-50">去订正</button>
          ) : flow === 'NEXT_LESSON' ? (
            <button onClick={startLesson} disabled={busy !== '' || !studentId.trim()} className="rounded-2xl bg-amber-600 px-5 py-3 font-semibold text-white disabled:opacity-50">开始学习</button>
          ) : null}
        </div>

        {lesson && (
          <div className="mt-6 border-t border-stone-100 pt-5">
            <div className="flex flex-wrap gap-2 text-sm text-stone-600">
              <span className="rounded-full bg-stone-100 px-3 py-1">{lesson.intent}</span>
              <span className="rounded-full bg-stone-100 px-3 py-1">{lesson.execution.status}</span>
              {lesson.adapted && <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-800">受控调整</span>}
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              {lesson.practiceAvailable && (
                <button onClick={beginPractice} disabled={busy !== ''} className="rounded-2xl border border-stone-300 px-4 py-2.5 font-medium hover:bg-stone-50">练习</button>
              )}
              <label className="flex items-center gap-2 rounded-2xl border border-stone-200 px-3 py-2 text-sm text-stone-600">
                用时
                <input type="number" min={1} value={actualMinutes} onChange={(event) => setActualMinutes(Math.max(1, Number(event.target.value) || 1))} className="w-16 bg-transparent text-right outline-none" />
                分钟
              </label>
              <button onClick={() => finishLesson('COMPLETE')} disabled={busy !== ''} className="rounded-2xl bg-stone-900 px-4 py-2.5 font-medium text-white">完成本节</button>
              <button onClick={() => finishLesson('SKIP')} disabled={busy !== ''} className="rounded-2xl px-4 py-2.5 font-medium text-stone-500 hover:bg-stone-100">跳过本节</button>
            </div>
          </div>
        )}
      </section>

      {practice && (
        <section className="mt-5 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold">练习</h2>
            <p className="text-sm text-stone-500">{Math.min(practiceIndex + 1, practice.items.length)} / {practice.items.length}</p>
          </div>
          {!currentPracticeItem ? (
            <p className="mt-4 text-sm text-stone-600">本节没有生成练习题。</p>
          ) : (
            <div className="mt-5">
              <p className="text-lg font-medium leading-8">{currentPracticeItem.prompt}</p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <input value={practiceAnswer} onChange={(event) => setPracticeAnswer(event.target.value)} placeholder="写下你的答案" className="min-w-0 flex-1 rounded-2xl border border-stone-300 px-4 py-3 outline-none focus:border-amber-500" />
                <button onClick={revealPracticeHint} disabled={busy !== ''} className="rounded-2xl border border-stone-300 px-4 py-3 font-medium">查看提示</button>
                <button onClick={submitPractice} disabled={busy !== '' || practiceAnswer.length === 0} className="rounded-2xl bg-stone-900 px-5 py-3 font-semibold text-white disabled:opacity-50">提交答案</button>
              </div>
              {hint && <p className="mt-3 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">提示：{hint}</p>}
              {practiceResult && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-stone-50 p-4 text-sm">
                  <p>{practiceResult.outcome === 'CORRECT' ? '回答正确。' : '这次还不对，可以根据反馈再试一次。'}</p>
                  {practiceResult.outcome === 'CORRECT' && practiceIndex < practice.items.length - 1 && (
                    <button onClick={nextPracticeItem} className="font-semibold text-amber-700">下一题 →</button>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <section className="mt-5 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">上传作业</h2>
        <p className="mt-2 text-sm leading-6 text-stone-600">上传图片后，低置信或不明确的识别结果必须先确认，之后才会形成学习记录。</p>
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => uploadHomework(event.target.files?.[0] ?? null)} className="mt-4 block w-full text-sm text-stone-600" />
        {homework && (
          <div className="mt-5 space-y-4">
            {homework.problems.map((problem) => (
              <div key={problem.problem.id} className="rounded-2xl bg-stone-50 p-4">
                <p className="font-medium">{problem.problem.question.value}</p>
                <p className="mt-1 text-xs text-stone-500">识别状态：{problem.trustState}</p>
                {problem.trustState !== 'CONFIRMED' && (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                      value={homeworkCorrections[problem.problem.id] ?? ''}
                      onChange={(event) => setHomeworkCorrections((current) => ({ ...current, [problem.problem.id]: event.target.value }))}
                      placeholder="确认或修正学生作答"
                      className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2 outline-none"
                    />
                    <button onClick={() => confirmHomework(problem)} disabled={busy !== ''} className="rounded-xl border border-stone-300 px-4 py-2 font-medium">确认识别</button>
                  </div>
                )}
                <button onClick={() => gradeHomework(problem)} disabled={busy !== ''} className="mt-3 rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white">提交判定</button>
                {homeworkResults[problem.problem.id] && <p className="mt-2 text-sm text-stone-600">{homeworkResults[problem.problem.id]}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section id="pilot-correction" className="mt-5 scroll-mt-6 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">订正</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">只有系统已有的未解决错误才会进入这里。</p>
          </div>
          {activeMistake && activeMistake.state !== 'OBSERVED' && !correction && (
            <button onClick={startCorrection} disabled={busy !== ''} className="rounded-2xl bg-amber-600 px-4 py-2.5 font-semibold text-white">开始订正</button>
          )}
        </div>
        {!activeMistake && <p className="mt-4 text-sm text-stone-600">当前没有需要订正的错误。</p>}
        {activeMistake?.state === 'OBSERVED' && (
          <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-950">
            <p>这个错误无法仅凭一次作答唯一判断原因，需要家长确认后再进入订正。</p>
            {!diagnosisCandidate || diagnosisCandidate.mistakeId !== activeMistake.mistakeId ? (
              <button onClick={proposeDiagnosis} disabled={busy !== ''} className="mt-3 rounded-xl border border-amber-300 bg-white px-4 py-2 font-medium disabled:opacity-50">
                {busy === 'correction' ? '分析中…' : '生成诊断建议'}
              </button>
            ) : (
              <div className="mt-3 rounded-xl border border-amber-200 bg-white p-4">
                <p className="font-medium">建议判断：{diagnosisLabel(diagnosisCandidate.target)}</p>
                <p className="mt-1 text-stone-600">{diagnosisCandidate.rationale}</p>
                <button onClick={confirmDiagnosis} disabled={busy !== ''} className="mt-3 rounded-xl bg-stone-900 px-4 py-2 font-semibold text-white disabled:opacity-50">家长确认</button>
              </div>
            )}
          </div>
        )}

        {correction && (
          <div className="mt-5 space-y-5">
            {correction.guidance && (
              <div className="rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-stone-700">
                <p className="font-medium text-stone-900">{correction.guidance.diagnosisExplanation}</p>
                {correction.guidance.socraticPrompts.map((prompt) => <p key={prompt} className="mt-1">• {prompt}</p>)}
              </div>
            )}
            <div>
              <p className="font-medium">{correction.item.prompt}</p>
              {correction.item.hint && <p className="mt-1 text-sm text-stone-500">提示：{correction.item.hint}</p>}
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input value={correctionAnswer} onChange={(event) => setCorrectionAnswer(event.target.value)} placeholder="重新作答" className="min-w-0 flex-1 rounded-xl border border-stone-300 px-3 py-2 outline-none" />
                <button onClick={submitCorrectionRetry} disabled={busy !== '' || !correctionAnswer} className="rounded-xl bg-stone-900 px-4 py-2 font-semibold text-white disabled:opacity-50">提交订正</button>
              </div>
              {correctionAttempt && <p className="mt-2 text-sm text-stone-600">{correctionAttempt.outcome === 'CORRECT' ? '原题已改正，继续说明你的思路。' : '原题仍需继续尝试。'}</p>}
            </div>

            {correctionAttempt?.outcome === 'CORRECT' && correction.reasoningChecks.map((check) => (
              <div key={check.id} className="rounded-2xl bg-stone-50 p-4">
                <p className="font-medium">{check.prompt}</p>
                {check.kind === 'CHOICE' ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {check.options.map((option) => (
                      <button
                        key={option.id}
                        onClick={() => updateReasoning(check.id, 'optionId', option.id)}
                        className={`rounded-xl border px-3 py-2 text-sm ${reasoningResponses[check.id]?.optionId === option.id ? 'border-amber-500 bg-amber-50' : 'border-stone-300 bg-white'}`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {check.fields.map((field) => (
                      <input key={field} value={reasoningResponses[check.id]?.[field] ?? ''} onChange={(event) => updateReasoning(check.id, field, event.target.value)} placeholder={field} className="rounded-xl border border-stone-300 bg-white px-3 py-2 outline-none" />
                    ))}
                  </div>
                )}
                <div className="mt-3 flex items-center gap-3">
                  <button onClick={() => submitReasoning(check)} disabled={busy !== ''} className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-medium">提交思路</button>
                  {reasoningResults[check.id] && <span className="text-sm text-stone-600">{reasoningResults[check.id].outcome === 'PASS' ? '思路清楚。' : '再想一想这个关系。'}</span>}
                </div>
              </div>
            ))}

            {reasoningComplete && !transfer && (
              <button onClick={prepareTransfer} disabled={busy !== ''} className="rounded-2xl border border-amber-500 px-4 py-2.5 font-semibold text-amber-800">进入迁移练习</button>
            )}
            {transfer && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="font-medium">{transfer.prompt}</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input value={transferAnswer} onChange={(event) => setTransferAnswer(event.target.value)} placeholder="独立完成这道新题" className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2 outline-none" />
                  <button onClick={submitTransfer} disabled={busy !== '' || !transferAnswer} className="rounded-xl bg-amber-700 px-4 py-2 font-semibold text-white disabled:opacity-50">提交迁移练习</button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
