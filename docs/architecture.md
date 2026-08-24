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
  ├─ signed household session auth
  ├─ AI lesson-brief adapter
  ↓
Neon PostgreSQL (Singapore)
```

## Authority boundaries

### Curriculum

`content/curriculum/` is the authoritative curriculum source. PostgreSQL does not duplicate curriculum truth.

### Learning state

`EvidenceRecord` is append-only learning history. `MasterySnapshot`, `reviewDue`, prerequisite readiness, `LearningPosition`, and planner candidates are derived rather than stored as mutable facts.

### Planning

The deterministic chain is:

```text
StudentProfile
+ CurrentPositionAssumption
+ Evidence-derived Mastery/Readiness
+ Curriculum order/prerequisites
        ↓
LearningPosition
        ↓
LearningCandidate[]
        ↓
WeeklyPlan
        ↓
DailyLesson
```

Plans and lessons are immutable creation snapshots. Execution is append-only `LessonExecutionEvent` history, projected into execution state.

### AI

AI receives only a trusted `LessonPreparationContext` built from planned objectives plus curriculum/learning-state facts. The AI may generate lesson-preparation prose, questions, examples, CPA guidance, and misconception reminders. It cannot change objective IDs, prerequisites, mastery, readiness, or evidence.

## Persistence

Persistence adapters live under `lib/persistence/` and implement domain repository interfaces.

Durable Phase 3 tables:

```text
students
current_positions
evidence_records
weekly_plans
daily_lessons
lesson_execution_events
lesson_briefs
```

There are no durable mutable mastery/readiness/learning-position tables.

Drizzle Kit generates committed SQL migrations. Production migration execution is explicit and separate from application startup/deploy preview.

## Authentication

V1 remains single-household access. Successful `SITE_PASSWORD` verification issues an HMAC-signed stateless `mm_session` cookie. The password itself is never stored in the cookie, and request auth does not require a Neon lookup.

## Deployment

- Vercel Node.js Functions: `sin1`
- Neon PostgreSQL: Singapore
- Preview and Production use separate database credentials
- No Redis, queue, worker, object storage, microservices, or vector database in Phase 3

See the approved Phase 3 design for full contracts and rationale:
`docs/superpowers/specs/2026-08-24-mathmagics-phase3-teaching-planner-and-persistence-design.md`.
