'use client';
import { useState } from 'react';

export default function AuthPage() {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    });
    if (res.ok) {
      window.location.href = '/';
    } else {
      setErr('密码不对哦');
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold text-center">MathMagics</h1>
        <input
          type="password"
          value={pw}
          onChange={e => setPw(e.target.value)}
          placeholder="请输入密码"
          className="w-full px-4 py-3 border rounded-2xl text-lg"
          autoFocus
        />
        {err && <p className="text-red-500 text-sm text-center">{err}</p>}
        <button
          type="submit"
          className="w-full px-4 py-3 bg-blue-500 text-white rounded-2xl text-lg"
        >
          进入
        </button>
      </form>
    </main>
  );
}
