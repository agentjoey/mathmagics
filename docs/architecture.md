# Architecture

完整设计文档在 Obsidian: `Brain#2/10_Projects/Active/P012-MathMagics/MVP-Design.md` (v1.1)。

## 一句话总结
Next.js App Router + Edge/Node runtime + SSE streaming + MiniMax M2.7-highspeed + 教学逻辑全部在 system prompt。

## 关键路径
- 请求：Browser → `/api/chat` (POST) → `lib/llm.ts` dispatch → provider impl → upstream LLM
- 响应：upstream stream → SSE → ChatUI 逐 token 渲染 + SVG 解析

## 文件职责
见仓库根目录 README.md 和 docs/superpowers/plans/2026-05-19-mvp-implementation.md 的 File Structure 节。
