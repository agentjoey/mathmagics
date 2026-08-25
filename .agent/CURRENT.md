# Current Status — MathMagics

Version:        v0.7.0-dev
Phase:          Phase 6 — Correction + Mistake Book
Phase Status:   ✅ Design Approved / Written Spec Review Pending
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

Curriculum truth and learning history remain application-owned. AI explains, generates and recommends within trusted context; AI does not own curriculum truth, evidence, mastery, readiness, planner objective selection, mathematical answer keys or grades.

## Phase 1 — Curriculum Foundation

- ✅ MOE-backed P2/P3 curriculum graph with 25 nodes and 68 LearningObjectives (P2=32, P3=36).
- ✅ Three teaching-knowledge deep slices: P2 Multiplication & Division, P3 Fractions, P2/P3 Word Problems + Bar Model.
- ✅ Prerequisite edges, CPA representations, strategies, misconceptions, readiness evidence and mastery evidence.
- ✅ 18 Primary Mathematics 2022 textbook mappings.
- ✅ Deterministic curriculum loader, validator and query API.
- ✅ Legacy Q05/Q18 retained only as teaching-engine fixtures.

## Phase 2 — Student & Mastery Core

- ✅ `StudentProfile` and manual `CurrentPositionAssumption`.
- ✅ Append-only `EvidenceRecord` ledger.
- ✅ Deterministic `NOT_STARTED / INTRODUCED / DEVELOPING / MASTERED` projection and sticky mastery/review policy.
- ✅ Deterministic prerequisite readiness: `READY / NEEDS_SUPPORT / BLOCKED`.
- ✅ Storage-agnostic `LearningStateRepository`; later phases only add replay-safe reads, never mutable mastery writes.
- ✅ No mutable `setMastery`, Evidence update/delete, or persisted mastery/readiness state.

## Phase 3 — Teaching Planner / Lesson Prep

**✅ Completed / Merged — PR #3.**

- ✅ Signed stateless `mm_session` household auth and Next.js `proxy.ts` guard.
- ✅ Deterministic `LearningPosition` and prerequisite-aware candidate selection.
- ✅ Immutable `WeeklyPlan` / `DailyLesson` snapshots and append-only `LessonExecutionEvent` history.
- ✅ Trusted `LessonPreparationContext` and narrow MiniMax lesson-brief boundary.
- ✅ Phase 3 Neon/Drizzle persistence for learning/planning facts.
- ✅ Vercel `sin1` + Neon Singapore deployment foundation with explicit migrations only.

## Phase 4 — Practice / Attempt Core

**✅ Completed / Merged — PR #4.**

Authority chain:

```text
DailyLesson
→ trusted PracticePreparationContext
→ deterministic practice-v1 blueprint
→ code-owned PracticeProblemSpec + AnswerSpec
→ immutable PracticeItem
→ server-observed HintReveal
→ deterministic grade
→ immutable Attempt
→ deterministic replay-safe EvidenceRecord
→ Phase 2 derived Mastery / Readiness
```

- ✅ Deterministic P2/P3 PracticeSession/PracticeItem generation and code-owned math truth.
- ✅ Exact deterministic grading; malformed student syntax becomes incorrect rather than an AI judgment.
- ✅ Server-observed hint use, append-only retry provenance and stable replay-safe Evidence IDs.
- ✅ Memory + Neon PracticeRepository and `0001_fantastic_shocker.sql`.
- ✅ P2/P3 practice E2E for independent, hinted, incorrect/retry, application, replay repair and unsupported fail-closed outcomes.

## Phase 5 — Homework Vision

**✅ Completed / Merged — PR #5.**

Authority chain:

```text
JPEG / PNG / WebP image bytes (request-scoped only)
→ narrow HomeworkVisionProvider observation
→ per-field confidence + normalized source-region provenance
→ homework-confidence-v1 gate / append-only human confirmation
→ deterministic mathematical conversion
→ conservative P2/P3 LearningObjective mapping
→ existing deterministic gradeAnswer()
→ canonical immutable Attempt { PRACTICE | HOMEWORK }
→ source-aware EvidenceRecord
→ Phase 2 derived Mastery / Readiness
```

Completed:
- ✅ Trusted intake accepts JPEG/PNG/WebP up to 10 MiB and recomputes SHA-256 from request bytes.
- ✅ Raw homework image bytes are never written to Postgres, migration columns, repo fixtures, object storage or durable provider URLs.
- ✅ `HomeworkVisionProvider` is observation-only: visible question/answer/structured fields, confidence and source regions; it has no grade, answer-key, objective, Evidence, Mastery or Readiness authority.
- ✅ `homework-confidence-v1` requires every grading-critical structural field and student answer confidence `>= 0.98`; lower confidence requires append-only Student/Parent correction.
- ✅ Deterministic conversion derives trusted `PracticeProblemSpec + AnswerSpec` from observed mathematical structure, never from the provider's proposed answer key.
- ✅ `homework-objective-map-v1` maps only locked observable P2/P3 structures. Mental-strategy objectives such as `P2-MD-006` / `P3-MD-006` are intentionally not inferred from paper work; ambiguous/unsupported structures fail closed.
- ✅ Canonical `Attempt` uses a source union: `PRACTICE(sessionId,itemId)` or `HOMEWORK(submissionId,problemId)`. There is no parallel HomeworkAttempt ledger.
- ✅ Homework grading calls existing `gradeAnswer()` and projects HOMEWORK Evidence deterministically; Phase 5 never emits `corrected` and never records practice hint use.
- ✅ Stable Homework Evidence IDs support exact replay and recovery when Attempt persisted but Evidence append was interrupted.
- ✅ Duplicate `(studentId, sourceSha256)` image submission is idempotent and does not replay Vision extraction or duplicate learning history.
- ✅ Structured persistence uses `homework_submissions`, `homework_problems`, `homework_confirmations` plus generalized `attempts`; no raw image column exists.
- ✅ Drizzle migration `0002_gorgeous_obadiah_stane.sql` adds source exclusivity CHECK constraints and safely classifies pre-existing attempts as `PRACTICE`.
- ✅ No object storage, queue, worker, Redis, vector DB or adaptive scoring was introduced.

