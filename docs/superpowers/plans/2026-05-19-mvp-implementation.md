# MathMagics MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 2-question (Q05 + Q18) Math Kangaroo Socratic chat MVP to validate that the Socratic + Feynman pedagogy creates real "aha moments" for G3-G4 kids.

**Architecture:** Next.js App Router + Edge runtime + SSE streaming. Pure prompt-driven Socratic flow (no server-side state machine). LLM abstraction layer supports Kimi K2.6 / MiniMax M2.7 swap via env var (Claude provider deferred — not in MVP scope). Agent dynamically generates inline SVG; static question images pre-rendered; agent avatar one-time generated via MiniMax image-01.

**Tech Stack:**
- Next.js 14+ (App Router, Edge runtime)
- TypeScript + Tailwind CSS
- `openai` SDK for Kimi (OpenAI-compatible endpoint)
- `@anthropic-ai/sdk` for MiniMax (Anthropic-compatible endpoint)
- macOS Keychain for all API keys (no plaintext in repo)
- Vercel deployment with cookie-based password gate
- Vitest for unit tests

**Reference docs:**
- `Brain#2/10_Projects/Active/P012-MathMagics/MVP-Design.md` (v1.1) — full design spec
- `Brain#2/10_Projects/_AGENT-ORCHESTRATION-SPEC.md` — P022 project structure
- Memory `feedback_secrets_keychain` — credential management pattern

---

## File Structure (locked)

```
mathmagics-mvp/
├── README.md
├── CLAUDE.md                       # ≤150 lines technical context
├── GEMINI.md                       # symlink → CLAUDE.md
├── AGENTS.md                       # symlink → CLAUDE.md
├── package.json
├── tsconfig.json
├── next.config.mjs
├── tailwind.config.ts
├── postcss.config.mjs
├── vitest.config.ts
├── .env.example                    # template; real .env.local gitignored
├── .gitignore
├── middleware.ts                   # password gate
├── .claude/
│   └── settings.json               # PostBash hook for release.sh reminders
├── .agent/
│   ├── CURRENT.md
│   ├── BACKLOG.md
│   └── sprints/
│       └── sprint-001.md
├── docs/
│   ├── architecture.md             # brief; points to Obsidian MVP-Design.md
│   ├── deployment.md
│   ├── operations.md
│   └── superpowers/
│       └── plans/
│           └── 2026-05-19-mvp-implementation.md   # this file
├── app/
│   ├── layout.tsx
│   ├── globals.css
│   ├── page.tsx                    # home: pick Q05 or Q18
│   ├── auth/
│   │   └── page.tsx
│   ├── q/[id]/
│   │   └── page.tsx                # chat UI page
│   └── api/
│       ├── auth/
│       │   └── route.ts            # password verify, set cookie
│       └── chat/
│           └── route.ts            # SSE LLM proxy
├── components/
│   ├── ChatUI.tsx
│   ├── QuestionCard.tsx
│   ├── MessageBubble.tsx
│   ├── AgentMessage.tsx            # SVG-aware rendering
│   ├── TextInput.tsx
│   └── IGotItButton.tsx
├── lib/
│   ├── types.ts                    # Question, Message, LLMRequest/Stream
│   ├── llm.ts                      # provider dispatcher
│   ├── prompts.ts                  # system prompt template + builder
│   ├── questions.ts                # JSON loader
│   └── providers/
│       ├── kimi.ts
│       └── minimax.ts
├── questions/
│   ├── Q05.json
│   └── Q18.json
├── scripts/
│   ├── load-env-from-keychain.sh   # wraps `npm run dev` etc.
│   └── generate-avatar.ts          # one-shot MiniMax image-01 call
├── tests/
│   ├── prompts.test.ts
│   ├── questions.test.ts
│   └── providers-smoke.test.ts     # real-API smoke, gated by env
└── public/
    ├── avatar/
    │   └── mathmagics.png          # committed binary asset
    └── images/
        ├── Q05-dice.png
        └── Q18-snowflake.png
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.mjs`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `.gitignore`

- [ ] **Step 1: Scaffold Next.js**

```bash
cd ~/AgentWorks/CodeSpace/mathmagics-mvp
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias "@/*" --use-npm
```

When prompted "Use ESLint?" → Yes. "Use Turbopack?" → No (Edge runtime stability priority).

- [ ] **Step 2: Verify scaffold**

```bash
ls -1 | grep -E "^(app|package.json|tsconfig.json|next.config|tailwind.config)"
```

Expected output:
```
app
next.config.mjs
package.json
tailwind.config.ts
tsconfig.json
```

- [ ] **Step 3: Install runtime dependencies**

```bash
npm install openai@^4 @anthropic-ai/sdk@^0.30
```

- [ ] **Step 4: Install dev dependencies**

```bash
npm install -D vitest @vitest/ui @types/node
```

