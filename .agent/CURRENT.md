# Current Status — MathMagics

Version:        v0.5.0-dev
Phase:          Phase 4 — Practice / Attempt Core
Phase Status:   🟡 In Progress
Last Updated:   2026-08-25 by agent

## Product Positioning

MathMagics is a Singapore Math home-education AI learning system / teaching copilot for families.

Primary users:
- Parent / Tutor
- Student

Initial curriculum scope:
- Singapore Primary Mathematics
- Primary 2 and Primary 3

Core learning loop:

`Plan → Learn → Practice → Correct → Track → Adapt`

Curriculum truth and learning history remain application-owned. AI explains, generates and recommends within trusted context; AI does not own curriculum truth, evidence, mastery, readiness or planner objective selection.

## Phase 1 — Curriculum Foundation

Completed foundation retained as curriculum authority:
- ✅ MOE-backed P2/P3 curriculum graph with 25 nodes and 68 LearningObjectives (P2=32, P3=36).
- ✅ Three teaching-knowledge deep slices: P2 Multiplication & Division, P3 Fractions, P2/P3 Word Problems + Bar Model.
- ✅ Prerequisite edges, CPA representations, strategies, misconceptions, readiness evidence and mastery evidence.
- ✅ 18 Primary Mathematics 2022 textbook mappings using `DIRECT`, `SUPPORTING` and `EXTENSION` relationships.
- ✅ Deterministic curriculum loader, validator and query API.
- ✅ Curriculum provenance rejects direct textbook sources as LearningObjective truth.
- ✅ Legacy Q05/Q18 retained only as teaching-engine fixtures.

## Phase 2 — Student & Mastery Core

Completed learning-state authority boundary:
- ✅ `StudentProfile` and manual `CurrentPositionAssumption` contracts and validation.
- ✅ Append-only `EvidenceRecord` ledger with stable student/objective IDs.
- ✅ P2/P3 level enforcement, including P3 remediation against P2 objectives.
- ✅ Deterministic evidence ordering and mastery projection: `NOT_STARTED`, `INTRODUCED`, `DEVELOPING`, `MASTERED`.
- ✅ Sticky mastery with post-mastery `reviewDue`; no mutable `setMastery` path.
- ✅ Deterministic `READY`, `NEEDS_SUPPORT`, `BLOCKED` prerequisite readiness.
- ✅ Storage-agnostic asynchronous `LearningStateRepository` contract and memory adapter.
- ✅ `Attempt` is owned by Phase 4; `Mistake` remains deferred to Phase 6.

## Phase 3 — Teaching Planner / Lesson Prep

**✅ Completed / Merged — PR #3, merge `9660870a996b07b165353eaf53a8fd41a971b0b5`.**

Completed implementation:
- ✅ Household auth hardened from password-in-cookie to stateless HMAC-signed `mm_session`; `SITE_PASSWORD` remains server-only.
- ✅ Next.js 16 access guard migrated from deprecated `middleware.ts` to `proxy.ts`.
- ✅ Deterministic `LearningPosition` derived from Student Profile, manual current position, curriculum order and Evidence-derived state.
- ✅ Deterministic candidate precedence: `REVIEW_DUE → PREREQUISITE_SUPPORT → CURRENT_POSITION → NEXT_IN_SEQUENCE`.
- ✅ Pre-anchor `NOT_STARTED` objectives are not blanket-classified as gaps.
- ✅ `BLOCKED` targets are never emitted as `LEARN`; prerequisite remediation remains explicit and explainable.
- ✅ `reviewDue` schedules review without freezing valid forward learning.
- ✅ Immutable `WeeklyPlan` and `DailyLesson` creation snapshots using StudentProfile schedule values.
- ✅ Append-only `LessonExecutionEvent`; execution status is projected rather than stored as a second mutable truth.
- ✅ `PlanningRepository` plus memory adapter; plan + lessons are created atomically at repository boundary.
- ✅ Trusted `LessonPreparationContext` assembled only from immutable planned objective IDs plus curriculum/mastery/readiness facts.
- ✅ `MiniMaxLessonBriefGenerator` implements a narrow provider-agnostic `LessonBriefGenerator` boundary; AI cannot choose objectives or write Evidence/Mastery.
- ✅ AI failure leaves deterministic plans untouched; generated lesson briefs are append-only versioned records.
- ✅ Real P3 fraction E2E scenarios cover normal forward learning, prerequisite remediation, review + forward learning, and execution/Evidence separation.

