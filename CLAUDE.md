# MathMagics — Claude Code Context

## Session startup

```bash
git status -sb
cat .agent/CURRENT.md
```

## Product

MathMagics is a Singapore Math home-education AI learning system / teaching copilot for families.

Primary users:
- Parent / Tutor
- Student

V1 curriculum scope:
- Singapore Primary Mathematics
- Primary 2 and Primary 3

Core loop:

`Plan → Learn → Practice → Correct → Track → Adapt`

Legacy Q05/Q18 remain only as teaching-engine fixtures. They are not the current product scope.

## Architecture authority

- Curriculum truth lives in version-controlled Phase 1 curriculum data.
- Learning history is append-only `EvidenceRecord` data.
- Mastery and prerequisite readiness are deterministic derived state, never mutable database facts.
- Phase 3 planning is deterministic and explainable: `LearningPosition → LearningCandidate → WeeklyPlan → DailyLesson`.
- Lesson execution is append-only `LessonExecutionEvent` history projected into state.
- AI receives trusted `LessonPreparationContext`; it may write teaching prose/examples but cannot change curriculum, objective IDs, mastery, readiness, or evidence.
- `PracticeSession` / `Attempt` remain Phase 4; `Mistake` remains Phase 6.

## Tech stack

| Layer | Tech |
|---|---|
| App | Next.js 16 App Router + React 19 + TypeScript |
| Runtime | Node.js Functions |
| Curriculum | Version-controlled JSON + deterministic loaders/queries |
| Learning core | TypeScript domain modules + repository boundary |
| Planner | Deterministic `lib/planning` domain core |
| Persistence | Neon PostgreSQL + Drizzle ORM / Drizzle Kit |
| AI | MiniMax M2.7-highspeed through existing Anthropic-compatible adapter |
| Auth | Signed stateless `mm_session` via `proxy.ts`; cookie never contains `SITE_PASSWORD` |
| Deploy | Vercel `sin1` + Neon Singapore |
| Tests | Vitest |

## Hard boundaries

- Do not add mutable `setMastery` or persisted mastery/readiness state.
- Do not let `lib/planning` import Drizzle, Neon, Next.js request objects, or LLM SDKs.
- Do not copy curriculum truth into Postgres.
- Do not make AI select/reorder curriculum objectives autonomously.
- Do not use production `DATABASE_URL` for tests. Neon integration tests require `TEST_DATABASE_URL` explicitly.
- Do not auto-migrate the production database during app startup or Vercel Preview builds.
- Do not introduce Redis, queues, workers, object storage, microservices, or vector search without a new approved need.

## Secrets

Local secrets remain in macOS Keychain and must never be committed. Production/Preview secrets are configured in Vercel with environment separation.

Phase 3 environment names:

```text
MINIMAX_API_KEY
SITE_PASSWORD
SESSION_SECRET
DATABASE_URL
```

Optional integration-test-only variable:

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

Real provider smoke tests require credentials/network and are not part of the default unit suite.

## Source docs

- Current status: `.agent/CURRENT.md`
- Product backlog: `.agent/BACKLOG.md`
- Architecture summary: `docs/architecture.md`
- Deployment/runbook: `docs/deployment.md`
- Phase 3 approved design: `docs/superpowers/specs/2026-08-24-mathmagics-phase3-teaching-planner-and-persistence-design.md`
- Phase 3 implementation plan: `docs/superpowers/plans/2026-08-24-mathmagics-phase3-teaching-planner.md`
