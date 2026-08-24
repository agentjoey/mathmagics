# MathMagics — Claude Code Context

## ⭐ Session 启动（每次必执行）
```bash
git status -sb
cat .agent/CURRENT.md
```

## Project Overview
G3-G4 数学 AI 辅导 MVP，2 题 (Q05 骰子 + Q18 折纸雪花)，验证 Socratic + Feynman 教学体验。

**Location:** ~/AgentWorks/GPT_Workspace/mathmagics
**Version:**  v0.1.0
**Design:**   Obsidian Brain#2/10_Projects/Active/P012-MathMagics/MVP-Design.md (v1.1)

**Technical docs:** [Architecture](docs/architecture.md) · [Deployment](docs/deployment.md) · [Operations](docs/operations.md)

## Tech Stack
| Layer | Tech |
|-------|------|
| Frontend | Next.js 14 App Router + Tailwind |
| Backend  | Next.js API routes (nodejs runtime) + SSE streaming |
| LLM      | MiniMax M2.7-highspeed |
| Image    | MiniMax image-01 (仅一次性头像生成) |
| Auth     | Cookie-based password gate (middleware.ts) |
| Deploy   | Vercel |
| Tests    | Vitest |

## Key Implementation Details
- **所有 secrets 从 macOS Keychain 加载**，禁止明文写仓库。详见 `scripts/load-env-from-keychain.sh`
- `npm run dev` / `npm run build` / 任何 npm script 都通过 keychain loader 注入 env
- **LLM provider**：MiniMax M2.7-highspeed via `@anthropic-ai/sdk`（Anthropic-compat endpoint）
- **教学逻辑全部在 system prompt** (`lib/prompts.ts`)，不在代码里做 phase 状态机
- **题目原图在 `public/images/`**，教学示意图由 LLM 内联生成 SVG（不要用 image-01 做几何图）
- **Edge runtime 不可用**：`/api/chat` 用 nodejs runtime（因 `loadQuestion` 用 fs）

## Dev Commands
```bash
npm run dev              # 启动，自动从 keychain 加载 env
npm test                 # 运行 vitest
RUN_SMOKE_TESTS=1 ./scripts/load-env-from-keychain.sh npx vitest run tests/providers-smoke.test.ts
                         # 跑真实 API 烟雾测试
LLM_PROVIDER=minimax npm run dev  # 切换到 MiniMax 验证
./scripts/load-env-from-keychain.sh npx tsx scripts/generate-avatar.ts
                         # 重生成头像
```

## Release 后必做
1. `.agent/CURRENT.md`：补充 Version History 描述
2. 更新 Current Sprint Summary
3. 如有架构变更：更新 `docs/architecture.md`
