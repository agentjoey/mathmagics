import Image from 'next/image';
import { MessageBubble } from './MessageBubble';

interface Segment {
  type: 'text' | 'svg';
  content: string;
}

function splitSvg(text: string): Segment[] {
  const segments: Segment[] = [];
  const re = /<svg[\s\S]*?<\/svg>/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) {
      segments.push({ type: 'text', content: text.slice(lastIdx, m.index) });
    }
    segments.push({ type: 'svg', content: m[0] });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIdx) });
  }
  return segments;
}

export function AgentMessage({ text }: { text: string }) {
  const segments = splitSvg(text);
  return (
    <div className="flex gap-2 mb-3 items-start">
      <Image
        src="/avatar/mathmagics.png"
        alt="MathMagics"
        width={40}
        height={40}
        className="rounded-full flex-shrink-0 mt-1"
      />
      <div className="flex-1">
        <MessageBubble role="assistant">
          {segments.map((seg, i) =>
            seg.type === 'text' ? (
              <span key={i} className="whitespace-pre-wrap">{seg.content}</span>
            ) : (
              <span
                key={i}
                className="inline-block my-2"
                dangerouslySetInnerHTML={{ __html: seg.content }}
              />
            ),
          )}
        </MessageBubble>
      </div>
    </div>
  );
}
