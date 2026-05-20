import { notFound } from 'next/navigation';
import { loadQuestion, listQuestionIds } from '@/lib/questions';
import { ChatUI } from '@/components/ChatUI';

export function generateStaticParams() {
  return listQuestionIds().map(id => ({ id }));
}

export default async function QuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const question = loadQuestion(id);
    return <ChatUI question={question} />;
  } catch {
    notFound();
  }
}
