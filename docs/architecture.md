# MathMagics Architecture

## Product architecture

MathMagics is a Next.js 16 modular monolith for Singapore Math home education.

```text
Browser
  ↓
Vercel CDN / Next.js Node Functions (sin1)
  ├─ version-controlled curriculum truth
  ├─ deterministic learning-state domain
  ├─ deterministic teaching planner
  ├─ deterministic practice / Attempt engine
  ├─ signed household session auth
  ├─ narrow AI teaching/rendering adapters
  ↓
Neon PostgreSQL (Singapore)
```

## Authority boundaries

### Curriculum

`content/curriculum/` is authoritative. PostgreSQL does not duplicate curriculum truth.

### Learning state

`EvidenceRecord` is append-only learning history. `MasterySnapshot`, `reviewDue`, prerequisite readiness, `LearningPosition` and planner candidates are derived rather than stored as mutable facts.

### Planning

```text
StudentProfile + CurrentPositionAssumption + Evidence-derived state + curriculum
→ LearningPosition
→ LearningCandidate[]
→ WeeklyPlan
→ DailyLesson
```

Plans/lessons are immutable creation snapshots. Execution is append-only `LessonExecutionEvent` history.

### Practice

```text
DailyLesson + explicit objectiveId
→ PracticePreparationContext
→ deterministic practice-v1 blueprint
→ code-owned PracticeProblemSpec / AnswerSpec
→ immutable PracticeItem
→ optional server-observed HintReveal
→ deterministic grade
→ immutable Attempt
→ deterministic Evidence projection
→ derived Mastery / Readiness
```

A PracticeSession targets exactly one lesson/objective pair. Only PRACTICE/REVIEW lessons and non-BLOCKED objectives may enter the automatic practice loop.

`problemSpec` is the auditable mathematical structure. `AnswerSpec` is derived in code. Student-facing pre-answer projection does not expose either structure, the solution outline or an unrevealed hint.

Attempt retry history is append-only and linear. Stable Evidence IDs make interrupted `Attempt → Evidence` projection replay-safe without updating/deleting prior facts.

### AI

AI lesson-preparation and optional practice rendering are presentation/teaching boundaries. They cannot select objective IDs, alter mathematical problem structure, create authoritative answer keys, grade Attempts, or write Evidence/Mastery/Readiness. Unsupported practice objectives fail closed rather than falling back to unrestricted AI generation.

## Persistence

Adapters live under `lib/persistence/`; domain packages depend only on repository interfaces.

Durable tables:

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

There are no mutable mastery/readiness/learning-position/practice-status/ability-score/mistake tables.

Drizzle Kit generates committed SQL migrations:
- `0000_old_bushwacker.sql` — learning/planning foundation.
- `0001_fantastic_shocker.sql` — Phase 4 practice facts.

Production migration execution is explicit and separate from application startup or Preview deployment. Live integration contracts use `TEST_DATABASE_URL` only.

## Authentication

V1 remains single-household access. Successful `SITE_PASSWORD` verification issues an HMAC-signed stateless `mm_session`; the password itself is never stored in the cookie and auth does not require a Neon lookup.

## Deployment

- Vercel Node.js Functions: `sin1`
- Neon PostgreSQL: Singapore
- Preview and Production use separate database credentials
- no Redis, queue, worker, object storage, microservices or vector database in Phase 4

See the approved designs for full contracts:
- `docs/superpowers/specs/2026-08-24-mathmagics-phase3-teaching-planner-and-persistence-design.md`
- `docs/superpowers/specs/2026-08-25-mathmagics-phase4-practice-attempt-design.md`
