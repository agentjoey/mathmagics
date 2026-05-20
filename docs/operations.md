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
