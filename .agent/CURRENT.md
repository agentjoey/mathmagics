# Current Status — MathMagics

Version:        v0.5.0-dev
Phase:          Phase 4 — Practice / Attempt Core
Phase Status:   ✅ Implementation Complete / PR Pending
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
- ✅ Storage-agnostic `LearningStateRepository`; Phase 4 only extends it with `getEvidence(id)` for replay-safe Evidence repair.
- ✅ No mutable `setMastery`, Evidence update/delete, or persisted mastery/readiness state.

## Phase 3 — Teaching Planner / Lesson Prep

**✅ Completed / Merged — PR #3, merge `9660870a996b07b165353eaf53a8fd41a971b0b5`.**

- ✅ Signed stateless `mm_session` household auth and Next.js `proxy.ts` guard.
- ✅ Deterministic `LearningPosition` and prerequisite-aware candidate selection.
- ✅ Immutable `WeeklyPlan` / `DailyLesson` snapshots and append-only `LessonExecutionEvent` history.
- ✅ Trusted `LessonPreparationContext` and narrow MiniMax lesson-brief boundary.
- ✅ Phase 3 Neon/Drizzle persistence for learning/planning facts.
- ✅ Vercel `sin1` + Neon Singapore deployment foundation with explicit migrations only.

## Phase 4 — Practice / Attempt Core

**Implementation complete; PR not yet merged.**

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

Completed:
- ✅ `PracticeSession`, structured `PracticeItem`, `PracticeHintReveal`, immutable `Attempt` and validation contracts.
- ✅ One PracticeSession targets one explicit `DailyLesson × objectiveId`; only `PRACTICE` / `REVIEW` lessons and non-BLOCKED objectives are accepted.
- ✅ `practice-v1` deterministic four-slot blueprint based on derived mastery/review state.
- ✅ Deterministic deep-slice generators for P2 Multiplication/Division, P3 Fractions and selected P2/P3 bar-model word-problem objectives; unsupported objectives fail closed.
- ✅ Mathematical truth is stored as typed `problemSpec`; `AnswerSpec` is code-derived and independently testable.
- ✅ Exact deterministic grading for integer, decimal, fraction, choice and exact-text answer specs; malformed student syntax becomes incorrect rather than an AI judgment.
- ✅ Student-safe item projection excludes `problemSpec`, `answerSpec`, solution outline and unrevealed hint.
- ✅ Hint usage is derived from append-only server-observed `PracticeHintReveal`, never client-reported.
- ✅ Retry provenance is latest-only, linear, same student/session/item/objective, and never overwrites wrong Attempts.
- ✅ Attempt → Evidence precedence: `incorrect`, `corrected`, `correct_with_hint`, `independent_correct`, `application_correct`.
- ✅ Stable Evidence IDs support exact replay and recovery when Attempt persisted but Evidence append was interrupted.
- ✅ `PracticeRepository` plus defensive-clone memory adapter and `NeonPracticeRepository`.
- ✅ Safe optional `PracticeContentRenderer` boundary contains no answer key, grade, Evidence, Mastery or Readiness authority; no provider is wired in Phase 4.
- ✅ P2/P3 E2E proves independent correct, hinted correct, wrong→retry→correct, P3 application correct, replay repair and unsupported fail-closed behavior.

## Persistence & Deployment

Durable fact tables now total 11:

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
attempts
```

Generated migrations:
- ✅ `migrations/0000_old_bushwacker.sql` — Phase 3 foundation.
- ✅ `migrations/0001_fantastic_shocker.sql` — Phase 4 practice facts.

Phase 4 migration adds only the four approved practice fact tables, FKs/indexes and immutable-history constraints. It does not persist `mastery_state`, `readiness_state`, `practice_status`, `ability_score` or `mistakes`.

**Activation gate before first real durable-data deployment:**
- provision separated Neon development/Preview and production databases in Singapore;
- apply committed migrations explicitly against non-production first;
- run both learning/planning and practice Neon contracts with explicit `TEST_DATABASE_URL`;
- only then promote the same reviewed migrations to production;
- never point tests or Vercel Preview at production `DATABASE_URL`.

No Phase 3 or Phase 4 migration was applied to a real Neon database during implementation.

## Verification — Phase 4

Controlled verification before closeout docs:
- ✅ `npm test`: 186 passed, 4 intentionally skipped.
- ✅ skipped tests are provider smoke plus Neon live contracts without explicit credentials.
- ✅ `npm run lint` clean after renderer-boundary warning removal.
- ✅ generated migration schema tests cover all 11 tables and reject derived-state persistence.
- ✅ static boundary audit found no production `setMastery`, no infrastructure/provider imports under `lib/practice`, and no automatic `db:migrate` path.

Exact-HEAD typecheck / curriculum validation / production build must be rerun after the final closeout commit before PR handoff.

## Next Phase

**Phase 5 — Homework Vision**

Primary scope:
- worksheet/photo ingestion and question/answer extraction with confidence;
- low-confidence handwriting confirmation;
- objective mapping before deterministic grading/evidence updates;
- decide object storage only when real image-retention requirements are known.

Persistent `Mistake` lifecycle remains Phase 6. Advanced adaptation remains Phase 7.

## Known Non-blocking Technical Debt / Gates

- Self-host/package Geist fonts if sandbox production builds need to be network-independent.
- `npm ci` reports 13 audit findings (1 low, 4 moderate, 8 high); review separately, never force-upgrade as incidental feature work.
- Neon live repository contracts remain intentionally gated on explicit `TEST_DATABASE_URL` and must pass before first real durable-data activation.
- Multi-household identity/tenancy is deliberately deferred; V1 remains single-household signed-session access.
