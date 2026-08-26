# Current Status — MathMagics

Version:        v0.7.0
Phase:          Phase 6 — Correction + Mistake Book
Phase Status:   ✅ Completed / Merged / Exact-HEAD Host Verified
Last Updated:   2026-08-26 by agent

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

Curriculum truth and learning history remain application-owned. AI may explain, phrase guidance and recommend only inside trusted context; AI does not own curriculum truth, mathematical answer keys, grading, Evidence, Mastery, Readiness, planner objective selection, diagnosis confirmation or Mistake resolution.

## Roadmap Status

- ✅ Phase 0 — Product Reset
- ✅ Phase 1 — Curriculum Foundation
- ✅ Phase 2 — Student & Mastery Core
- ✅ Phase 3 — Teaching Planner / Lesson Prep — merged PR #3
- ✅ Phase 4 — Practice / Attempt Core — merged PR #4
- ✅ Phase 5 — Homework Vision — merged PR #5
- ✅ Phase 6 — Correction + Mistake Book — merged PR #6
- ▶️ Next: Phase 7 — Progress + Adaptive Learning Loop
- ⏭ Phase 8 — Family Pilot

## Phase 1 — Curriculum Foundation

- ✅ MOE-backed P2/P3 curriculum graph with 25 nodes and 68 LearningObjectives (P2=32, P3=36).
- ✅ Three teaching-knowledge deep slices: P2 Multiplication & Division, P3 Fractions, P2/P3 Word Problems + Bar Model.
- ✅ Prerequisite edges, CPA representations, strategies, misconceptions, readiness evidence and mastery evidence.
- ✅ 18 Primary Mathematics 2022 textbook mappings.
- ✅ Deterministic curriculum loader, validator and query API.

## Phase 2 — Student & Mastery Core

- ✅ `StudentProfile` and manual `CurrentPositionAssumption`.
- ✅ Append-only `EvidenceRecord` ledger.
- ✅ Deterministic `NOT_STARTED / INTRODUCED / DEVELOPING / MASTERED` projection and sticky mastery/review policy.
- ✅ Deterministic prerequisite readiness: `READY / NEEDS_SUPPORT / BLOCKED`.
- ✅ No mutable `setMastery`, Evidence update/delete, or persisted mastery/readiness state.

## Phase 3 — Teaching Planner / Lesson Prep

**✅ Completed / Merged — PR #3.**

- ✅ Signed stateless `mm_session` household auth and Next.js `proxy.ts` guard.
- ✅ Deterministic `LearningPosition` and prerequisite-aware candidate selection.
- ✅ Immutable `WeeklyPlan` / `DailyLesson` snapshots and append-only `LessonExecutionEvent` history.
- ✅ Trusted `LessonPreparationContext` and narrow MiniMax lesson-brief boundary.
- ✅ Neon/Drizzle persistence foundation with explicit migrations only.

## Phase 4 — Practice / Attempt Core

**✅ Completed / Merged — PR #4.**

```text
DailyLesson
→ trusted PracticePreparationContext
→ deterministic practice-v1 blueprint
→ code-owned PracticeProblemSpec + AnswerSpec
→ immutable PracticeItem
→ server-observed HintReveal
→ deterministic gradeAnswer()
→ immutable Attempt
→ deterministic replay-safe EvidenceRecord
→ Phase 2 derived Mastery / Readiness
```

- ✅ Deterministic P2/P3 practice generation and code-owned math truth.
- ✅ Server-observed hint use and append-only linear retry provenance.
- ✅ Memory + Neon PracticeRepository and `0001_fantastic_shocker.sql`.
- ✅ P2/P3 E2E for independent, hinted, incorrect/retry, application, replay repair and unsupported fail-closed outcomes.

## Phase 5 — Homework Vision

**✅ Completed / Merged — PR #5.**

```text
JPEG / PNG / WebP request bytes
→ observation-only HomeworkVisionProvider
→ confidence gate / append-only human confirmation
→ deterministic mathematical conversion
→ conservative objective mapping
→ gradeAnswer()
→ canonical Attempt { PRACTICE | HOMEWORK }
→ source-aware EvidenceRecord
```

