# Current Status — MathMagics

Version:        v0.7.0-dev
Phase:          Phase 6 — Correction + Mistake Book
Phase Status:   ✅ Implementation Complete / Exact-HEAD Host Verification Pending
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
- ✅ `HomeworkVisionProvider` is observation-only and has no grade, answer-key, objective, Evidence, Mastery or Readiness authority.
- ✅ `homework-confidence-v1` requires every grading-critical structural field and student answer confidence `>= 0.98`; lower confidence requires append-only Student/Parent correction.
- ✅ Deterministic conversion derives trusted `PracticeProblemSpec + AnswerSpec` from observed mathematical structure.
- ✅ `homework-objective-map-v1` maps only locked observable P2/P3 structures; ambiguous/unsupported structures fail closed.
- ✅ Canonical `Attempt` uses one ledger with `PRACTICE` or `HOMEWORK` source coordinates.
- ✅ Homework grading calls existing `gradeAnswer()` and projects HOMEWORK Evidence deterministically.
- ✅ Stable Homework Evidence IDs support exact replay and recovery when Attempt persisted but Evidence append was interrupted.
- ✅ Duplicate `(studentId, sourceSha256)` image submission is idempotent.
- ✅ Structured persistence uses `homework_submissions`, `homework_problems`, `homework_confirmations` plus generalized `attempts`; no raw image column exists.
- ✅ Drizzle migration `0002_gorgeous_obadiah_stane.sql` adds source exclusivity CHECK constraints.
- ✅ No object storage, queue, worker, Redis, vector DB or adaptive scoring was introduced.

### Phase 5 exact-HEAD verification

Final Host verification on implementation HEAD `82f78171f4872750a78d6c7c8ae6807c3fd3cba3` passed:

- ✅ `npm test`: 245 passed, 5 intentionally skipped across 47 files (43 passed, 4 skipped).
- ✅ `npm run typecheck`.
- ✅ `npm run validate:curriculum`: 25 nodes, 68 objectives (P2=32, P3=36), 18 textbook mappings.
- ✅ `npm run lint`.
- ✅ `npm run build`: Next.js production build completed successfully.
- ✅ PR #5 merged to canonical `main` as `e25c59e093b3b892684d357150a5504109f9de45`.

No Phase 3, 4 or 5 migration was applied to a real Neon database during implementation or Phase 5 merge verification.

## Phase 6 — Correction + Mistake Book

**✅ Implementation complete; exact-HEAD Host verification is the remaining release gate.**

Authority chain:

```text
INCORRECT canonical Attempt { PRACTICE | HOMEWORK }
→ automatic post-Attempt observation after Attempt + Evidence are durable
→ immutable Mistake learning-problem episode
→ deterministic diagnosis OR constrained AI candidate + Student/Parent confirmation
→ confirmed diagnosis target
→ AI teaching language inside trusted Correction context only
→ ORIGINAL_RETRY canonical CORRECTION Attempt
→ existing deterministic gradeAnswer()
→ corrected Evidence
→ code-owned structured reasoning checks + server-observed assistance
→ deterministic reasoning grade
→ explained_independently Evidence
→ deterministic isomorphic TRANSFER CorrectionItem
→ first-attempt, no-hint canonical CORRECTION Attempt
→ existing deterministic gradeAnswer()
→ application_correct Evidence
→ projectMistakeState() hard-fact projection
→ RESOLVED
→ optional MISTAKE_RESOLVED receipt (never authority)
```

Implemented:

