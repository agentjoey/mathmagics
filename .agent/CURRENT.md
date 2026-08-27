# Current Status — MathMagics

Version:        v0.8.0-dev
Phase:          Phase 8 — Family Pilot
Phase Status:   🟡 P8-0 Release Closure Complete / P8-1 Pilot Activation Next
Last Updated:   2026-08-27 by agent

## Product Positioning

MathMagics is a Singapore Math home-education AI learning system / teaching copilot for families.

Primary users:
- Parent / Tutor
- Student

Initial curriculum scope:
- Singapore Primary Mathematics
- Primary 2 and Primary 3

Core learning loop:

`Plan → Learn → Practice → Correct → Track → Adapt → next Learn`

Curriculum truth and learning history remain application-owned. AI explains and generates teaching language inside trusted context; AI does not own curriculum truth, Evidence, Mastery, Readiness, StrategyEvidence, MistakePriority, adaptive candidate ranking, lesson intent/objective selection, mathematical answer keys or grades.

## Phase 1 — Curriculum Foundation

**✅ Completed.**

- MOE-backed P2/P3 curriculum graph with 25 nodes and 68 LearningObjectives (P2=32, P3=36).
- Three teaching-knowledge deep slices: P2 Multiplication & Division, P3 Fractions, P2/P3 Word Problems + Bar Model.
- Prerequisite edges, CPA representations, strategies, misconceptions, readiness evidence and mastery evidence.
- 18 Primary Mathematics 2022 textbook mappings.
- Deterministic curriculum loader, validator and query API.

## Phase 2 — Student & Mastery Core

**✅ Completed.**

- `StudentProfile` and manual `CurrentPositionAssumption`.
- Append-only `EvidenceRecord` ledger.
- Deterministic `NOT_STARTED / INTRODUCED / DEVELOPING / MASTERED` projection and review policy.
- Deterministic prerequisite readiness: `READY / NEEDS_SUPPORT / BLOCKED`.
- No mutable Mastery/Readiness persistence or Evidence update/delete path.

## Phase 3 — Teaching Planner / Lesson Prep

**✅ Completed / Merged — PR #3.**

- Signed stateless `mm_session` household auth and Next.js proxy guard.
- Deterministic `LearningPosition` and prerequisite-aware candidate selection.
- Immutable `WeeklyPlan` / `DailyLesson` snapshots plus append-only execution history.
- Trusted lesson-preparation context and narrow MiniMax lesson-brief boundary.
- Neon/Drizzle persistence foundation.

## Phase 4 — Practice / Attempt Core

**✅ Completed / Merged — PR #4.**

- Deterministic P2/P3 practice generation and code-owned `PracticeProblemSpec + AnswerSpec`.
- Exact deterministic grading.
- Server-observed hint use, append-only retry provenance and immutable canonical `Attempt`.
- Replay-safe Attempt → Evidence projection.
- Memory + Neon PracticeRepository and migration `0001_fantastic_shocker.sql`.

## Phase 5 — Homework Vision

**✅ Completed / Merged — PR #5.**

- JPEG/PNG/WebP homework intake with non-durable raw-image boundary.
- Observation-only vision provider with confidence/provenance.
- Deterministic mathematical reconstruction and conservative objective mapping.
- Canonical `Attempt` ledger generalized to `PRACTICE | HOMEWORK`.
- Memory + Neon homework persistence and migration `0002_gorgeous_obadiah_stane.sql`.
- No object storage, queue, worker, Redis or adaptive scoring introduced.

## Phase 6 — Correction + Mistake Book

**✅ Completed / Merged — PR #6.**

Authority chain:

```text
INCORRECT canonical Attempt { PRACTICE | HOMEWORK }
→ Mistake episode
→ deterministic/constrained diagnosis
→ confirmed target
→ Socratic correction
→ canonical CORRECTION Attempt
→ corrected Evidence
→ structured reasoning
→ explained_independently Evidence
→ deterministic transfer
→ application_correct Evidence
→ projectMistakeState()
→ RESOLVED
```

Implemented:
- Immutable Mistake episodes with append-only events/links.
- `AttemptSource = PRACTICE | HOMEWORK | CORRECTION` in one canonical Attempt ledger.
- Recurrence creates a new episode; resolved episodes never reopen.
- AI can phrase correction guidance but cannot decide diagnosis confirmation, grading, Evidence type or lifecycle state.
- Resolution requires `corrected + explained_independently + qualifying transfer` hard facts.
- Student/Parent mistake projections are deterministic.
- Memory + Neon correction repositories and migration `0003_stale_mercury.sql`.

