# Current Status — MathMagics

Version:        v0.3.0-dev
Phase:          Phase 2 — Student & Mastery Core
Phase Status:   ✅ Completed
Last Updated:   2026-08-24 by agent

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

The system learning model is authoritative. AI explains, analyzes, generates and recommends; AI does not own curriculum truth, history or mastery state.

## Phase 1 — Curriculum Foundation

Completed foundation retained as the curriculum authority boundary:
- ✅ MOE-backed P2/P3 curriculum graph with 25 nodes and 68 LearningObjectives (P2=32, P3=36).
- ✅ Three teaching-knowledge deep slices: P2 Multiplication & Division, P3 Fractions, P2/P3 Word Problems + Bar Model.
- ✅ Prerequisite edges, CPA representations, strategies, misconceptions, readiness evidence and mastery evidence.
- ✅ 18 Primary Mathematics 2022 textbook mappings using `DIRECT`, `SUPPORTING` and `EXTENSION` relationships.
- ✅ Deterministic curriculum loader, validator and query API.
- ✅ Curriculum provenance rejects direct textbook sources as LearningObjective truth.
- ✅ Legacy Q05/Q18 retained only as teaching-engine fixtures.

## Phase 2 — Student & Mastery Core

**Completed:**
- ✅ `StudentProfile` and manual `CurrentPositionAssumption` contracts and validation.
- ✅ Append-only `EvidenceRecord` ledger with stable student/objective IDs.
- ✅ P2/P3 level enforcement, including P3 students using P2 remediation evidence while P2 students cannot record P3 evidence.
- ✅ Deterministic evidence ordering by `observedAt`, `recordedAt`, then evidence ID.
- ✅ Mastery projection states: `NOT_STARTED`, `INTRODUCED`, `DEVELOPING`, `MASTERED`.
- ✅ Mastery is derived from immutable evidence; there is no mutable `setMastery` path.
- ✅ Sticky mastery via earliest qualifying history prefix; post-mastery errors drive `reviewDue` rather than silent demotion.
- ✅ Deterministic `READY`, `NEEDS_SUPPORT`, `BLOCKED` prerequisite readiness using direct Phase 1 prerequisite links.
- ✅ Storage-agnostic asynchronous `LearningStateRepository` contract.
- ✅ `MemoryLearningStateRepository` for Phase 2 tests/fixtures; no production database selected yet.
- ✅ Public learning-state queries: student lookup, objective mastery, topic mastery, prerequisite readiness and active-level learning summary.
- ✅ End-to-end acceptance scenarios for P2 mastery/review recovery and P3 cross-level fraction readiness.
- ✅ `Attempt` intentionally deferred to Phase 4 Practice; `Mistake` intentionally deferred to Phase 6 Correction.

## Verification — 2026-08-24

Current Phase 2 worktree evidence:
- ✅ `npm test`: 60 passed, 1 provider smoke test skipped
- ✅ `npm run typecheck`
- ✅ `npm run validate:curriculum`: 25 nodes, 68 objectives (P2=32, P3=36), 18 textbook mappings
- ✅ `npm run lint`
- ✅ `npm run build` in normal host environment (Next.js 16.2.6 production build)

GrandeGPT controlled verification:
- ✅ test profile: 60 passed, 1 skipped
- ✅ lint profile
- ⚠ build profile remains network-constrained by `next/font` Google Fonts fetch; the same current worktree passes the host production build.

## Next Phase

**Phase 3 — Teaching Planner / Lesson Prep**

Primary scope:
- define `LearningPosition`, `WeeklyPlan`, `DailyLesson` and plan execution records;
- combine Student Profile, Current Position, Mastery, Prerequisite Readiness and curriculum sequence into deterministic planning context;
- generate parent/tutor lesson-preparation briefs from trusted curriculum/mastery state;
- keep AI as explanation/recommendation layer rather than curriculum/mastery authority;
- decide durable household persistence before the first planner feature that requires state to survive process restarts.

Explicitly defer `PracticeSession`/`Attempt`, homework OCR/photo grading, `Mistake` lifecycle and progress dashboards to their roadmap phases.

## Known Non-blocking Technical Debt
- Next.js warns that the `middleware` convention is deprecated in favor of `proxy`.
- GrandeGPT sandbox production build cannot fetch Google-hosted Geist fonts; host build passes.
- Provider smoke test remains skipped because it requires external provider credentials/network.
- `npm ci` currently reports dependency audit findings; no forced dependency upgrade is part of Phase 2.