- ✅ JPEG/PNG/WebP up to 10 MiB with request-scoped raw bytes only.
- ✅ `homework-confidence-v1` requires grading-critical confidence `>= 0.98`; otherwise Student/Parent confirmation is required.
- ✅ Trusted `PracticeProblemSpec + AnswerSpec` is derived deterministically from observed structure.
- ✅ One canonical Attempt ledger; no parallel HomeworkAttempt ledger.
- ✅ Memory + Neon homework persistence and `0002_gorgeous_obadiah_stane.sql`; no raw image column or object storage.
- ✅ Stable Evidence IDs support exact replay and partial-write repair.

### Phase 5 exact-HEAD verification

Implementation HEAD `82f78171f4872750a78d6c7c8ae6807c3fd3cba3` passed test, typecheck, curriculum validation, lint and production build before PR #5 merged to canonical `main` as `e25c59e093b3b892684d357150a5504109f9de45`.

## Phase 6 — Correction + Mistake Book

**✅ Completed / Merged — PR #6 / Exact-HEAD Host Verified.**

Authority chain:

```text
INCORRECT canonical Attempt { PRACTICE | HOMEWORK }
→ post-Attempt observation after Attempt + Evidence are durable
→ immutable Mistake learning-problem episode
→ deterministic diagnosis OR constrained AI candidate + Student/Parent confirmation
→ trusted correction guidance
→ ORIGINAL_RETRY canonical CORRECTION Attempt
→ gradeAnswer()
→ corrected Evidence
→ code-owned structured reasoning checks + server-observed assistance
→ explained_independently Evidence
→ deterministic isomorphic TRANSFER CorrectionItem
→ first-attempt, no-hint canonical CORRECTION Attempt
→ gradeAnswer()
→ application_correct Evidence
→ projectMistakeState() hard-fact projection
→ RESOLVED
→ optional MISTAKE_RESOLVED receipt, never authority
```

Implemented:

- ✅ `Mistake` is an immutable learning-problem episode; lifecycle is projected from immutable facts/events and there is no mutable state setter/column.
- ✅ Same unresolved `student × objective × confirmed diagnosisTarget` aggregates related incorrect Attempts; recurrence after resolution creates a new episode and never reopens the old one.
- ✅ Old correction Evidence is episode-isolated and cannot resolve a later recurrence.
- ✅ Canonical `AttemptSource` is now `PRACTICE | HOMEWORK | CORRECTION(mistakeId, correctionItemId)` with one Attempt ledger.
- ✅ CORRECTION retries preserve linear `retryOfAttemptId` provenance; failed retries do not create child Mistakes or duplicate `incorrect` Evidence.
- ✅ Deterministic diagnosis auto-confirms only an exactly-one supported target.
- ✅ AI diagnosis is constrained to curriculum misconception IDs plus `FACT_ERROR / PROCEDURE_ERROR / REPRESENTATION_ERROR / UNKNOWN`; uncertain candidates require Student/Parent confirmation.
- ✅ AI may phrase explanation/Socratic prompts only. Math truth, answer keys, grades, reasoning outcomes, Evidence types and lifecycle remain code-owned.
- ✅ Structured reasoning checkpoints are deterministically graded; assistance is server-observed through append-only correction facts.
- ✅ Transfer generation is deterministic/isomorphic and fail-closed; unsupported structures remain `CORRECTING` with no AI assessment fallback.
- ✅ A failed transfer consumes that transfer item. Later guessing on the same item cannot qualify; fresh independent reasoning is required before a server-controlled new transfer round.
- ✅ Resolution requires current-episode `corrected + explained_independently + qualifying transfer` hard facts.
- ✅ `MISTAKE_RESOLVED` is only a replay-repairable receipt and cannot force lifecycle state.
- ✅ Practice/Homework services expose a narrow Attempt observer; CORRECTION Attempts are never recursively observed as root Mistakes.
- ✅ Student and Parent projections expose correction progress/history without trusted answer data or raw event payloads.
- ✅ Memory + Neon correction repositories and generated migration `0003_stale_mercury.sql` are committed.
- ✅ Phase 6 does not change automatic weekly planning; adaptive next-best learning remains Phase 7.