Post-merge canonical Host verification for Phase 6 passed on merge SHA `a0b0c0aa37c882b2c8fd9850a76327f3068b487f` after dependency bootstrap:
- 311 passed / 6 skipped tests.
- typecheck PASS.
- curriculum validation PASS: 25 nodes, 68 objectives, 18 mappings.
- lint PASS.
- production build PASS.

No Phase 6 migration was applied to production during implementation or verification.

## Phase 7 — Progress + Adaptive Learning Loop

**✅ Completed and release-closed by P8-0.**

Authority chain:

```text
Canonical Facts
├ EvidenceRecord
├ Attempt
├ LessonExecutionEvent
├ Mistake / MistakeEvent
└ StrategyInteraction / StrategyEvidence
        ↓
Progress Projection
├ Coverage
├ Mastery
├ Performance
└ Strategy
        ↓
Adaptive Context
        ↓
Deterministic Adaptive Policy
     ├ KEEP
     └ SUPERSEDE
          ↓
AdaptiveDecision + immutable replacement DailyLesson + LessonSupersession
```

Implemented:
- ✅ Coverage projection: `NOT_SEEN / INTRODUCED / ENGAGED / PRACTISED`.
- ✅ Existing Phase 2 Mastery authority remains unchanged.
- ✅ Performance projection: `INSUFFICIENT_DATA / STRUGGLING / UNSTABLE / STABLE` over `7 days ∩ latest 12 root PRACTICE/HOMEWORK Attempts`; CORRECTION Attempts are excluded.
- ✅ Cross-topic Strategy progress: `NOT_OBSERVED / DEVELOPING / RELIABLE` from server-observed structured interactions only.
- ✅ Strategy facts support `PROMPTED_USE / INDEPENDENT_USE / INDEPENDENT_TRANSFER / MISAPPLICATION`; a correct answer alone never proves strategy use.
- ✅ Deterministic MistakePriority: `LOW / NORMAL / BLOCKING`.
- ✅ Next Best Lesson priority: `BLOCKING_CORRECTION > PREREQUISITE_SUPPORT > NORMAL_CORRECTION > REVIEW > CURRENT_POSITION > NEXT_IN_SEQUENCE`.
- ✅ Starvation guard restores forward learning after two completed CORRECTION/REVIEW lessons unless a BLOCKING mistake or blocked prerequisite overrides.
- ✅ Weekly plans remain immutable initial plans; adaptation occurs only at lesson boundaries.
- ✅ STARTED lessons are never superseded.
- ✅ One source lesson has at most one immutable replacement; replacement-of-replacement chains are forbidden.
- ✅ `AdaptiveDecision` records policy version, input fact cutoff, selected lesson and rationale codes for replay/audit.
- ✅ Same evaluation key is idempotent; multiple KEEP decisions at later cutoffs are allowed, but only one SUPERSEDE can be adopted.
- ✅ Parent/Tutor Progress View keeps Coverage, Mastery, Performance and Strategy separate and explains adapted next lessons with code-owned rationale text.
- ✅ Student next-lesson view exposes only lesson identity, intent, objective summary and adapted flag.
- ✅ APIs are thin authenticated surfaces; clients cannot submit authoritative intent/objective/Mastery/MistakePriority/cutoff fields.
- ✅ Full-loop E2E covers Practice → Mistake → Correction → recurrence → adaptive CORRECTION → resolution → forward learning.
- ✅ Service-level starvation E2E proves normal remediation yields to forward learning after two completed remediation lessons.
- ✅ Static authority audit found no mutable Progress/Adaptive setters, combined learning score, persisted current recommendation, or AI provider dependency in `lib/progress`, `lib/adaptation` or `lib/strategy` authority paths.

### Phase 7 persistence

Durable fact tables now total 23.

Phase 7 adds exactly:

```text
strategy_interactions
strategy_evidence
adaptive_decisions
lesson_supersessions
```

Generated migration:
- ✅ `migrations/0004_strange_meteorite.sql`
- SHA-256: `40248aff69a6bd7052ad356b374418b3b3ded0bbe37779be867d0b11dd590cb7`
- Adds only the four approved Phase 7 fact tables plus required FKs/indexes.
- Drops `daily_lesson_plan_sequence_uq` so immutable replacement lessons can share the source lesson logical sequence.
- Adds non-unique `daily_lesson_plan_sequence_idx` for deterministic ordering.
- Does not add mutable Progress/Strategy/Performance/current-recommendation state.
- **Not applied to production.**

