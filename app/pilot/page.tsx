import Link from 'next/link';
import { PilotSetupClient } from '@/components/pilot/PilotSetupClient';
import { listLevelObjectivesInCurriculumOrder } from '@/lib/planning';

const entryCards = [
  {
    href: '/pilot/student',
    eyebrow: 'Student',
    title: '学生学习',
    description: '查看今天的安排，完成学习、练习、作业和订正。',
  },
  {
    href: '/pilot/parent',
    eyebrow: 'Parent',
    title: '家长查看',
    description: '了解今天学了什么、哪里稳定、哪里需要支持，以及下一步为什么这样安排。',
  },
] as const;

export default function PilotHomePage() {
  const objectives = (['P2', 'P3'] as const).flatMap((levelId) =>
    listLevelObjectivesInCurriculumOrder(levelId).map((objective) => ({
      id: objective.id,
      title: objective.title,
      levelId,
    })),
  );

  return (
    <main className="min-h-screen bg-stone-50 px-6 py-12 text-stone-900">
      <div className="mx-auto max-w-5xl">
        <header className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-700">MathMagics Family Pilot</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">今天只处理真正需要处理的学习。</h1>
          <p className="mt-5 text-base leading-7 text-stone-600">
            单家庭试用入口。学习事实来自现有课程、练习、作业与订正记录，不在这里制造额外的分数或任务。
          </p>
        </header>

        <PilotSetupClient objectives={objectives} />

        <section className="mt-10 grid gap-5 md:grid-cols-2">
          {entryCards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="group rounded-[2rem] border border-stone-200 bg-white p-7 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">{card.eyebrow}</p>
              <h2 className="mt-3 text-2xl font-semibold">{card.title}</h2>
              <p className="mt-3 max-w-md leading-7 text-stone-600">{card.description}</p>
              <p className="mt-7 text-sm font-semibold text-amber-700 group-hover:text-amber-800">进入 →</p>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