- [ ] **Step 5: Add vitest config**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});
```

- [ ] **Step 6: Add npm scripts**

Edit `package.json` `"scripts"` block to be:

```json
"scripts": {
  "dev": "./scripts/load-env-from-keychain.sh next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint .",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

**注：** Next.js 16 移除了 `next lint`，所以用 `eslint .` 直接调用，create-next-app 已自动生成 `eslint.config.mjs`。Tailwind v4 是 CSS-first 配置，没有 `tailwind.config.ts`，配置写在 `app/globals.css` 里——这两点都是正常状态，不要为对齐文件结构清单而手动补建。

- [ ] **Step 7: Smoke test the scaffold**

```bash
npm run lint
```

Expected: no errors (warnings OK).

- [ ] **Step 8: Initial commit**

```bash
git init
git add -A
git commit -m "chore: initial Next.js + TypeScript + Tailwind scaffold"
```

---

## Task 2: Keychain Credential Loader

**Files:**
- Create: `scripts/load-env-from-keychain.sh`, `.env.example`

- [ ] **Step 1: Add credentials to Keychain (run once manually)**

Run interactively, paste each key when prompted:

```bash
read -s -p "KIMI_API_KEY: " KEY && security add-generic-password -s "kimi-api-key" -a "$USER" -w "$KEY" -U && unset KEY
read -s -p "MINIMAX_API_KEY: " KEY && security add-generic-password -s "minimax-api-key" -a "$USER" -w "$KEY" -U && unset KEY
read -s -p "Site password (any string): " KEY && security add-generic-password -s "mathmagics-site-password" -a "$USER" -w "$KEY" -U && unset KEY
```

Verify:

```bash
for s in kimi-api-key minimax-api-key mathmagics-site-password; do
  security find-generic-password -s "$s" -a "$USER" >/dev/null 2>&1 && echo "✅ $s" || echo "❌ $s missing"
done
```

Expected: 3 ✅ lines.

- [ ] **Step 2: Create the loader script**

Create `scripts/load-env-from-keychain.sh`:

```bash
#!/usr/bin/env bash
# Reads required secrets from macOS Keychain and execs the given command with them in env.
# Usage: ./scripts/load-env-from-keychain.sh <command> [args...]
set -euo pipefail

kc() { security find-generic-password -s "$1" -a "$USER" -w 2>/dev/null; }

export KIMI_API_KEY="$(kc kimi-api-key)"
export MINIMAX_API_KEY="$(kc minimax-api-key)"
export SITE_PASSWORD="$(kc mathmagics-site-password)"
export LLM_PROVIDER="${LLM_PROVIDER:-kimi}"

for var in KIMI_API_KEY MINIMAX_API_KEY SITE_PASSWORD; do
  if [ -z "${!var:-}" ]; then
    echo "ERROR: $var not found in Keychain" >&2
    exit 1
  fi
done

exec "$@"
```

- [ ] **Step 3: Make executable**

```bash
chmod +x scripts/load-env-from-keychain.sh
```

- [ ] **Step 4: Create .env.example**

Create `.env.example`:

```bash
# Secrets are loaded from macOS Keychain by scripts/load-env-from-keychain.sh
# This file documents what env vars the app expects. DO NOT put real values here.
KIMI_API_KEY=
MINIMAX_API_KEY=
SITE_PASSWORD=
LLM_PROVIDER=kimi  # one of: kimi | minimax
```

- [ ] **Step 5: Update .gitignore**

Append to `.gitignore`:

```
.env.local
.env*.local
```

- [ ] **Step 6: Verify loader works**

```bash
./scripts/load-env-from-keychain.sh env | grep -E "(KIMI|MINIMAX|SITE|LLM)" | sed 's/=.*/=<set>/'
```

Expected 4 lines with `=<set>`.

- [ ] **Step 7: Commit**

```bash
git add scripts/ .env.example .gitignore
git commit -m "feat: Keychain-based credential loader"
```

---

## Task 3: Type Definitions

**Files:**
- Create: `lib/types.ts`

- [ ] **Step 1: Write types file**

Create `lib/types.ts`:

```typescript
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

export type LLMProvider = 'kimi' | 'minimax';
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat: type definitions for Question and LLM abstraction"
```

---

## Task 4: Question Bank — Q05 (Dice)

**Files:**
- Create: `questions/Q05.json`, `public/images/Q05-dice.png`

- [ ] **Step 1: Source the dice question image**

Source the original Q05 image from Math Kangaroo 2025 Level B Q05. Save scanned/cropped PNG to `public/images/Q05-dice.png`. If you don't have the source PDF handy, check `/Users/xtation/Downloads/袋鼠数学/` (per MVP-Design §15).

Verify:

```bash
file public/images/Q05-dice.png
```

Expected: `PNG image data, ...` with reasonable dimensions (e.g. 600x400).

- [ ] **Step 2: Write Q05.json**

Create `questions/Q05.json`:

```json
{
  "id": "Q05",
  "source": "Math Kangaroo 2025 Level B Q05",
  "display_name": "骰子之谜",
  "image": "/images/Q05-dice.png",
  "problem_zh": "一个标准骰子相对两面的点数和为 7。下图展示了三个骰子。问号位置的数字是多少？",
  "problem_en": "On a standard die, the numbers on opposite faces sum to 7. Three dice are shown below. What number is on the face marked with '?'",
  "options": ["1", "2", "3", "4", "5"],
  "correct_answer": "4",
  "topic": ["logic", "spatial"],
  "difficulty": 3,
  "cpa_stage": "pictorial",
  "socratic_path": [
    {
      "step": 1,
      "intent": "确认孩子知道标准骰子的相对面规则",
      "sample_questions": [
        "你玩过骰子吗？标准骰子相对两面有什么特别的关系？",
        "如果一面是 1，对面是几？为什么？"
      ],
      "expected_insight": "相对两面之和 = 7"
    },
    {
      "step": 2,
      "intent": "引导观察图中三个骰子的可见面",
      "sample_questions": [
        "图里第一个骰子，你能看到哪几个面？它们都是哪些数字？",
        "如果你看到的这一面是 3，那么背面会是几？"
      ],
      "expected_insight": "从可见面推出隐藏面"
    },
    {
      "step": 3,
      "intent": "推理问号位置",
      "sample_questions": [
        "问号那个面，它跟旁边哪个面是相对的？",
        "那这一面应该是多少？"
      ],
      "expected_insight": "应用规则得出 4"
    }
  ],
  "feynman_trap": {
    "misconception": "误把'相邻'当成'相对'",
    "agent_statement": "我刚刚算的时候有点糊涂——我看到旁边那个面是 4，就以为问号也是 4，因为它们靠得最近。但好像哪里不对劲…你能帮我想想为什么吗？",
    "correct_reasoning": "相邻 ≠ 相对。相加为 7 的是正对面那一面，不是挨着的面。",
    "trigger_condition": "在孩子完成第 2 步并能正确指出某一面的对面后"
  },
  "solution_explanation": "标准骰子相对面和为 7。问号面相对的是 3，所以问号 = 7 - 3 = 4。",
  "visual_aids": []
}
```

- [ ] **Step 3: Verify JSON is valid**

```bash
node -e "JSON.parse(require('fs').readFileSync('questions/Q05.json','utf8'))" && echo OK
```

Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add questions/Q05.json public/images/Q05-dice.png
git commit -m "feat: Q05 dice question content and image"
```

---

## Task 5: Question Bank — Q18 (Paper Snowflake)

**Files:**
- Create: `questions/Q18.json`, `public/images/Q18-snowflake.png`

- [ ] **Step 1: Source the snowflake question image**

Save Math Kangaroo 2025 Level B Q18 image to `public/images/Q18-snowflake.png`.

- [ ] **Step 2: Write Q18.json**

Create `questions/Q18.json` (use the data from `history/Research/Q18_Interaction_Spec_v1.0.md` as authoritative source — replace placeholder text below with real values from that spec):

```json
{
  "id": "Q18",
  "source": "Math Kangaroo 2025 Level B Q18",
  "display_name": "折纸雪花",
  "image": "/images/Q18-snowflake.png",
  "problem_zh": "将一张正方形纸对折两次得到一个小正方形，然后剪出一个图案。展开后会得到下面哪一个雪花？",
  "problem_en": "A square paper is folded in half twice and then a pattern is cut. Which of the following snowflakes will appear when the paper is unfolded?",
  "options": ["A", "B", "C", "D", "E"],
  "correct_answer": "<TODO: confirm from spec>",
  "topic": ["geometry", "symmetry"],
  "difficulty": 5,
  "cpa_stage": "pictorial",
  "socratic_path": [
    {
      "step": 1,
      "intent": "让孩子理解对折产生的对称性",
      "sample_questions": [
        "你折过纸吗？把纸对折一下，剪一个洞，展开后会看到什么？",
        "对折一次会形成几条对称轴？两次呢？"
      ],
      "expected_insight": "对折两次 → 四象限对称（上下、左右都对称）"
    },
    {
      "step": 2,
      "intent": "引导观察小正方形上剪了什么形状",
      "sample_questions": [
        "看看那个小正方形被剪掉了哪部分？",
        "剪掉的部分靠近哪一条边？是折痕那条还是开口那条？"
      ],
      "expected_insight": "剪痕位置 + 折痕走向决定展开后形状"
    },
    {
      "step": 3,
      "intent": "逆向推理：模拟展开",
      "sample_questions": [
        "如果把这张小纸打开一次，会变成什么样？",
        "再打开一次呢？把刚才那个图形上下/左右镜像一下试试。"
      ],
      "expected_insight": "应用两次镜像得到完整图案"
    }
  ],
  "feynman_trap": {
    "misconception": "认为剪掉的区域只在一处出现（忽略对称镜像）",
    "agent_statement": "我看到小正方形右上角剪了一块，所以展开后应该只在右上角有个洞，对吧？嗯…可是答案里好像没有这种…",
    "correct_reasoning": "对折两次相当于做了 2 次镜像，剪痕会出现在 4 个对称位置上。",
    "trigger_condition": "在孩子完成第 2 步并能描述剪痕位置后"
  },
  "solution_explanation": "对折两次后纸张分成 4 个象限，剪出的图案会被复制到所有 4 个象限并镜像对齐。",
  "visual_aids": []
}
```

**Note:** Verify `correct_answer` against the spec before committing.

- [ ] **Step 3: Verify JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('questions/Q18.json','utf8'))" && echo OK
```

- [ ] **Step 4: Commit**

```bash
git add questions/Q18.json public/images/Q18-snowflake.png
git commit -m "feat: Q18 snowflake question content and image"
```

---

## Task 6: Question Loader

**Files:**
- Create: `lib/questions.ts`, `tests/questions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/questions.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { loadQuestion, listQuestionIds } from '@/lib/questions';

describe('loadQuestion', () => {
  it('loads Q05 with required fields', () => {
    const q = loadQuestion('Q05');
    expect(q.id).toBe('Q05');
    expect(q.correct_answer).toBe('4');
    expect(q.socratic_path.length).toBe(3);
    expect(q.feynman_trap.agent_statement).toContain('糊涂');
  });

  it('throws on unknown id', () => {
    expect(() => loadQuestion('XX')).toThrow(/unknown question/i);
  });
});

describe('listQuestionIds', () => {
  it('returns Q05 and Q18', () => {
    const ids = listQuestionIds();
    expect(ids).toEqual(expect.arrayContaining(['Q05', 'Q18']));
    expect(ids.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test, confirm it fails**

```bash
npm test
```

Expected: FAIL with `Cannot find module '@/lib/questions'`.

- [ ] **Step 3: Implement the loader**

Create `lib/questions.ts`:

```typescript
import fs from 'node:fs';
import path from 'node:path';
import type { Question } from './types';

const QUESTIONS_DIR = path.join(process.cwd(), 'questions');
const AVAILABLE_IDS = ['Q05', 'Q18'] as const;

export function listQuestionIds(): string[] {
  return [...AVAILABLE_IDS];
}

export function loadQuestion(id: string): Question {
  if (!AVAILABLE_IDS.includes(id as typeof AVAILABLE_IDS[number])) {
    throw new Error(`Unknown question id: ${id}`);
  }
  const filePath = path.join(QUESTIONS_DIR, `${id}.json`);
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as Question;
}
```

- [ ] **Step 4: Run test, confirm pass**

```bash
npm test
```

Expected: 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add lib/questions.ts tests/questions.test.ts
git commit -m "feat: question loader with tests"
```

---

## Task 7: System Prompt Builder

**Files:**
- Create: `lib/prompts.ts`, `tests/prompts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/prompts.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '@/lib/prompts';
import { loadQuestion } from '@/lib/questions';

describe('buildSystemPrompt', () => {
  it('injects question metadata into template', () => {
    const q = loadQuestion('Q05');
    const prompt = buildSystemPrompt(q);

    expect(prompt).toContain('骰子之谜');
    expect(prompt).toContain('相对两面之和 = 7');
    expect(prompt).toContain(q.feynman_trap.agent_statement);
    expect(prompt).toContain('pictorial');
    // Must NOT contain unfilled placeholders
    expect(prompt).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it('lists all 3 socratic steps with their intents', () => {
    const q = loadQuestion('Q05');
    const prompt = buildSystemPrompt(q);
    for (const step of q.socratic_path) {
      expect(prompt).toContain(step.intent);
    }
  });

  it('does not leak the correct answer outside the explicit answer line', () => {
    const q = loadQuestion('Q05');
    const prompt = buildSystemPrompt(q);
    // correct_answer appears in metadata block but NOT in user-facing instructions
    const occurrences = prompt.match(/正确答案/g) || [];
    expect(occurrences.length).toBeLessThanOrEqual(2);  // metadata + "不要直接说出来" reminder
  });
});
```

- [ ] **Step 2: Run test, confirm fail**

```bash
npm test
```

Expected: FAIL with `Cannot find module '@/lib/prompts'`.

- [ ] **Step 3: Implement the prompt builder**

Create `lib/prompts.ts`:

```typescript
import type { Question } from './types';

const PROMPT_TEMPLATE = `你是 MathMagics，一个和孩子一起探索数学的好奇伙伴。你不是老师，更不是答题机器。

# 你的核心信念
- **不直接给答案。** 答案要由孩子自己发现。
- **你是同行者，不是裁判。** 你不评判对错，你和孩子一起琢磨。
- **顿悟感比正确率重要。** 一次"我懂了！"比答对十道题珍贵。

# 你必须遵守的规则

## 规则1：Socratic 引导（最多 3 步）
这道题的引导路径已设计好：
{{SOCRATIC_PATH_INJECTION}}

每一步，你只问一个问题。等孩子回答后再走下一步。
如果孩子第 1 步就答对了，跳过它，直接进第 2 步。
如果孩子卡在某一步超过 3 轮，给一个更小的提示，但不要直接给答案。

## 规则2：Feynman 纠错模式（关键差异化）
**触发时机：{{FEYNMAN_TRIGGER}}**

触发后，你要"装作自己有点糊涂"，说出下面这句话（可改述但保留核心错误）：
"{{AGENT_STATEMENT}}"

这是故意犯的错。等孩子纠正你。
如果孩子也跟着错了，温和提问引导："等等，我们再看看 X..."
如果孩子纠正了你，热烈赞美："你是怎么发现的？你比我想得清楚！"

## 规则3：视觉辅助（SVG）
当文字解释不清时，你可以在回复里直接嵌入 SVG，前端会原样渲染。
SVG 应当：
- 简单清晰（不超过 300x300 px）
- 颜色用柔和色（淡蓝 #B3D9FF / 浅黄 #FFE9B0 / 薄荷绿 #B8E6CB）
- 关键元素用粗线条标注

不要每条回复都画图。只在解释抽象概念或确实需要可视化时画。

## 规则4：语言风格
- 对象：8-10 岁孩子
- 句子短，每段不超过 3 句话
- 多用反问、不用"应该"、"必须"
- 偶尔加一句俏皮话（不要过度）
- 检测孩子输入语言（中文/英文）后用同种语言回应

## 规则5：结束信号
- 孩子输入 "[USER_SIGNAL] 我懂了" → 进入收尾流程：
  1. 邀请孩子"你能用自己的话讲一遍吗？"（Feynman Self-Test）
  2. 听完后给一个小总结
  3. 问"想试试另一道题吗？"
- 孩子明显放弃（"不想玩了"、"算了"）→ 温和结束，不强求

## 规则6：边界情况
- 孩子瞎猜：不否定，反问"你是怎么想到这个数的？"
- 孩子答非所问：温和拉回正题
- 孩子情绪化（"好难！"）：先共情"是有点烧脑哈"，再小步引导
- 你不知道怎么回应：宁可沉默一秒（输出"嗯…"），不要乱说

# 这道题
- **题目名称**：{{DISPLAY_NAME}}
- **题目**：{{PROBLEM_ZH}}
- **正确答案**：{{CORRECT_ANSWER}}（注意：不要直接说出来）
- **解题思路**：{{SOLUTION_EXPLANATION}}
- **CPA 阶段**：{{CPA_STAGE}}

# 开场
如果对话历史为空，主动用一句话开场：
"嗨！我是 MathMagics。这道题挺有意思的，咱们一起琢磨琢磨？你先看看题目，告诉我你注意到了什么。"

现在开始。记住：你是同行者，不是老师。`;

export function buildSystemPrompt(question: Question): string {
  const socraticPath = question.socratic_path
    .map(s => `- 第${s.step}步｜${s.intent}｜示例问法："${s.sample_questions[0]}"｜目标领悟："${s.expected_insight}"`)
    .join('\n');

  return PROMPT_TEMPLATE
    .replaceAll('{{SOCRATIC_PATH_INJECTION}}', socraticPath)
    .replaceAll('{{FEYNMAN_TRIGGER}}', question.feynman_trap.trigger_condition)
    .replaceAll('{{AGENT_STATEMENT}}', question.feynman_trap.agent_statement)
    .replaceAll('{{DISPLAY_NAME}}', question.display_name)
    .replaceAll('{{PROBLEM_ZH}}', question.problem_zh)
    .replaceAll('{{CORRECT_ANSWER}}', question.correct_answer)
    .replaceAll('{{SOLUTION_EXPLANATION}}', question.solution_explanation)
    .replaceAll('{{CPA_STAGE}}', question.cpa_stage);
}
```

- [ ] **Step 4: Run test, confirm all pass**

```bash
npm test
```

Expected: all tests passing.

- [ ] **Step 5: Commit**

```bash
git add lib/prompts.ts tests/prompts.test.ts
git commit -m "feat: system prompt builder with template injection"
```

---

## Task 8: LLM Abstraction Layer (Dispatcher)

**Files:**
- Create: `lib/llm.ts`

- [ ] **Step 1: Write the dispatcher**

Create `lib/llm.ts`:

```typescript
import type { LLMRequest, LLMStream, LLMProvider } from './types';
import { kimiChat } from './providers/kimi';
import { minimaxChat } from './providers/minimax';

export function getProvider(): LLMProvider {
  const p = (process.env.LLM_PROVIDER || 'kimi') as LLMProvider;
  if (!['kimi', 'minimax'].includes(p)) {
    throw new Error(`Invalid LLM_PROVIDER: ${p}`);
  }
  return p;
}

export async function chat(req: LLMRequest): Promise<LLMStream> {
  switch (getProvider()) {
    case 'kimi':    return kimiChat(req);
    case 'minimax': return minimaxChat(req);
  }
}
```

- [ ] **Step 2: Add provider stubs (will implement in Tasks 9-11)**

Create stubs so the dispatcher compiles. Create `lib/providers/kimi.ts`:

```typescript
import type { LLMRequest, LLMStream } from '../types';

export async function kimiChat(_req: LLMRequest): Promise<LLMStream> {
  throw new Error('kimiChat not implemented yet');
}
```

Create `lib/providers/minimax.ts`:

```typescript
import type { LLMRequest, LLMStream } from '../types';

export async function minimaxChat(_req: LLMRequest): Promise<LLMStream> {
  throw new Error('minimaxChat not implemented yet');
}
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/llm.ts lib/providers/
git commit -m "feat: LLM dispatcher with provider stubs"
```

---

## Task 9: Kimi Provider Implementation

**Files:**
- Modify: `lib/providers/kimi.ts`

- [ ] **Step 1: Implement Kimi via OpenAI SDK**

Replace `lib/providers/kimi.ts` content with:

```typescript
import OpenAI from 'openai';
import type { LLMRequest, LLMStream } from '../types';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.KIMI_API_KEY;
    if (!apiKey) throw new Error('KIMI_API_KEY not set');
    client = new OpenAI({
      apiKey,
      baseURL: 'https://api.moonshot.cn/v1',
    });
  }
  return client;
}

export async function kimiChat(req: LLMRequest): Promise<LLMStream> {
  const stream = await getClient().chat.completions.create({
    model: 'kimi-k2.6',
    messages: [
      { role: 'system', content: req.system },
      ...req.messages.map(m => ({ role: m.role, content: m.content })),
    ],
    max_tokens: req.maxTokens ?? 1024,
    stream: true,
  });

  async function* textStream(): AsyncIterable<string> {
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) yield delta;
    }
  }

  return { textStream: textStream() };
}
```

**Note on thinking mode:** OpenAI SDK may not natively support Kimi's `thinking` parameter. For MVP v1 we omit it; if Socratic reasoning quality is insufficient (per Task 20 self-test), revisit by switching to `fetch`-based raw call.

- [ ] **Step 2: Smoke test with real API**

Create `tests/providers-smoke.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { kimiChat } from '@/lib/providers/kimi';

const SKIP = !process.env.RUN_SMOKE_TESTS;

describe.skipIf(SKIP)('kimi smoke', () => {
  it('returns a non-empty stream for a trivial prompt', async () => {
    const stream = await kimiChat({
      system: 'You are a calculator. Respond with only digits.',
      messages: [{ role: 'user', content: 'What is 2+2?' }],
      maxTokens: 16,
    });
    let text = '';
    for await (const chunk of stream.textStream) text += chunk;
    expect(text.length).toBeGreaterThan(0);
    expect(text).toMatch(/4/);
  }, 15000);
});
```

Run smoke test (with secrets loaded):

```bash
RUN_SMOKE_TESTS=1 ./scripts/load-env-from-keychain.sh npx vitest run tests/providers-smoke.test.ts
```

Expected: 1 test passes (response contains "4").

- [ ] **Step 3: Commit**

```bash
git add lib/providers/kimi.ts tests/providers-smoke.test.ts
git commit -m "feat(llm): Kimi K2.6 provider via OpenAI-compatible API"
```

---

## Task 10: MiniMax Provider Implementation

**Files:**
- Modify: `lib/providers/minimax.ts`
- Modify: `tests/providers-smoke.test.ts`

- [ ] **Step 1: Implement MiniMax via Anthropic SDK**

Replace `lib/providers/minimax.ts` content:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { LLMRequest, LLMStream } from '../types';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) throw new Error('MINIMAX_API_KEY not set');
    client = new Anthropic({
      apiKey,
      baseURL: 'https://api.minimax.io/anthropic',
    });
  }
  return client;
}

