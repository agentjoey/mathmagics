'use client';
import { useState, useEffect, useRef } from 'react';
import type { Question, ChatMessage } from '@/lib/types';
import { QuestionCard } from './QuestionCard';
import { AgentMessage } from './AgentMessage';
import { MessageBubble } from './MessageBubble';
import { TextInput } from './TextInput';
import { IGotItButton } from './IGotItButton';

export function ChatUI({ question }: { question: Question }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void sendToServer([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, pending]);

  async function sendToServer(history: ChatMessage[]) {
    setSending(true);
    setPending('');
    let acc = '';
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: question.id, messages: history }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          const m = line.match(/^data: (.+)$/);
          if (!m) continue;
          const evt = JSON.parse(m[1]) as { delta?: string; done?: boolean; error?: string };
          if (evt.delta) {
            acc += evt.delta;
            setPending(acc);
          }
          if (evt.error) acc += `\n[错误：${evt.error}]`;
        }
      }
      setMessages(prev => [...prev, { role: 'assistant', content: acc }]);
      setPending('');
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `[错误：${(e as Error).message}]` }]);
    } finally {
      setSending(false);
    }
  }

  function onSend(text: string) {
    const next: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    void sendToServer(next);
  }

  function onIGotIt() {
    onSend('[USER_SIGNAL] 我懂了');
  }

  return (
    <main className="flex flex-col h-screen bg-amber-50">
      <header className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between">
        <a href="/" className="text-sm text-stone-500">← 返回</a>
        <span className="font-semibold">{question.display_name}</span>
        <IGotItButton onClick={onIGotIt} disabled={sending} />
      </header>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        <QuestionCard question={question} />
        {messages.map((m, i) =>
          m.role === 'assistant' ? (
            <AgentMessage key={i} text={m.content} />
          ) : (
            <MessageBubble key={i} role="user">{m.content}</MessageBubble>
          ),
        )}
        {pending && <AgentMessage text={pending} />}
      </div>
      <TextInput onSend={onSend} disabled={sending} />
    </main>
  );
}
