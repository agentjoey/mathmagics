import { NextRequest } from 'next/server';
import { loadQuestion } from '@/lib/questions';
import { buildSystemPrompt } from '@/lib/prompts';
import { chat } from '@/lib/llm';
import type { ChatMessage } from '@/lib/types';

export const runtime = 'nodejs';

interface ChatRequest {
  questionId: string;
  messages: ChatMessage[];
}

export async function POST(req: NextRequest) {
  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  if (!body.questionId || !Array.isArray(body.messages)) {
    return new Response('Missing questionId or messages', { status: 400 });
  }

  let question;
  try {
    question = loadQuestion(body.questionId);
  } catch (e) {
    return new Response((e as Error).message, { status: 404 });
  }

  const system = buildSystemPrompt(question);

  let llmStream;
  try {
    llmStream = await chat({ system, messages: body.messages });
  } catch (e) {
    return new Response(`LLM error: ${(e as Error).message}`, { status: 502 });
  }

  const encoder = new TextEncoder();
  const sseStream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of llmStream.textStream) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: chunk })}
\n`));
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}
\n`));
      } catch (e) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: (e as Error).message })}
\n`),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(sseStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