export async function minimaxChat(req: LLMRequest): Promise<LLMStream> {
  const stream = getClient().messages.stream({
    model: 'MiniMax-M2.7-highspeed',
    max_tokens: req.maxTokens ?? 1024,
    system: req.system,
    messages: req.messages.map(m => ({ role: m.role, content: m.content })),
  });

  async function* textStream(): AsyncIterable<string> {
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }
  }

  return { textStream: textStream() };
}
```

- [ ] **Step 2: Add MiniMax smoke test**

Append to `tests/providers-smoke.test.ts`:

```typescript
import { minimaxChat } from '@/lib/providers/minimax';

describe.skipIf(SKIP)('minimax smoke', () => {
  it('returns a non-empty stream', async () => {
    const stream = await minimaxChat({
      system: 'You are a calculator. Respond with only digits.',
      messages: [{ role: 'user', content: 'What is 2+2?' }],
      maxTokens: 16,
    });
    let text = '';
    for await (const chunk of stream.textStream) text += chunk;
    expect(text).toMatch(/4/);
  }, 15000);
});
```

- [ ] **Step 3: Run smoke test**

```bash
RUN_SMOKE_TESTS=1 ./scripts/load-env-from-keychain.sh npx vitest run tests/providers-smoke.test.ts
```

Expected: both kimi + minimax tests pass.

- [ ] **Step 4: Commit**

```bash
git add lib/providers/minimax.ts tests/providers-smoke.test.ts
git commit -m "feat(llm): MiniMax M2.7-highspeed provider via Anthropic-compat API"
```

---

## Task 11: Chat API Route

**Files:**
- Create: `app/api/chat/route.ts`

- [ ] **Step 1: Write the SSE chat route**

Create `app/api/chat/route.ts`:

```typescript
import { NextRequest } from 'next/server';
import { loadQuestion } from '@/lib/questions';
import { buildSystemPrompt } from '@/lib/prompts';
import { chat } from '@/lib/llm';
import type { ChatMessage } from '@/lib/types';

