export function MessageBubble({ children, role }: { children: React.ReactNode; role: 'user' | 'assistant' }) {
  const isUser = role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[80%] px-4 py-3 rounded-3xl text-base leading-relaxed ${
          isUser ? 'bg-blue-100 text-stone-800' : 'bg-amber-100 text-stone-800'
        }`}
      >
        {children}
      </div>
    </div>
  );
}
