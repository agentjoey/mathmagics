import { notFound } from 'next/navigation';
import { loadQuestion, listQuestionIds } from '@/lib/questions';
import { ChatUI } from '@/components/ChatUI';

export function generateStaticParams() {
  return listQuestionIds().map(id => ({ id }));
}

export default function QuestionPage({ params }: { params: { id: string } }) {
  try {
    const question = loadQuestion(params.id);
    return <ChatUI question={question} />;
  } catch {
    notFound();
  }
}