export const runtime = 'edge';

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
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: chunk })}\n\n`));
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
      } catch (e) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: (e as Error).message })}\n\n`),
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
```

**Note:** edge runtime doesn't allow `fs.readFileSync`, but `loadQuestion` uses it. We have two options:
1. Switch route to `runtime = 'nodejs'`
2. Inline the question JSONs as static imports

Take option (1) for simplicity. Change `export const runtime = 'edge';` to `export const runtime = 'nodejs';`. Update the snippet accordingly.

- [ ] **Step 2: Quick manual test via curl**

Start dev server in one terminal:

```bash
npm run dev
```

In another terminal:

```bash
curl -N -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"questionId":"Q05","messages":[]}'
```

Expected: SSE stream with `data: {"delta":"..."}` chunks ending with `data: {"done":true}`.

If you see a stream of Chinese text from the agent's opening message → ✅.

- [ ] **Step 3: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "feat(api): /api/chat SSE route with LLM dispatch"
```

---

## Task 12: Password Auth (Middleware + Page)

**Files:**
- Create: `middleware.ts`, `app/auth/page.tsx`, `app/api/auth/route.ts`

- [ ] **Step 1: Write the middleware**

Create `middleware.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'mm_auth';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/auth') || pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }
  const cookie = req.cookies.get(COOKIE_NAME);
  if (cookie?.value === process.env.SITE_PASSWORD) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL('/auth', req.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|images|avatar).*)'],
};
```

