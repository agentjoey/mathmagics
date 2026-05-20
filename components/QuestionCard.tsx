import Image from 'next/image';
import type { Question } from '@/lib/types';

export function QuestionCard({ question }: { question: Question }) {
  return (
    <div className="bg-white rounded-2xl shadow p-4 mb-4">
      <Image
        src={question.image}
        alt={question.display_name}
        width={600}
        height={400}
        className="w-full h-auto rounded-xl mb-3"
      />
      <p className="text-base leading-relaxed text-stone-700">{question.problem_zh}</p>
    </div>
  );
}