## Persistence & Deployment Foundation

Approved deployment architecture:

```text
Browser
→ Vercel CDN
→ Next.js 16 Node Functions @ sin1
   ├→ deterministic curriculum / learning / planning core
   ├→ MiniMax provider adapter
   └→ repository adapters
        ↓
   Neon PostgreSQL @ Singapore
```

Implemented:
- ✅ `drizzle-orm`, `drizzle-kit`, `@neondatabase/serverless`.
- ✅ Drizzle schema for `students`, `current_positions`, `evidence_records`, `weekly_plans`, `daily_lessons`, `lesson_execution_events`, `lesson_briefs`.
- ✅ Drizzle Kit generated migration: `migrations/0000_old_bushwacker.sql` plus metadata.
- ✅ `NeonLearningStateRepository` and `NeonPlanningRepository` implement existing domain repository contracts.
- ✅ Durable schema contains facts, immutable plan snapshots and events only; no mutable mastery/readiness/LearningPosition tables.
- ✅ Vercel region fixed to `sin1`; deployment runbook documents Preview/Production DB separation and explicit migrations.
- ✅ No startup or Preview auto-migration.

**Activation gate before first real durable-data deployment:**
- provision separated Neon development/Preview and production databases in Singapore;
- run committed migration explicitly against non-production first;
- run `tests/persistence-neon-contract.test.ts` with an explicit `TEST_DATABASE_URL`;
- only after that promote the same reviewed migration to production;
- never point tests or Vercel Preview at production `DATABASE_URL`.

No Neon migration was applied to any real database during Phase 3 implementation.

## Verification — Phase 3

Controlled local/sandbox evidence:
- ✅ `npm test`: 113 passed, 2 intentionally skipped (provider smoke and Neon live contract without explicit credentials).
- ✅ `npm run lint`.
- ✅ generated migration schema test verifies approved 7 tables and absence of persisted mastery/readiness/LearningPosition.
- ⚠ GrandeGPT sandbox `next build` remains blocked only by outbound Google Fonts fetch for Geist/Geist Mono, the existing environment limitation.

Host exact-code verification at commit `3f5968fb1b050177dcaad4b83b59841bba62d23f`:
- ✅ `npm run typecheck`.
- ✅ `npm run validate:curriculum`: 25 nodes, 68 objectives (P2=32, P3=36), 18 textbook mappings.
- ✅ `npm run build`: Next.js 16.2.6 production build compiled, typechecked, generated pages and finalized successfully.

## Current Phase — Phase 4 Practice / Attempt Core

Primary scope:
- introduce `PracticeSession`, structured `PracticeItem`, server-observed hint reveal facts, and immutable `Attempt` records;
- generate objective-aligned deterministic practice using existing curriculum/planner contracts;
- convert validated practice outcomes into Phase 2 `EvidenceRecord`s through explicit replay-safe rules;
- keep raw wrong Attempts separate from persistent Mistake/misconception confirmation;
- preserve deterministic mastery authority and existing repository boundaries.

Phase 4 implementation is in progress. No MM-P4 backlog item is marked complete until its verified slice lands.

Homework image/OCR remains Phase 5. Persistent `Mistake` lifecycle remains Phase 6.

## Known Non-blocking Technical Debt / Gates

- Self-host/package Geist fonts if sandbox production builds need to be network-independent.
- `npm ci` reports 13 audit findings (1 low, 4 moderate, 8 high); review separately, never force-upgrade as incidental feature work.
- Neon live repository contract remains intentionally gated on explicit `TEST_DATABASE_URL` and must pass before first real durable-data activation.
- Multi-household identity/tenancy is deliberately deferred; V1 remains single-household signed-session access.