**Note:** The cookie value here is the password itself. This is acceptable MVP-level protection (the cookie is HttpOnly + Secure in production). For higher security, hash it; not needed for MVP per design §7.

- [ ] **Step 2: Write the auth API route**

Create `app/api/auth/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { password } = (await req.json()) as { password?: string };
  if (!password || password !== process.env.SITE_PASSWORD) {
    return new NextResponse('Wrong password', { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set('mm_auth', password, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,  // 1 week
    path: '/',
  });
  return res;
}
```

- [ ] **Step 3: Write the auth page**

Create `app/auth/page.tsx`:

```tsx
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
```

- [ ] **Step 4: Manual test**

```bash
npm run dev
```

Visit `http://localhost:3000/` → should redirect to `/auth`.
Enter the password set via Keychain (the value of `mathmagics-site-password`).
After submit → should land on `/` (home page from Task 14, currently still default Next.js page).

- [ ] **Step 5: Commit**

```bash
git add middleware.ts app/auth/ app/api/auth/
git commit -m "feat(auth): cookie-based password gate"
```

---

## Task 13: Home Page (Question Selection)

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Replace the default Next.js home page**

Replace `app/page.tsx` content with:

```tsx
import Link from 'next/link';

const QUESTIONS = [
  { id: 'Q05', emoji: '🎲', name: '骰子之谜', topic: '逻辑推理', difficulty: 3 },
  { id: 'Q18', emoji: '❄️', name: '折纸雪花', topic: '对称几何', difficulty: 5 },
];

export default function HomePage() {
  return (
    <main className="min-h-screen p-8 flex flex-col items-center bg-amber-50">
      <h1 className="text-4xl font-semibold mt-12 mb-2">MathMagics</h1>
      <p className="text-stone-600 mb-12">和你一起琢磨数学</p>
      <p className="text-lg mb-6">今天想琢磨什么？</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
        {QUESTIONS.map(q => (
          <Link
            key={q.id}
            href={`/q/${q.id}`}
            className="block p-8 rounded-3xl bg-white shadow-md hover:shadow-lg transition border-2 border-transparent hover:border-amber-300"
          >
            <div className="text-5xl mb-3">{q.emoji}</div>
            <div className="text-xl font-semibold">{q.name}</div>
            <div className="text-sm text-stone-500 mt-1">
              {q.topic} · {q.difficulty}分
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Manual test**

```bash
npm run dev
```

Visit `http://localhost:3000/` (after auth). Should see two question cards.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat(ui): home page with question selection"
```

---

## Task 14: Chat UI — Components

**Files:**
- Create: `components/QuestionCard.tsx`, `components/MessageBubble.tsx`, `components/AgentMessage.tsx`, `components/TextInput.tsx`, `components/IGotItButton.tsx`

- [ ] **Step 1: Question card**

Create `components/QuestionCard.tsx`:

```tsx
import Image from 'next/image';
import type { Question } from '@/lib/types';

export function QuestionCard({ question }: { question: Question }) {
  return (
    <div className="bg-white rounded-2xl shadow p-4 mb-4">
      <Image
        src={question.image}
        alt={question.display_name}
        width={600}
        height={400}
        className="w-full h-auto rounded-xl mb-3"
      />
      <p className="text-base leading-relaxed text-stone-700">{question.problem_zh}</p>
    </div>
  );
}
```

- [ ] **Step 2: Message bubble (user)**

Create `components/MessageBubble.tsx`:

```tsx
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
```

- [ ] **Step 3: Agent message (SVG-aware)**

Create `components/AgentMessage.tsx`:

```tsx
import Image from 'next/image';
import { MessageBubble } from './MessageBubble';

export function AgentMessage({ text }: { text: string }) {
  // Split text into [text, svg, text, svg, ...] segments
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
```

**Security note:** `dangerouslySetInnerHTML` is acceptable here because the SVG comes from the LLM (trusted source we control via system prompt). If concerned, install `isomorphic-dompurify` and sanitize before injection.

- [ ] **Step 4: Text input**

Create `components/TextInput.tsx`:

```tsx
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
```

- [ ] **Step 5: I-got-it button**

Create `components/IGotItButton.tsx`:

```tsx
'use client';
export function IGotItButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-4 py-2 bg-emerald-500 text-white rounded-full text-sm hover:bg-emerald-600 disabled:opacity-40"
    >
      我懂了 🎉
    </button>
  );
}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add components/
git commit -m "feat(ui): chat UI components (bubble, agent message with SVG, input, button)"
```

---

## Task 15: Chat UI — Orchestrator + Page

**Files:**
- Create: `components/ChatUI.tsx`, `app/q/[id]/page.tsx`

- [ ] **Step 1: Write the ChatUI orchestrator**

Create `components/ChatUI.tsx`:

```tsx
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
```

- [ ] **Step 2: Write the question page**

Create `app/q/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { loadQuestion, listQuestionIds } from '@/lib/questions';
import { ChatUI } from '@/components/ChatUI';

