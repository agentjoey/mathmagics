import Link from 'next/link';
import { PilotStudentClient } from '@/components/pilot/PilotStudentClient';

export default function PilotStudentPage() {
  return (
    <main className="min-h-screen bg-stone-50 px-4 py-8 text-stone-900 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link href="/pilot" className="text-sm font-medium text-stone-500 hover:text-stone-900">← 家庭试用</Link>
          <Link href="/pilot/parent" className="text-sm font-medium text-amber-700 hover:text-amber-800">家长查看</Link>
        </div>
        <PilotStudentClient />
      </div>
    </main>
  );
}
