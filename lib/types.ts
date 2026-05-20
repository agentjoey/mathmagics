// Domain types for Q&A content
export type CpaStage = 'concrete' | 'pictorial' | 'abstract';

export interface SocraticStep {
  step: number;
  intent: string;
  sample_questions: string[];
  expected_insight: string;
}

export interface FeynmanTrap {
  misconception: string;
  agent_statement: string;
  correct_reasoning: string;
  trigger_condition: string;
}

export interface VisualAid {
  trigger: string;
  type: 'svg' | 'image';
  content: string;
}

export interface Question {
  id: string;
  source: string;
  display_name: string;
  image: string;
  problem_zh: string;
  problem_en: string;
  options?: string[];
  correct_answer: string;
  topic: string[];
  difficulty: number;
  cpa_stage: CpaStage;
  socratic_path: SocraticStep[];
  feynman_trap: FeynmanTrap;
  solution_explanation: string;
  visual_aids?: VisualAid[];
}

// LLM abstraction types
export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface LLMRequest {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  thinking?: boolean;
}

export interface LLMStream {
  textStream: AsyncIterable<string>;
}

export type LLMProvider = 'minimax';