### P8-0 release-closure correction and final evidence

The original Phase 7 implementation merge was PR #8 / `61fb3e16485d645692c69a527db2d1f2ba36fa96`. P8-0 did **not** retroactively mark that SHA as exact-HEAD verified. Release verification exposed real blockers after the merge:

- the unused `next/font/google` Geist imports made sandbox builds depend on Google Fonts network access;
- Next 16 Turbopack PostCSS evaluation attempted a sandbox-disallowed local bind;
- three App Router route modules exported test handler factories that are invalid Next 16 route exports;
- the curriculum CLI depended on `tsx`/esbuild IPC/process behavior that could not execute inside the controlled sandbox.

Those release blockers were repaired through PR #9 and PR #10. The repaired canonical release candidate verified by P8-0 is:

`2bb70584ca189b43015a3cd2736b6262a8b2e78a`

Fresh disposable GrandeGPT worktree evidence on that exact SHA:
- ✅ `npm test`: 82 test files passed / 4 skipped; 386 tests passed / 8 intentionally skipped.
- ✅ The release-contract suite executed the exact `npm run typecheck` command successfully.
- ✅ The release-contract suite executed the exact `npm run validate:curriculum` command successfully and observed `25 nodes / 68 objectives (P2=32, P3=36) / 18 textbook mappings`.
- ✅ `npm run lint`: PASS, exit 0.
- ✅ `npm run build`: PASS, Next.js 16.2.6 webpack production build completed TypeScript, page-data collection, static generation 12/12, optimization and build traces.
- ✅ Worktree was clean before the documentation-only closeout edits.
- ⚠️ Live Neon suites remained intentionally skipped because no explicit `TEST_DATABASE_URL` was supplied; P8-0 does not claim live integration coverage.
- ✅ P8-0 performed no production database migration and no production deployment.

Formal design spec:

`docs/superpowers/specs/2026-08-26-mathmagics-phase7-progress-adaptive-learning-design.md`

Implementation plan:

`docs/superpowers/plans/2026-08-26-mathmagics-phase7-progress-adaptive-learning.md`

## Phase 8 — Family Pilot

**🟡 Active. P8-0 is complete; P8-1 Pilot Activation is next.**

Approved primary scope:
- multi-week household pilot on the existing P2/P3 curriculum;
- validate that families can understand what was learned, mastered, recently unstable, still needs correction, and should be taught next;
- validate adaptive lesson changes and rationale in real household use;
- collect product evidence before expanding curriculum, identity/tenancy or analytics scope.

Phase 8 formal design spec:

`docs/superpowers/specs/2026-08-26-mathmagics-phase8-family-pilot-design.md`

Phase 8 implementation plan:

`docs/superpowers/plans/2026-08-26-mathmagics-phase8-family-pilot.md`

## Persistence & Deployment

Committed migration chain:

```text
0000_old_bushwacker.sql
0001_fantastic_shocker.sql
0002_gorgeous_obadiah_stane.sql
0003_stale_mercury.sql
0004_strange_meteorite.sql
```

**P8-1 activation gate before first real durable-data deployment:**
- provision separated Neon development/Preview and production databases in Singapore;
- apply committed `0000`–`0004` migrations explicitly against non-production first;
- run learning/planning, practice, homework, correction, strategy and adaptive Neon contract suites with explicit `TEST_DATABASE_URL`;
- only after non-production evidence passes, stop at the explicit Human Gate before production migration/deployment;
- never point tests or Vercel Preview at production `DATABASE_URL`.

No Phase 7 migration has been applied to any production database.

## Known Non-blocking Technical Debt / Gates

- Standalone GrandeGPT `validate:curriculum` and `db:generate` profiles are still absent. Exact typecheck and curriculum validation are now enforced through `tests/release-gate-scripts.test.ts` inside the controlled MathMagics `test` profile; adding standalone profiles is an operational convenience, not a release blocker.
- `npm ci` currently reports 13 audit findings (1 low, 4 moderate, 8 high); review separately, never force-upgrade as incidental Phase 8 work.
- Neon live repository contracts remain intentionally gated on explicit `TEST_DATABASE_URL` and must pass before first real durable-data activation.
- Durable homework-image retention remains deliberately unselected until historical image review is a real requirement.
- Multi-household identity/tenancy remains deferred; V1 is still single-household signed-session access.