- ✅ `Mistake` is an immutable learning-problem episode. No mutable `state` field or `setMistakeState` API exists.
- ✅ `mistake_events` and Mistake/Attempt links are append-only facts; lifecycle is derived by `projectMistakeState()`.
- ✅ Same unresolved `student × objective × confirmed diagnosisTarget` aggregates related incorrect Attempts; a resolved episode is never reopened.
- ✅ A future recurrence after resolution creates a new episode. Old correction Evidence is episode-isolated and cannot resolve the new recurrence.
- ✅ `AttemptSource` now supports `PRACTICE | HOMEWORK | CORRECTION(mistakeId, correctionItemId)` while preserving exactly one canonical Attempt ledger.
- ✅ CORRECTION retry provenance remains linear through `retryOfAttemptId`; failed retries never create child Mistakes or duplicate `incorrect` Evidence.
- ✅ Deterministic diagnosis auto-confirms only an exactly-one supported target.
- ✅ AI diagnosis is constrained to curriculum misconception IDs plus `FACT_ERROR / PROCEDURE_ERROR / REPRESENTATION_ERROR / UNKNOWN`; AI cannot mint taxonomy keys or confirm learning facts.
- ✅ Uncertain AI diagnosis stays `OBSERVED` until Student/Parent confirmation. Provisional episodes may consolidate append-only into an already-open confirmed episode.
- ✅ AI correction provider can phrase explanation/Socratic prompts only; math truth, answer keys, grades, reasoning outcomes, Evidence types and lifecycle remain code-owned.
- ✅ Structured reasoning checkpoints are code-owned and deterministically graded. Assistance is server-observed through `REASONING_ASSISTANCE_REVEALED`; a later fresh unassisted PASS can qualify.
- ✅ `corrected` Evidence is tied to a current-episode `CORRECTION_RETRY` Attempt; `explained_independently` is tied directly to the Mistake episode.
- ✅ Transfer generation is deterministic/isomorphic and fail-closed. Unsupported structures remain `CORRECTING`; AI cannot invent an assessment item.
- ✅ Transfer round 1 is consumed by its first Attempt. A later correct answer on the same item cannot qualify; fresh independent reasoning is required before deterministic round 2.
- ✅ Successful transfer reuses `application_correct`; resolution requires `corrected + explained_independently + qualifying transfer` hard facts.
- ✅ `MISTAKE_RESOLVED` is only a replay-repairable receipt. An early/fake receipt cannot force `RESOLVED`, and an interrupted receipt can be repaired only by replaying the exact already-stored qualifying transfer Attempt.
- ✅ Practice/Homework services expose a narrow optional `AttemptRecordedObserver`; incorrect root Attempts are observed only after canonical Attempt + Evidence persistence. CORRECTION Attempts are never recursively observed as root Mistakes.
- ✅ Student projection exposes learning-language status/next step without AnswerSpec, solution outline, AI rationale or raw event payloads.
- ✅ Parent projection derives Active / Resolved / Recurring summaries from deterministic episode history and curriculum labels.
- ✅ Memory + Neon correction repositories and Drizzle migration `0003_stale_mercury.sql` are implemented.
- ✅ Phase 6 does not change weekly planner automatic scheduling. Adaptive next-best learning remains Phase 7.

### Phase 6 verification evidence so far

Sandbox/final-working-tree evidence before the remaining Host-only gates:

- ✅ Full test suite: 311 passed, 6 intentionally skipped across 63 files (59 passed, 4 skipped).
- ✅ Exact `npm run typecheck` executed through a temporary controlled test probe and passed with exit code 0; the probe was deleted afterward.
- ✅ `npm run lint`: exit code 0 with 0 warnings after cleanup.
- ✅ Static authority audit: no production `setMistakeState`, `mistake_state`, mutable Mastery/Readiness setter, AI correction grading/understanding authority, or parallel CorrectionAttempt ledger. Both CORRECTION grading paths call `gradeAnswer()` and resolution is derived through `projectMistakeState()` hard facts.
- ✅ `migrations/0003_stale_mercury.sql` was reviewed and not applied to production.
- ⚠️ Exact `npm run validate:curriculum` is sandbox-blocked by the known `tsx` Unix-pipe `EINVAL` limitation; requires exact-HEAD Host execution rather than a weaker substitute.
- ⚠️ Sandbox `npm run build` reaches Next.js/Turbopack but fails only because `next/font` cannot fetch Geist / Geist Mono from Google Fonts; requires exact-HEAD Host build as in Phase 5.

No Phase 6 migration has been applied to any production database.

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

Generated migrations committed in the Phase 6 branch:
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

## Next After Phase 6

**Phase 7 — Progress + Adaptive Learning Loop**

Primary scope remains:
- separate Curriculum Coverage, Knowledge Mastery and Practice Performance;
- consume durable Mistake/recurrence facts without weakening Phase 6 correction authority;
- prerequisite-aware Next Best Lesson recommendations;
- adaptive use of the already-reserved `CORRECTION` lesson intent.

Family pilot remains Phase 8.

## Known Non-blocking Technical Debt / Gates

- GrandeGPT currently has no registered `mathmagics:typecheck` profile; exact typecheck was still executed via the repository script inside a controlled test profile.
- Grande sandbox `tsx` IPC blocks the exact curriculum-validation script; final Host verification is required.
- Google Fonts network access blocks sandbox Next.js production build; final Host build is required. Self-host/package Geist only if this becomes an ongoing operational burden, not as incidental Phase 6 scope.
- `npm ci` reports 13 audit findings (1 low, 4 moderate, 8 high); review separately, never force-upgrade as incidental feature work.
- Neon live repository contracts remain intentionally gated on explicit `TEST_DATABASE_URL` and must pass before first real durable-data activation.
- Durable homework-image retention remains deliberately unselected until historical image review is a real requirement.
- Multi-household identity/tenancy is deliberately deferred; V1 remains single-household signed-session access.