### Phase 5 exact-HEAD verification

Final Host verification on implementation HEAD `82f78171f4872750a78d6c7c8ae6807c3fd3cba3` passed:

- ✅ `npm test`: 245 passed, 5 intentionally skipped across 47 files (43 passed, 4 skipped).
- ✅ `npm run typecheck`.
- ✅ `npm run validate:curriculum`: 25 nodes, 68 objectives (P2=32, P3=36), 18 textbook mappings.
- ✅ `npm run lint`.
- ✅ `npm run build`: Next.js production build completed successfully.
- ✅ initial/final `git status --short` were clean.
- ✅ PR #5 merged to canonical `main` as `e25c59e093b3b892684d357150a5504109f9de45`.

No Phase 3, 4 or 5 migration was applied to a real Neon database during implementation or Phase 5 merge verification.

## Phase 6 — Correction + Mistake Book

**✅ Architecture approved; formal written spec created and pending Human Owner written-spec review.**

Approved authority chain:

```text
INCORRECT canonical Attempt
→ Mistake learning-problem episode
→ deterministic diagnosis OR constrained AI candidate + human confirmation
→ confirmed diagnosis target
→ trusted Socratic correction guidance
→ ORIGINAL_RETRY canonical CORRECTION Attempt
→ deterministic corrected Evidence
→ code-owned structured reasoning checks
→ explained_independently Evidence
→ deterministic isomorphic transfer item
→ first-attempt, no-hint CORRECTION Attempt
→ application_correct Evidence
→ deterministic RESOLVED projection
```

Locked design decisions:

- Mistake unit is a learning-problem episode, not one row per wrong Attempt.
- Same unresolved `student × objective × diagnosisTarget` aggregates related incorrect Attempts; recurrence after resolution creates a new episode and never reopens the old one.
- Every definite `INCORRECT` Attempt triggers Mistake observation.
- Deterministic diagnosis auto-confirms only an exactly-one supported target.
- AI may propose only from the objective's curriculum misconception IDs plus `FACT_ERROR / PROCEDURE_ERROR / REPRESENTATION_ERROR / UNKNOWN`; AI cannot invent taxonomy.
- AI diagnosis candidates require Student/Parent confirmation.
- `AttemptSource` will extend to `CORRECTION(mistakeId, correctionItemId)` while preserving one canonical Attempt ledger.
- Mistake lifecycle is projected from immutable facts/events; no mutable state setter/column is authoritative.
- `RESOLVED` requires all three: `corrected` + `explained_independently` + qualifying isomorphic transfer success.
- Structured reasoning is code-owned; AI may render questions but cannot decide whether the student understood.
- Transfer generation is deterministic and fail-closed. Unsupported structures remain `CORRECTING` with no AI fallback.
- A failed transfer item cannot be guessed repeatedly until it passes; only a new server-controlled transfer round can later qualify.
- `application_correct` is reused for successful independent transfer; no new `transfer_correct` Evidence type.
- Phase 6 exposes correction backlog and misconception history but does not change automatic weekly planning. Adaptation remains Phase 7.

Formal design spec:

`docs/superpowers/specs/2026-08-25-mathmagics-phase6-correction-mistake-book-design.md`

## Persistence & Deployment

Durable fact tables currently total 14 before Phase 6 implementation:

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
attempts
```

Generated migrations currently committed:
- ✅ `migrations/0000_old_bushwacker.sql` — Phase 3 foundation.
- ✅ `migrations/0001_fantastic_shocker.sql` — Phase 4 practice facts.
- ✅ `migrations/0002_gorgeous_obadiah_stane.sql` — Phase 5 structured homework provenance + unified Attempt source.

Phase 6 design plans five additional durable fact tables plus a three-source Attempt migration; implementation will generate `0003_*` but must not apply it to production.

**Activation gate before first real durable-data deployment:**
- provision separated Neon development/Preview and production databases in Singapore;
- apply committed migrations explicitly against non-production first;
- run learning/planning, practice, homework, and correction Neon contracts with explicit `TEST_DATABASE_URL`;
- only then promote the same reviewed migrations to production;
- never point tests or Vercel Preview at production `DATABASE_URL`.

## Next After Phase 6

**Phase 7 — Progress + Adaptive Learning Loop**

Primary scope remains:
- separate Curriculum Coverage, Knowledge Mastery and Practice Performance;
- consume durable Mistake/recurrence facts without weakening Phase 6 correction authority;
- prerequisite-aware Next Best Lesson recommendations;
- adaptive use of the already-reserved `CORRECTION` lesson intent.

Family pilot remains Phase 8.

## Known Non-blocking Technical Debt / Gates

- Self-host/package Geist fonts if sandbox production builds need to be network-independent.
- `npm ci` reports 13 audit findings (1 low, 4 moderate, 8 high); review separately, never force-upgrade as incidental feature work.
- Neon live repository contracts remain intentionally gated on explicit `TEST_DATABASE_URL` and must pass before first real durable-data activation.
- Durable homework-image retention remains deliberately unselected until historical image review is a real requirement.
- Multi-household identity/tenancy is deliberately deferred; V1 remains single-household signed-session access.