export function generateStaticParams() {
  return listQuestionIds().map(id => ({ id }));
}

export default function QuestionPage({ params }: { params: { id: string } }) {
  try {
    const question = loadQuestion(params.id);
    return <ChatUI question={question} />;
  } catch {
    notFound();
  }
}
```

- [ ] **Step 3: Manual test**

```bash
npm run dev
```

1. Visit `http://localhost:3000/` (login if prompted).
2. Click 🎲 骰子之谜.
3. Wait ~2s — should see agent opener stream in.
4. Type a reply, send → should see another agent message stream.

- [ ] **Step 4: Commit**

```bash
git add components/ChatUI.tsx app/q/
git commit -m "feat(ui): chat page with streaming and Socratic flow"
```

---

## Task 16: Agent Avatar Generation Script

**Files:**
- Create: `scripts/generate-avatar.ts`

- [ ] **Step 1: Write the avatar generation script**

Create `scripts/generate-avatar.ts`:

```typescript
// One-shot: generate the MathMagics agent avatar via MiniMax image-01.
// Usage:  ./scripts/load-env-from-keychain.sh npx tsx scripts/generate-avatar.ts
import fs from 'node:fs';
import path from 'node:path';

const PROMPT = `Flat minimalist Bauhaus-style mascot avatar, abstract friendly character
combining geometric shapes (circle for head, soft squares and triangles),
soft palette of pale yellow (#FFE9B0), light blue (#B3D9FF), mint green (#B8E6CB),
clean thick outlines, on a pure white background, no text, no human face,
1:1 aspect ratio, centered composition, suitable as a chat avatar for a kids' math app.`;

const ENDPOINT = 'https://api.minimax.io/v1/image_generation';

async function main() {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) throw new Error('MINIMAX_API_KEY not set');

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'image-01',
      prompt: PROMPT,
      aspect_ratio: '1:1',
      response_format: 'base64',
    }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { data?: { image_base64?: string[] } };
  const b64 = data?.data?.image_base64?.[0];
  if (!b64) {
    throw new Error(`No base64 in response: ${JSON.stringify(data).slice(0, 200)}`);
  }

  const outPath = path.join(process.cwd(), 'public/avatar/mathmagics.png');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
  console.log(`✅ Avatar written: ${outPath}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
```

**Note:** The exact MiniMax response shape (`data.image_base64[0]`) is inferred from typical patterns. If the script fails with "No base64 in response", inspect the error output and adjust the JSON path accordingly.

- [ ] **Step 2: Install tsx for running TS scripts**

```bash
npm install -D tsx
```

- [ ] **Step 3: Run the script**

```bash
./scripts/load-env-from-keychain.sh npx tsx scripts/generate-avatar.ts
```

Expected: `✅ Avatar written: .../public/avatar/mathmagics.png`.

Open the file (`open public/avatar/mathmagics.png`). If visual quality is unsatisfactory, edit the `PROMPT` and re-run. Iterate until happy.

- [ ] **Step 4: Commit the script + asset**

```bash
git add scripts/generate-avatar.ts public/avatar/mathmagics.png
git commit -m "feat: agent avatar generation script + initial asset"
```

---

## Task 17: P022 Spec — Project Metadata

**Files:**
- Create: `.agent/CURRENT.md`, `.agent/BACKLOG.md`, `.agent/sprints/sprint-001.md`, `CLAUDE.md`, `GEMINI.md` (symlink), `AGENTS.md` (symlink), `.claude/settings.json`, `docs/architecture.md`, `docs/deployment.md`, `docs/operations.md`, `README.md`

- [ ] **Step 1: Write CLAUDE.md (≤150 lines)**

Create `CLAUDE.md`:

```markdown
# MathMagics MVP — Claude Code Context

## ⭐ Session 启动（每次必执行）
\`\`\`bash
git status -sb
cat .agent/CURRENT.md
\`\`\`

## Project Overview
G3-G4 数学 AI 辅导 MVP，2 题 (Q05 骰子 + Q18 折纸雪花)，验证 Socratic + Feynman 教学体验。

**Location:** ~/AgentWorks/CodeSpace/mathmagics-mvp
**Version:**  v0.1.0
**Design:**   Obsidian Brain#2/10_Projects/Active/P012-MathMagics/MVP-Design.md (v1.1)

**Technical docs:** [Architecture](docs/architecture.md) · [Deployment](docs/deployment.md) · [Operations](docs/operations.md)

## Tech Stack
| Layer | Tech |
|-------|------|
| Frontend | Next.js 14 App Router + Tailwind |
| Backend  | Next.js API routes (nodejs runtime) + SSE streaming |
| LLM      | Kimi K2.6 (主力) / MiniMax M2.7 (可切换) |
| Image    | MiniMax image-01 (仅一次性头像生成) |
| Auth     | Cookie-based password gate (middleware.ts) |
| Deploy   | Vercel |
| Tests    | Vitest |

## Key Implementation Details
- **所有 secrets 从 macOS Keychain 加载**，禁止明文写仓库。详见 `scripts/load-env-from-keychain.sh`
- `npm run dev` / `npm run build` / 任何 npm script 都通过 keychain loader 注入 env
- **LLM 切换**：`LLM_PROVIDER=kimi|minimax`，重启 dev server 生效
- **教学逻辑全部在 system prompt** (`lib/prompts.ts`)，不在代码里做 phase 状态机
- **题目原图在 `public/images/`**，教学示意图由 LLM 内联生成 SVG（不要用 image-01 做几何图）
- **Edge runtime 不可用**：`/api/chat` 用 nodejs runtime（因 `loadQuestion` 用 fs）

## Dev Commands
\`\`\`bash
npm run dev              # 启动，自动从 keychain 加载 env
npm test                 # 运行 vitest
RUN_SMOKE_TESTS=1 ./scripts/load-env-from-keychain.sh npx vitest run tests/providers-smoke.test.ts
                         # 跑真实 API 烟雾测试
LLM_PROVIDER=minimax npm run dev  # 切换到 MiniMax 验证
./scripts/load-env-from-keychain.sh npx tsx scripts/generate-avatar.ts
                         # 重生成头像
\`\`\`

## Release 后必做
1. `.agent/CURRENT.md`：补充 Version History 描述
2. 更新 Current Sprint Summary
3. 如有架构变更：更新 `docs/architecture.md`
```

- [ ] **Step 2: Create symlinks for other agents**

```bash
ln -s CLAUDE.md GEMINI.md
ln -s CLAUDE.md AGENTS.md
```

- [ ] **Step 3: Write .agent/CURRENT.md**

Create `.agent/CURRENT.md`:

```markdown
# Current Status — MathMagics MVP

Version:        v0.1.0
Sprint:         001
Sprint Status:  🔄 In Progress
Last Updated:   2026-05-19 by claude-sonnet-4-6
Sprint File:    .agent/sprints/sprint-001.md

## Open Bugs（P0/P1 必须本 Sprint 修复）
🟢 无已知 P0/P1 bug。

## Current Sprint Summary
执行 MVP 实现计划（docs/superpowers/plans/2026-05-19-mvp-implementation.md），目标是 Vercel 上线一个能跑 Q05 + Q18 的可分享 demo。

## Next Sprint Candidates
- [ ] [EP-001] [HIGH] 真孩子测试 + 反馈收集
- [ ] [EP-002] [MED] 根据测试结果决定是否扩展到 Magic Canvas / 更多题目

## Version History（最近 5 版）
| Version | Date | Summary |
|---------|------|---------|
| v0.1.0 | 2026-05-19 | MVP 初版：Q05+Q18 文本对话 + Kimi/MiniMax 双 provider 切换 |
```

- [ ] **Step 4: Write .agent/BACKLOG.md**

Create `.agent/BACKLOG.md`:

```markdown
# Product Backlog — MathMagics MVP
> 排入 Sprint 后从此处移除。

## 🔴 HIGH
（无）

## 🟡 MED
- [ ] [EP-003] Magic Canvas 手绘输入 (待 MVP 验证通过后)
- [ ] [EP-004] 扩展到 24 道 Level B 完整题库

## 🟢 LOW
- [ ] [EP-005] 语音输入 / 输出
- [ ] [EP-006] 家长 Dashboard
- [ ] [EP-007] 移动端 PWA 优化

## 📋 研究向（未决策）
- [ ] Kimi K2.6 thinking 模式是否在 OpenAI SDK 路径下可调用
- [ ] Level C-F 题目是否值得继续扩展

## ✅ 已完成（按 Sprint 归档）
（待 Sprint 1 结束后归档）
```

- [ ] **Step 5: Write .agent/sprints/sprint-001.md**

Create `.agent/sprints/sprint-001.md`:

```markdown
# Sprint 001

Goal:      MVP 上线 — 用户能在 Vercel 部署的网站上完整体验 Q05 + Q18 的 Socratic + Feynman 教学对话
Period:    2026-05-19 ~ 2026-05-23
Version:   v0.1.0
Assignee:  claude

## Tasks

### T1: 完成 MVP 实现计划全部 20 个任务
**Status:** 🔲 Todo
**Epic:** EP-MVP
**Plan:** docs/superpowers/plans/2026-05-19-mvp-implementation.md
**Acceptance:**
- [ ] 所有 20 个任务完成且 commit
- [ ] `npm test` 通过
- [ ] Vercel 部署可访问
- [ ] 自测 Q05 + Q18 端到端可走通
- [ ] 至少 1 道题自己玩出"顿悟感"

## Superpowers Checkpoints
| Skill | 触发条件 | 本 Sprint |
|-------|---------|---------|
| brainstorming | 新设计前 | ✅ (P012 PRD review) |
| writing-plans | 实现前 | ✅ (本计划) |
| verification-before-completion | Task Done 前 | 待执行 |
| systematic-debugging | 发现 Bug 时 | N/A |

## Sprint 回顾
（Sprint 结束后填写）
```

- [ ] **Step 6: Write .claude/settings.json**

Create `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "if echo \"$CLAUDE_TOOL_INPUT\" | grep -q 'release\\.sh'; then echo 'POST-RELEASE: (1) .agent/CURRENT.md 补充 Version History 描述 (2) 更新 Sprint Summary (3) 确认 Last Updated agent-id (4) 架构变更则更新 docs/architecture.md'; fi"
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 7: Write brief docs/ stubs**

Create `docs/architecture.md`:

```markdown
# Architecture

完整设计文档在 Obsidian: `Brain#2/10_Projects/Active/P012-MathMagics/MVP-Design.md` (v1.1)。

## 一句话总结
Next.js App Router + Edge/Node runtime + SSE streaming + LLM 抽象层支持 Kimi/MiniMax/Claude 切换 + 教学逻辑全部在 system prompt。

## 关键路径
- 请求：Browser → `/api/chat` (POST) → `lib/llm.ts` dispatch → provider impl → upstream LLM
- 响应：upstream stream → SSE → ChatUI 逐 token 渲染 + SVG 解析

## 文件职责
见仓库根目录 README.md 和 docs/superpowers/plans/2026-05-19-mvp-implementation.md 的 File Structure 节。
```

Create `docs/deployment.md`:

```markdown
# Deployment

## Vercel 部署步骤

1. `vercel link` (首次)
2. Vercel Dashboard → Settings → Environment Variables，添加：
   - `KIMI_API_KEY`
   - `MINIMAX_API_KEY`
   - `ANTHROPIC_API_KEY`
   - `SITE_PASSWORD`
   - `LLM_PROVIDER` = `kimi`
3. `vercel --prod`

## 本地构建验证

\`\`\`bash
./scripts/load-env-from-keychain.sh npm run build
./scripts/load-env-from-keychain.sh npm start
\`\`\`
```

Create `docs/operations.md`:

```markdown
# Operations

## 常见问题排查

### LLM 不响应
- 检查 `LLM_PROVIDER` 值是否正确
- `RUN_SMOKE_TESTS=1 ./scripts/load-env-from-keychain.sh npx vitest run tests/providers-smoke.test.ts` 三个 provider 烟雾测试
- 查看 Vercel runtime logs

### 密码门循环重定向
- 通常是 cookie 被浏览器拦截。改用无痕模式确认；生产域名必须 HTTPS

### SVG 渲染异常
- 打开浏览器 DevTools 看 `data:` SSE 内容是否含完整 `<svg>...</svg>` 标签
- 若 LLM 输出截断的 SVG，调高 `maxTokens`

### 切换 LLM 后行为差异大
- 在 `lib/prompts.ts` 增加 provider-specific 提示词变体（不推荐 MVP 阶段）
- 或：让有问题的 provider 降级为非主力
```

Create `README.md`:

```markdown
# MathMagics MVP

G3-G4 数学 Agent 教学体验验证 MVP。

详见 [CLAUDE.md](CLAUDE.md)。

## 快速开始

\`\`\`bash
# 1. 把 4 个 API key + site password 存入 Keychain (一次性):
#    见 docs/superpowers/plans/2026-05-19-mvp-implementation.md Task 2

# 2. 启动:
npm run dev
\`\`\`
```

- [ ] **Step 8: Verify symlinks work**

```bash
cat GEMINI.md | head -3
cat AGENTS.md | head -3
```

Both should show CLAUDE.md content (first 3 lines).

- [ ] **Step 9: Commit**

```bash
git add .agent/ CLAUDE.md GEMINI.md AGENTS.md .claude/ docs/ README.md
git commit -m "chore: P022 spec compliance (.agent/, CLAUDE.md, docs/, .claude/settings.json)"
```

---

## Task 18: Prompt Iteration — Q05 (Kimi)

**Goal:** Hand-test the Q05 dialogue end-to-end with Kimi until it feels natural and produces an aha-moment.

- [ ] **Step 1: Self-test scenario A (cooperative kid)**

Run dev server, log in, open Q05. Type as a cooperative G3-G4 kid:

```
你: 嗯…标准骰子是不是相对面加起来是 7？
```

Confirm agent:
- Acknowledges and doesn't restate verbatim
- Moves to step 2 ("看看图")
- Asks a single question

- [ ] **Step 2: Self-test scenario B (wrong guess)**

Reload, start again. Type:

```
你: 答案是 5！
```

Confirm agent:
- Does NOT confirm/deny
- Asks "你是怎么想到这个数的？" or similar
- Stays in Socratic mode

- [ ] **Step 3: Self-test Feynman trigger**

Continue scenario A through step 2. After answering correctly which face is opposite which, the agent should trigger Feynman Mode and say (or paraphrase):

> "我刚刚算的时候有点糊涂——我看到旁边那个面是 4，就以为问号也是 4..."

If Feynman doesn't trigger after a clearly correct step-2 answer:
- Edit `lib/prompts.ts` → tighten `trigger_condition` wording
- Restart dev server, retest

- [ ] **Step 4: Self-test the end signal**

Click "我懂了 🎉" button. Confirm agent:
- Asks "你能用自己的话讲一遍吗？"
- Replies appreciatively after self-explanation
- Asks if want to try another question

- [ ] **Step 5: Document any prompt edits**

If you modified `lib/prompts.ts`:

```bash
git add lib/prompts.ts
git commit -m "tune(prompts): Q05 Socratic flow + Feynman trigger refinements after self-test"
```

If no edits, just note "Q05 passed self-test" in your sprint notes.

---

## Task 19: Prompt Iteration — Q18 (Kimi) + A/B Compare (Kimi vs MiniMax)

- [ ] **Step 1: Self-test Q18 cooperative path**

Open Q18. Run through the Socratic path:

```
你: 我试过对折纸，剪一个口能展开成两个口
```

Confirm agent moves through symmetry → fold direction → mental unfolding.

- [ ] **Step 2: Verify SVG generation happens at least once**

During Q18 dialogue, the model should at some point produce an inline `<svg>...</svg>` to illustrate symmetry/fold. Check the response payload in browser DevTools Network tab.

If no SVG ever appears after 5+ turns:
- Edit prompt rule 3 to be more directive ("explaining symmetry → MUST embed SVG")
- Retest

- [ ] **Step 3: A/B compare with MiniMax**

Stop dev server. Restart with:

```bash
LLM_PROVIDER=minimax npm run dev
```

Repeat Q18 path. Note differences:
- Does Socratic stay on track?
- Is language age-appropriate?
- Does Feynman feel natural?

- [ ] **Step 4: Decide default provider**

Pick the provider where the Q05+Q18 experience feels best. Update `.env.example` and Vercel env vars accordingly (`LLM_PROVIDER=<choice>`).

- [ ] **Step 5: Document comparison**

Append to `.agent/sprints/sprint-001.md` Sprint 回顾 section:

```markdown
## LLM Provider 对比（自测）
| Provider | Socratic 流畅度 | Feynman 自然度 | 语言适龄 | 速度 | 总评 |
|----------|----------------|---------------|---------|------|------|
| Kimi K2.6 | | | | | |
| MiniMax M2.7-highspeed | | | | | |

**MVP 默认 provider：** <Kimi / MiniMax>
**理由：** ...
```

Fill in the table, then:

```bash
git add .agent/sprints/sprint-001.md
git commit -m "docs: LLM provider self-test comparison and default selection"
```

---

## Task 20: Vercel Deploy + Smoke

- [ ] **Step 1: Vercel link**

```bash
npx vercel link
```

Follow prompts to link to a Vercel project (create new if needed).

- [ ] **Step 2: Add env vars to Vercel**

In Vercel dashboard → Project → Settings → Environment Variables, add:
- `KIMI_API_KEY` (value from `security find-generic-password -s kimi-api-key -a $USER -w`)
- `MINIMAX_API_KEY` (similar)
- `SITE_PASSWORD` (similar)
- `LLM_PROVIDER` = the value chosen in Task 19

Scope: Production + Preview + Development.

- [ ] **Step 3: Deploy**

```bash
npx vercel --prod
```

Note the production URL printed (e.g. `https://mathmagics-mvp-xxx.vercel.app`).

- [ ] **Step 4: Production smoke test**

1. Open the URL in a fresh browser session.
2. Confirm redirect to `/auth`.
3. Enter the site password (from Keychain).
4. Confirm redirect to `/` with two question cards.
5. Click 🎲 骰子之谜 → confirm agent opener streams.
6. Walk through Q05 → confirm completion.
7. Back, click ❄️ 折纸雪花 → confirm Q18 works.

- [ ] **Step 5: Update CURRENT.md with deploy URL**

Edit `.agent/CURRENT.md`, in "Current Sprint Summary":

```markdown
## Current Sprint Summary
✅ MVP 已部署: <production URL>
密码已通过私下渠道告知测试者。
```

Commit:

```bash
git add .agent/CURRENT.md
git commit -m "chore: production deploy URL recorded"
```

- [ ] **Step 6: Tag v0.1.0**

```bash
git tag -a v0.1.0 -m "MVP v0.1.0 — Q05 + Q18 deployed"
```

(Don't push yet; the repo has no remote per design.)

---

## Self-Review

After all 20 tasks complete, verify against MVP-Design.md v1.1:

- §0 Goal — covered (Tasks 18, 19, 20)
- §1 Architecture — covered (Tasks 1, 8-11)
- §2 File Structure — covered (all tasks combined match the locked tree)
- §3 Data Flow — covered (Tasks 11, 12, 15)
- §4 Question Schema — covered (Tasks 3, 4, 5)
- §5 System Prompt — covered (Task 7) and tuned (Tasks 18, 19)
- §5.4 LLM Abstraction — covered (Tasks 8-10). Claude provider deferred per user decision (2026-05-19); spec §1 still lists Claude as future option.
- §6 UI — covered (Tasks 13, 14, 15)
- §6.2.1 Avatar — covered (Task 16)
- §7 Auth — covered (Task 12)
- §8 Error Handling — partial (basic 400/404/502 in route, 401 in auth); deeper UX retries deferred to post-MVP iteration based on real failures
- §9 Validation — covered (Tasks 18, 19, 20 Step 4)
- §10 YAGNI — respected (no Canvas, voice, persistence, dashboard, etc. in plan)
- §11 Risks — Kimi thinking SDK gap acknowledged (Task 9 note); Kimi vs MiniMax differences will surface in Task 19
- §12 Decisions — all 4 honored (no progress bar, has avatar, no persistence, user picks order)
- §13 Time — plan reflects ~3.5 days (down from 4 after Claude provider removal)
- §14 Project init — covered (Tasks 1, 2, 17)

**No placeholders.** Q18.json has one `<TODO: confirm from spec>` which is intentionally flagged for the engineer to verify against the authoritative interaction spec; this is a content data validation step, not a plan failure.

**Type consistency.** `Question`, `LLMRequest`, `LLMStream`, `ChatMessage`, `LLMProvider` are defined once in `lib/types.ts` (Task 3) and reused everywhere. Provider function signatures (`kimiChat`, `minimaxChat`, `claudeChat`) all match `(req: LLMRequest) => Promise<LLMStream>`.

---

**Plan complete and saved to** `docs/superpowers/plans/2026-05-19-mvp-implementation.md`.
