'use client';
import { useState } from 'react';

export function TextInput({ onSend, disabled }: { onSend: (text: string) => void; disabled: boolean }) {
  const [val, setVal] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = val.trim();
    if (!t) return;
    onSend(t);
    setVal('');
  }

  return (
    <form onSubmit={submit} className="flex gap-2 p-3 bg-white border-t">
      <input
        type="text"
        value={val}
        onChange={e => setVal(e.target.value)}
        placeholder="说说你的想法..."
        disabled={disabled}
        className="flex-1 px-4 py-3 border rounded-2xl text-base"
      />
      <button
        type="submit"
        disabled={disabled || !val.trim()}
        className="px-6 py-3 bg-blue-500 text-white rounded-2xl disabled:opacity-40"
      >
        发送
      </button>
    </form>
  );
}
