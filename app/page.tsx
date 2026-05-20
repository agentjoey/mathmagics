import Link from 'next/link';

const QUESTIONS = [
  { id: 'Q05', emoji: '🎲', name: '骰子之谜', topic: '逻辑推理', difficulty: 3 },
  { id: 'Q18', emoji: '❄️', name: '折纸雪花', topic: '对称几何', difficulty: 5 },
];

export default function HomePage() {
  return (
    <main className="min-h-screen p-8 flex flex-col items-center bg-amber-50">
      <h1 className="text-4xl font-semibold mt-12 mb-2">MathMagics</h1>
      <p className="text-stone-600 mb-12">和你一起琢磨数学</p>
      <p className="text-lg mb-6">今天想琢磨什么？</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
        {QUESTIONS.map(q => (
          <Link
            key={q.id}
            href={`/q/${q.id}`}
            className="block p-8 rounded-3xl bg-white shadow-md hover:shadow-lg transition border-2 border-transparent hover:border-amber-300"
          >
            <div className="text-5xl mb-3">{q.emoji}</div>
            <div className="text-xl font-semibold">{q.name}</div>
            <div className="text-sm text-stone-500 mt-1">
              {q.topic} · {q.difficulty}分
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
