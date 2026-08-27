import Link from 'next/link';

const QUESTIONS = [
  { id: 'Q05', emoji: '🎲', name: '骰子之谜', topic: '逻辑推理', difficulty: 3 },
  { id: 'Q18', emoji: '❄️', name: '折纸雪花', topic: '对称几何', difficulty: 5 },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-stone-50 px-6 py-12 text-stone-900">
      <div className="mx-auto max-w-5xl">
        <header>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-700">MathMagics</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">和你一起琢磨数学</h1>
        </header>

        <Link href="/pilot" className="mt-10 block rounded-[2rem] border border-amber-200 bg-amber-50 p-7 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Phase 8</p>
          <h2 className="mt-3 text-2xl font-semibold">家庭试用</h2>
          <p className="mt-3 max-w-2xl leading-7 text-stone-600">进入学生学习或家长查看，使用真实课程、练习、作业、订正与下一步安排。</p>
          <p className="mt-6 text-sm font-semibold text-amber-800">进入家庭试用 →</p>
        </Link>

        <section className="mt-12 border-t border-stone-200 pt-8">
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">Legacy fixtures</p>
            <h2 className="mt-2 text-xl font-semibold">旧版演示</h2>
            <p className="mt-1 text-sm text-stone-500">保留用于回归检查，不是当前家庭试用主入口。</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {QUESTIONS.map((question) => (
              <Link key={question.id} href={`/q/${question.id}`} className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm hover:shadow-md">
                <div className="text-3xl">{question.emoji}</div>
                <div className="mt-3 font-semibold">{question.name}</div>
                <div className="mt-1 text-sm text-stone-500">{question.topic} · 难度 {question.difficulty}</div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
