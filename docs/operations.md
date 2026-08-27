# Operations

## Phase 8 Family Pilot

### Non-production Neon activation gate

Before any production migration or deployment:

1. Provision an isolated non-production Neon database in Singapore.
2. Set `TEST_DATABASE_URL` explicitly for that database. Never reuse Production `DATABASE_URL`.
3. Prove the full-loop contract fails on a fresh unmigrated database because required tables are absent.
4. Run `npm run db:migrate:test` to apply only committed migrations `0000` through `0004`.
5. Run `npm run verify:pilot-neon` and require every listed Neon suite to execute with zero integration skips.
6. Run the complete candidate gate: `npm test`, exact typecheck/curriculum release checks, `npm run lint`, and `npm run build`.
7. Record only the environment name/region, reviewed candidate SHA, migration result and contract result. Never commit credentials.
8. Stop at the explicit Production Human Gate. Non-production approval is not production authorization.

The pilot full-loop contract uses a unique random student id and deletes only facts owned by that student in foreign-key-safe order. Shared Neon tables must never be truncated by verification.

### Task 7 pre-production evidence — 2026-08-28

Environment: isolated Neon testing branch in `ap-southeast-1` (Singapore). Credentials are intentionally not recorded.

Observed sequence:

- Fresh pre-migration RED reached the real database and failed with PostgreSQL `42P01`, `relation "students" does not exist`.
- `npm run db:migrate:test` applied committed migrations `0000` through `0004` only to the explicit testing branch with Production `DATABASE_URL` unset.
- Final `npm run verify:pilot-neon`: **6/6 files passed, 13/13 tests passed, zero integration skips and zero failures**.
- The live full-loop contract covers current position → plan/execution → Practice Attempt + Evidence → Mistake → correction/transfer resolution → recurrence → StrategyEvidence → adaptive SUPERSEDE → historical ParentProgress/PilotReview → recurrence correction → forward KEEP.
- Final live full-loop stages all passed and student-scoped cleanup completed. Cleanup never truncates or resets shared tables.
- Production migration/deployment was not executed during this evidence run.

The live gate exposed pilot blockers that were fixed before the final GREEN:

- Neon/PostgreSQL timestamp text is canonicalized at the persistence read boundary so durable repositories return the same ISO-instant domain shape as memory repositories. This also restores replay/idempotency comparisons that previously treated equivalent timestamp strings as different facts.
- ParentProgress/PilotReview had N+1 remote reads across objectives, mistakes and lessons. The read path now uses request-scoped shared progress/risk snapshots and concurrent independent reads without changing progress or replay semantics.
- Forward adaptive KEEP evaluation recomputed objective progress repeatedly across the level. Query-budget regression tests now require one batched progress projection and one cutoff-scoped risk snapshot while still including cross-level prerequisites.

These fixes change persistence representation and read/query orchestration only. They do not change `adaptive-policy-v1`, Mastery, correction rules, curriculum, grading authority, or canonical learning facts.

### Pilot health checks

Before each pilot session:

- confirm the deployed SHA and `adaptive-policy-v1` policy version;
- confirm auth succeeds and `/api/pilot/review` can read the known pilot student;
- confirm `/api/learning/next` returns either a bounded next lesson or an intentional empty result;
- confirm Production and non-production database credentials remain separated;
- do not run migration commands from application startup.

After each pilot session:

- read the parent PilotReview and confirm lesson execution, mistakes, adaptation and rationale are reconstructable from canonical facts;
- verify no client-supplied Mastery, Evidence, grading outcome, adaptive ranking or answer-key field became authoritative;
- classify any incident using the severity levels below.

### Phase 8 incident response

**P0 — stop the pilot immediately**

Examples: canonical fact corruption, destructive/wrong-environment migration, credential exposure, auth bypass, wrong-student data, answer-key/private reasoning exposure, or unsafe adaptation that violates authority rules.

Response: stop new learning writes, preserve evidence/logs, do not manually edit canonical learning facts to make the state look correct, diagnose and fix through a reviewed code/data repair path.

**P1 — session blocker**

Examples: student cannot complete the normal lesson/practice/homework/correction loop, parent review cannot be reconstructed, or a required API consistently fails.

Response: stop the affected session, preserve the failing facts/request context, fix before the next real session. No policy tuning from the incident unless root cause is actually policy.

**P2 — significant friction**

Examples: confusing copy, recoverable upload/retry friction, rationale that is technically correct but hard for the family to understand.

Response: record the friction privately for weekly review; fix only if it is a repeated pilot blocker or clear product defect.

**P3 — cosmetic/minor**

Examples: spacing, non-blocking wording polish, minor visual inconsistencies.

Response: log for later. Do not interrupt the pilot or expand Phase 8 scope for cosmetic work.

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
