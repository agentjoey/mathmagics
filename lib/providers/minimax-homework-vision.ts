import Anthropic from '@anthropic-ai/sdk';
import type { HomeworkProblemExtraction, HomeworkVisionResult } from '@/lib/homework/types';
import { validateHomeworkVisionResult } from '@/lib/homework/validation';
import type { HomeworkVisionInput, HomeworkVisionProvider } from './homework-vision';

export type HomeworkVisionLLMCall = (input: HomeworkVisionInput) => Promise<string>;
const PROVIDER = 'minimax';
const MODEL = 'MiniMax-M2.7-highspeed';

async function defaultCall(input: HomeworkVisionInput): Promise<string> {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) throw new Error('MINIMAX_API_KEY not set');
  const client = new Anthropic({ apiKey, baseURL: 'https://api.minimax.io/anthropic' });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 3200,
    system: [
      'Extract visible elementary mathematics from the supplied homework image.',
      'Return raw JSON only with top-level field problems.',
      'Each problem must contain sequence, question, optional answer, and structured.',
      'Each visible field must contain value, confidence from 0 to 1, and normalized region x/y/width/height.',
      'structured contains family and fields. Do not output objectiveId, answer keys, grades, evidence, mastery, readiness, or recommendations.',
    ].join(' '),
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: input.mimeType, data: Buffer.from(input.bytes).toString('base64') } },
      { type: 'text', text: 'Extract the worksheet problems and visible student answers using the homework-vision-v1 observation schema.' },
    ] }],
  });
  return response.content.filter((block) => block.type === 'text').map((block) => block.text).join('');
}

function parse(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const unfenced = trimmed.startsWith('```') && trimmed.endsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, '')
    : trimmed;
  try {
    const parsed = JSON.parse(unfenced) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error('homework vision provider returned invalid JSON');
  }
}

export class MiniMaxHomeworkVisionProvider implements HomeworkVisionProvider {
  constructor(private readonly call: HomeworkVisionLLMCall = defaultCall) {}

  async extract(input: HomeworkVisionInput): Promise<HomeworkVisionResult> {
    const parsed = parse(await this.call(input));
    if (!Array.isArray(parsed.problems)) throw new Error('invalid homework vision content');
    const problems = parsed.problems.map((raw, index): HomeworkProblemExtraction => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('invalid homework vision content');
      const candidate = raw as Record<string, unknown>;
      const sequence = typeof candidate.sequence === 'number' ? candidate.sequence : index + 1;
      return {
        id: `${input.submissionId}:problem:${sequence}`,
        submissionId: input.submissionId,
        studentId: input.studentId,
        sequence,
        question: candidate.question as HomeworkProblemExtraction['question'],
        answer: candidate.answer as HomeworkProblemExtraction['answer'],
        structured: candidate.structured as HomeworkProblemExtraction['structured'],
        provider: PROVIDER,
        model: MODEL,
        schemaVersion: 'homework-vision-v1',
        createdAt: input.now,
      };
    });
    const result: HomeworkVisionResult = {
      submissionId: input.submissionId,
      studentId: input.studentId,
      provider: PROVIDER,
      model: MODEL,
      schemaVersion: 'homework-vision-v1',
      problems,
    };
    validateHomeworkVisionResult(result);
    return structuredClone(result);
  }
}