### Phase 6 exact-HEAD Host verification

Canonical merge HEAD `a0b0c0aa37c882b2c8fd9850a76327f3068b487f` was verified on Host after PR #6 merge:

- ✅ initial `git status --short`: clean.
- ✅ `git rev-parse HEAD`: `a0b0c0aa37c882b2c8fd9850a76327f3068b487f`.
- ✅ `npm test`: 311 passed, 6 intentionally skipped across 63 files (59 passed, 4 skipped).
- ✅ `npm run typecheck`: passed (`tsc --noEmit`).
- ✅ `npm run validate:curriculum`: 25 nodes, 68 objectives (P2=32, P3=36), 18 textbook mappings.
- ✅ `npm run lint`: passed with no reported warnings/errors.
- ✅ `npm run build`: Next.js 16.2.6 production build completed successfully; 9/9 static pages generated.
- ✅ final `git status --short`: clean.

The first canonical verification attempt failed before tests started because canonical `node_modules` was absent; `npm ci` restored the lockfile-defined dependencies and the exact-HEAD verification above then passed. This is a GrandeGPT execution/bootstrap concern, not a MathMagics product failure.

No Phase 6 migration was applied to any production database and no production deploy was performed as part of Phase 6 implementation or verification.

Formal design spec:

`docs/superpowers/specs/2026-08-25-mathmagics-phase6-correction-mistake-book-design.md`

Implementation plan:

`docs/superpowers/plans/2026-08-25-mathmagics-phase6-correction-mistake-book.md`

## Persistence & Deployment

Durable fact tables now total 19:

```text
students
current_positions
evidence_records
weekly_plans
daily_lessons
lesson_execution_events
lesson_briefs
practice_sessions
practice_items
practice_hint_reveals
homework_submissions
homework_problems
homework_confirmations
mistakes
mistake_attempt_links
mistake_events
correction_items
correction_reasoning_checks
attempts
```

Committed migrations:
- ✅ `migrations/0000_old_bushwacker.sql` — Phase 3 foundation.
- ✅ `migrations/0001_fantastic_shocker.sql` — Phase 4 practice facts.
- ✅ `migrations/0002_gorgeous_obadiah_stane.sql` — Phase 5 structured homework provenance + unified Attempt source.
- ✅ `migrations/0003_stale_mercury.sql` — Phase 6 Mistake/correction facts + three-source Attempt coordinates.

**Activation gate before first real durable-data deployment:**
- provision separated Neon development/Preview and production databases in Singapore;
- apply committed `0000`–`0003` migrations explicitly against non-production first;
- run learning/planning, practice, homework and correction Neon contracts with explicit `TEST_DATABASE_URL`;
- only then promote the same reviewed migrations to production;
- never point tests or Vercel Preview at production `DATABASE_URL`.

## Next — Phase 7

**Phase 7 — Progress + Adaptive Learning Loop**

Primary scope:
- separate Curriculum Coverage, Knowledge Mastery and Practice Performance;
- consume durable Mistake/recurrence facts without weakening Phase 6 correction authority;
- prerequisite-aware Next Best Lesson recommendations;
- adaptive use of the already-reserved `CORRECTION` lesson intent.

Family pilot remains Phase 8.

## Known Non-blocking Technical Debt / Gates

- Before first durable-data activation, run all Neon contract suites against an explicit non-production `TEST_DATABASE_URL` and promote reviewed migrations only through the explicit activation gate.
- Decide whether to self-host/package Geist fonts only if sandbox network-independent builds become an ongoing project requirement.
- `npm ci` reports audit findings that must be reviewed separately; never force-upgrade dependencies as incidental feature work.
- Durable homework-image retention remains deliberately unselected until historical image review is a real requirement.
- Multi-household identity/tenancy is deliberately deferred; V1 remains single-household signed-session access.
