# MathMagics — Claude Code Context

## Session startup

```bash
git status -sb
cat .agent/CURRENT.md
```

## Product

MathMagics is a Singapore Math home-education AI learning system / teaching copilot for families.

V1 curriculum scope: Singapore Primary Mathematics P2/P3.

Core loop: `Plan → Learn → Practice → Correct → Track → Adapt`.

Legacy Q05/Q18 remain only as teaching-engine fixtures.

## Architecture authority

- Curriculum truth lives in version-controlled Phase 1 curriculum data.
- Learning history is append-only `EvidenceRecord` data.
- Mastery and readiness are deterministic derived state, never mutable database facts.
- Phase 3 planning is deterministic: `LearningPosition → LearningCandidate → WeeklyPlan → DailyLesson`.
- Phase 4 practice is deterministic: `DailyLesson → PracticePreparationContext → PracticeItem → Attempt → EvidenceRecord`.
- Practice mathematical truth lives in typed code-owned `problemSpec` / `AnswerSpec`; AI does not own answer keys or grades.
- Hint use comes from append-only server-observed `PracticeHintReveal`, never client input.
- Attempts are immutable and retries preserve linear provenance; wrong Attempts are never overwritten.
- AI may prepare teaching/rendering prose inside narrow trusted boundaries but cannot change curriculum, objective IDs, mathematical structure, grades, Evidence, Mastery or Readiness.
- Homework Vision is Phase 5; persistent `Mistake` remains Phase 6.

## Tech stack

| Layer | Tech |
|---|---|
| App | Next.js 16 App Router + React 19 + TypeScript |
| Runtime | Node.js Functions |
| Curriculum | Version-controlled JSON + deterministic loaders/queries |
| Learning core | `lib/learning` derived-state domain |
| Planner | deterministic `lib/planning` domain |
| Practice | deterministic `lib/practice` domain + repository boundary |
| Persistence | Neon PostgreSQL + Drizzle ORM / Drizzle Kit |
| AI | MiniMax M2.7-highspeed through existing Anthropic-compatible adapter |
| Auth | signed stateless `mm_session` via `proxy.ts` |
| Deploy | Vercel `sin1` + Neon Singapore |
| Tests | Vitest |

## Hard boundaries

- Do not add mutable `setMastery`, Evidence update/delete, or persisted mastery/readiness state.
- Do not let `lib/planning` or `lib/practice` import Drizzle, Neon, Next.js request objects, or LLM SDKs.
- Do not copy curriculum truth into Postgres.
- Do not let AI select/reorder curriculum objectives, create answer keys, grade Attempts, or choose Evidence types.
- Do not expose server `problemSpec`, `answerSpec`, solution outline or unrevealed hint in the pre-answer student projection.
- Do not accept client-supplied Attempt outcome, hintUsed, objectiveId, timestamps or Evidence type.
- Unsupported practice objectives fail closed; never fall back to unrestricted AI question generation.
- Do not use production `DATABASE_URL` for tests. Live repository tests require explicit `TEST_DATABASE_URL`.
- Do not auto-migrate production during app startup or Vercel Preview builds.
- Do not introduce Redis, queues, workers, object storage, microservices or vector search without a newly approved need.

## Persistence facts

Phase 3 tables:
`students`, `current_positions`, `evidence_records`, `weekly_plans`, `daily_lessons`, `lesson_execution_events`, `lesson_briefs`.

Phase 4 adds only:
`practice_sessions`, `practice_items`, `practice_hint_reveals`, `attempts`.

Generated migrations are committed. Running them against any real database is a separate explicit activation step.

## Secrets

Production/Preview secrets are configured with environment separation:

```text
MINIMAX_API_KEY
SITE_PASSWORD
SESSION_SECRET
DATABASE_URL
```

Integration-test-only:

```text
TEST_DATABASE_URL
```

## Commands

```bash
npm run dev
npm test
npm run typecheck
npm run validate:curriculum
npm run lint
npm run build
npm run db:generate
```

Never run `db:migrate` as an incidental implementation step.

## Source docs

- Current status: `.agent/CURRENT.md`
- Product backlog: `.agent/BACKLOG.md`
- Architecture: `docs/architecture.md`
- Deployment: `docs/deployment.md`
- Phase 4 design: `docs/superpowers/specs/2026-08-25-mathmagics-phase4-practice-attempt-design.md`
- Phase 4 implementation plan: `docs/superpowers/plans/2026-08-25-mathmagics-phase4-practice-attempt.md`
