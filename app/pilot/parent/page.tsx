import Link from 'next/link';
import { PilotParentClient } from '@/components/pilot/PilotParentClient';

export default function PilotParentPage() {
  return (
    <main className="min-h-screen bg-stone-50 px-4 py-8 text-stone-900 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link href="/pilot" className="text-sm font-medium text-stone-500 hover:text-stone-900">← 家庭试用</Link>
          <Link href="/pilot/student" className="text-sm font-medium text-amber-700 hover:text-amber-800">学生学习</Link>
        </div>
        <PilotParentClient />
      </div>
    </main>
  );
}
