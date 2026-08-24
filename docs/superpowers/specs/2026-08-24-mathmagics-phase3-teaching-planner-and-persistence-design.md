# MathMagics Phase 3 — Teaching Planner, Lesson Prep & Durable Household State Design

Status: Proposed for Human Owner review  
Date: 2026-08-24  
Base: `main` at `781ef9eb416d039d6ade6547d0b8f1ab4d850f4f`  
Depends on: Phase 1 Curriculum Foundation, Phase 2 Student & Mastery Core

## 1. Purpose

Phase 3 turns the trusted curriculum and learning-state foundations into an explainable teaching plan for a household.

It answers two product questions:

1. **What should the student learn or review next?**
2. **How should the parent/tutor teach the next lesson?**

The product flow becomes:

```text
Curriculum Truth
+
StudentProfile / CurrentPositionAssumption
+
Evidence -> Mastery / reviewDue / Readiness
        ↓
Deterministic Planner Context
        ↓
LearningPosition
        ↓
Learning Candidates
        ↓
WeeklyPlan
        ↓
DailyLesson
        ↓
LessonPreparationContext
        ↓
AI-generated Parent/Tutor LessonBrief
```

Phase 3 also introduces the minimum durable household state required for plans and evidence to survive process restarts.

## 2. Locked Deployment Architecture

Phase 3 uses the approved V1 deployment target:

```text
Browser
  ↓ HTTPS
Vercel CDN
  ↓
Next.js 16 modular monolith
Vercel Node.js Functions — Singapore (`sin1`)
  ├─ Curriculum / Learning / Planning domains
  ├─ auth/session verification
  ├─ server-side AI provider adapter
  └─ Drizzle persistence adapters
       ↓
Neon PostgreSQL — AWS Singapore
```

### 2.1 Runtime decisions

- One Next.js repository and deployment.
- Node.js server runtime for database and AI work.
- Vercel Function region locked to Singapore (`sin1`).
- Neon PostgreSQL created in Singapore.
- Drizzle ORM plus Neon serverless driver.
- Git-tracked SQL migrations generated from the Drizzle schema.
- Curriculum JSON remains bundled, version-controlled read-only application content.
- MiniMax remains the V1 server-side LLM provider through the existing Anthropic-compatible adapter.

### 2.2 Explicit infrastructure non-goals

Phase 3 does not introduce:

- Redis;
- queues or worker services;
- object storage;
- vector database;
- Elasticsearch;
- microservices;
- a separate frontend/backend repository split;
- multi-region database/functions;
- Kubernetes or a Docker runtime requirement.

## 3. Authority Model

The architecture keeps three kinds of truth separate.

### 3.1 Curriculum truth

Owned by Phase 1 curriculum data and APIs.

AI must not invent objectives, rewrite prerequisite facts, mutate curriculum provenance, or replace curriculum sequence with prose recommendations.

### 3.2 Learning-state truth

Owned by durable Phase 2 facts:

- `StudentProfile`;
- `CurrentPositionAssumption`;
- `EvidenceRecord`.

Derived and never persisted as mutable truth:

- `MasterySnapshot`;
- `reviewDue`;
- `ObjectiveReadiness`.

There remains no `setMastery()` path.

### 3.3 Planning truth

Owned by deterministic planning rules plus durable plan records and append-only execution events.

AI may write teaching prose only after a deterministic `LessonPreparationContext` exists. AI does not choose curriculum objectives or rewrite mastery/readiness.

## 4. Phase 3 Scope

Phase 3 includes:

1. signed session hardening for the current single-household access model;
2. Neon/Drizzle durable adapters for Phase 2 learning-state facts;
3. deterministic `LearningPosition` derivation;
4. deterministic learning-candidate selection;
5. `WeeklyPlan` / `DailyLesson` domain models and generation;
6. append-only lesson execution history;
7. `LessonPreparationContext`;
8. a narrow AI `LessonBriefGenerator` boundary;
9. persistence for plans, execution events and generated lesson briefs;
10. real P2/P3 end-to-end planning scenarios.

## 5. Explicitly Deferred

Phase 3 does not implement:

- `PracticeSession` or `Attempt` (Phase 4);
- homework OCR/photo ingestion/grading (Phase 5);
- `Mistake` lifecycle or guided correction engine (Phase 6);
- progress dashboards or adaptive next-best-lesson algorithms (Phase 7);
- multi-student household scheduling;
- teacher/classroom administration;
- calendar sync;
- complex spaced-repetition scoring;
- psychometric ability scoring.

`CORRECTION` and `ASSESSMENT` are reserved lesson intent values for forward compatibility, but the Phase 3 automatic planner does not emit them because the prerequisite domain facts do not yet exist.

## 6. Module Boundaries

Create a new planning domain:

```text
lib/planning/
├── types.ts
├── validation.ts
├── curriculum-order.ts
├── position.ts
├── candidates.ts
├── weekly-plan.ts
├── execution.ts
├── lesson-preparation.ts
├── repository.ts
└── index.ts
```

Persistence remains separate:

```text
lib/persistence/
├── db.ts
├── schema.ts
├── neon-learning-state-repository.ts
├── neon-planning-repository.ts
└── migrations/
```

Authentication/session helpers remain separate from planning:

```text
lib/auth/
├── session.ts
└── constants.ts
```

The planning domain must not import Drizzle, Neon, Next.js request objects, or an LLM SDK.

## 7. Planning Domain Contracts

### 7.1 LearningPosition

`CurrentPositionAssumption` remains the household's manual statement. `LearningPosition` is a derived planner view.

```ts
export interface LearningPosition {
  studentId: string;
  levelId: StudentLevel;
  anchorTopicId?: string;
  anchorObjectiveId?: string;
  reviewObjectiveIds: string[];
  derivedAt: string;
}
```

`LearningPosition` is not persisted. It is reproducible from durable facts plus the current curriculum version.

### 7.2 PlannerCandidateReason

```ts
export type PlannerCandidateReason =
  | 'REVIEW_DUE'
  | 'PREREQUISITE_SUPPORT'
  | 'CURRENT_POSITION'
  | 'NEXT_IN_SEQUENCE';
```

### 7.3 LearningCandidate

```ts
export interface LearningCandidate {
  objectiveId: string;
  reason: PlannerCandidateReason;
  readiness: ReadinessState;
  mastery: MasteryState;
  reviewDue: boolean;
  targetObjectiveId?: string;
  curriculumOrder: number;
}
```

There is no opaque AI score and no student-ability score.

### 7.4 LessonIntent

```ts
export type LessonIntent =
  | 'LEARN'
  | 'PRACTICE'
  | 'REVIEW'
  | 'CORRECTION'
  | 'ASSESSMENT';
```

Phase 3 deterministic generation emits only `LEARN`, `PRACTICE`, and `REVIEW`.

`CORRECTION` requires Phase 6 mistake state. `ASSESSMENT` requires a future assessment source/attempt model. Keeping the contract values now avoids a destructive plan-schema rewrite later without pretending Phase 3 can execute workflows that do not exist.

### 7.5 WeeklyPlan

```ts
export interface WeeklyPlan {
  id: string;
  studentId: string;
  weekStart: string; // household-local calendar date YYYY-MM-DD
  sessionsPerWeek: number;
  minutesPerSession: number;
  createdAt: string;
}
```

A weekly plan is an immutable planning snapshot. Operational state is derived from lesson execution events.

### 7.6 DailyLesson

```ts
export interface PlanningRationale {
  code: PlannerCandidateReason;
  objectiveId: string;
  targetObjectiveId?: string;
}

export interface DailyLesson {
  id: string;
  weeklyPlanId: string;
  studentId: string;
  sequence: number;
  intent: LessonIntent;
  objectiveIds: string[];
  estimatedMinutes: number;
  rationale: PlanningRationale[];
  createdAt: string;
}
```

V1 keeps each lesson focused: one primary objective, with at most one additional review objective.

### 7.7 LessonExecutionEvent

Execution history is append-only rather than a mutable second copy of lesson state.

```ts
export type LessonExecutionEventType = 'STARTED' | 'COMPLETED' | 'SKIPPED';

export interface LessonExecutionEvent {
  id: string;
  lessonId: string;
  studentId: string;
  type: LessonExecutionEventType;
  occurredAt: string;
  actualMinutes?: number;
}
```

Question-level performance is not recorded here. That belongs to Phase 4 `Attempt`.

### 7.8 Derived execution state

```ts
export type DailyLessonExecutionStatus = 'PLANNED' | 'STARTED' | 'COMPLETED' | 'SKIPPED';

export interface DailyLessonExecutionState {
  lessonId: string;
  status: DailyLessonExecutionStatus;
  startedAt?: string;
  completedAt?: string;
  skippedAt?: string;
  actualMinutes?: number;
}
```

This state is derived from ordered execution events and is not persisted as a separate mutable field.

Weekly plan state is similarly derived:

- no lesson has an event -> `PLANNED`;
- at least one lesson has begun/terminated while at least one is non-terminal -> `ACTIVE`;
- every lesson is terminal (`COMPLETED` or `SKIPPED`) -> `COMPLETED`.

## 8. Curriculum Ordering

Planner sequence must never infer order from IDs such as `P3-FRA-003`.

Define deterministic active-level order by traversing real Phase 1 nodes:

```text
level
  → strands sorted by sequence
    → topics sorted by sequence
      → objectives sorted by sequence
```

Expose an internal helper equivalent to:

```ts
listLevelObjectivesInCurriculumOrder(levelId, dataset): LearningObjective[]
```

Every candidate gets stable `curriculumOrder` from this traversal.

## 9. LearningPosition Derivation

The manual current-position assumption is an anchor, not evidence.

Derivation rules:

1. resolve the student's active-level curriculum sequence;
2. resolve the current `CurrentPositionAssumption` from the repository;
3. if `objectiveId` exists, use it as the forward anchor;
4. otherwise if `topicId` exists, use the first objective in that topic as the anchor;
5. otherwise use the first objective at the student's active level;
6. collect active-level objectives whose derived mastery is `MASTERED` and `reviewDue=true` into `reviewObjectiveIds`;
7. do not treat every pre-anchor `NOT_STARTED` objective as a learning gap.

The last rule is load-bearing. A child manually positioned at P3 Fractions must not be sent through every earlier P3 objective merely because the system lacks historical evidence for those lessons.

Pre-anchor objectives become relevant only when they are explicit prerequisites or have real evidence requiring review.

## 10. Deterministic Candidate Selection

Candidate selection is pure relative to a planning context.

### 10.1 Candidate precedence

Candidates are ordered by class, then curriculum order:

1. `REVIEW_DUE`;
2. `PREREQUISITE_SUPPORT`;
3. `CURRENT_POSITION`;
4. `NEXT_IN_SEQUENCE`.

No weighted score is required in Phase 3.

### 10.2 REVIEW_DUE

Any active-level objective with `MASTERED + reviewDue=true` becomes a `REVIEW_DUE` candidate.

Review due creates review capacity but does not halt forward progress.

### 10.3 CURRENT_POSITION

If the anchor objective is not mastered:

- `READY` -> can become `LEARN`;
- `NEEDS_SUPPORT` -> target remains visible, but planner first surfaces relevant non-mastered prerequisites;
- `BLOCKED` -> target cannot become `LEARN`; direct blocking prerequisites are surfaced instead.

### 10.4 PREREQUISITE_SUPPORT

For a target whose direct readiness is not `READY`, every direct non-mastered prerequisite is considered.

Ordering:

1. `NOT_STARTED` prerequisites;
2. `INTRODUCED`;
3. `DEVELOPING`;
4. curriculum order as tie-breaker.

P3 students may receive P2 remediation candidates exactly through the Phase 2 cross-level rule.

### 10.5 NEXT_IN_SEQUENCE

Starting at the anchor, scan forward in active-level curriculum order:

- skip mastered objectives unless `reviewDue`;
- select the first non-mastered `READY` objective;
- if the next logical objective is blocked, surface its direct prerequisites instead of skipping arbitrarily far ahead.

## 11. Weekly Plan Generation

Inputs:

```ts
export interface WeeklyPlanningInput {
  studentId: string;
  weekStart: string;
  sessionsPerWeek: number;
  minutesPerSession: number;
  candidates: LearningCandidate[];
}
```

The generator is deterministic.

### 11.1 V1 allocation rules

For `N = sessionsPerWeek`:

1. reserve at most one early slot for `REVIEW` when `REVIEW_DUE` exists;
2. choose the highest-priority teachable candidate for `LEARN`;
3. if a newly learned/developing objective exists and a slot remains, allocate a `PRACTICE` lesson for that objective;
4. continue with the next teachable candidate only after required prerequisite support has been scheduled;
5. never schedule more sessions than `N`;
6. each lesson's `estimatedMinutes` defaults to `minutesPerSession`.

A Phase 3 `PRACTICE` lesson means parent/tutor-led practice using the lesson brief or existing materials. Phase 4 adds question-level `PracticeSession` / `Attempt` without changing `DailyLesson`.

### 11.2 Explainability

Every lesson persists structured `rationale`.

Example:

```ts
{
  code: 'PREREQUISITE_SUPPORT',
  objectiveId: 'P3-FRA-001',
  targetObjectiveId: 'P3-FRA-003'
}
```

The planner never persists a rationale equivalent to "the AI thought this was best".

## 12. Execution Event Rules

Valid per-lesson event histories are:

```text
(no events)                  -> PLANNED
STARTED                      -> STARTED
STARTED -> COMPLETED         -> COMPLETED
STARTED -> SKIPPED           -> SKIPPED
SKIPPED                      -> SKIPPED
```

Invalid:

- `COMPLETED` without prior `STARTED`;
- second `STARTED`;
- any event after `COMPLETED` or `SKIPPED`;
- timestamps going backward;
- `actualMinutes` on `STARTED`.

Phase 3 does not automatically re-plan the rest of the week when a lesson is skipped. A later explicit plan-generation feature may use the latest durable state. This intentionally avoids an always-on adaptive scheduler before real household usage exists.

## 13. Lesson Preparation Context

Before any AI call, construct a deterministic context:

```ts
export interface LessonPreparationContext {
  student: StudentProfile;
  lesson: DailyLesson;
  objectives: Array<{
    objective: LearningObjective;
    mastery: MasterySnapshot;
    readiness: ObjectiveReadiness;
    prerequisites: LearningObjective[];
    representations: Representation[];
    strategies: ProblemSolvingStrategy[];
    misconceptions: Misconception[];
    readinessEvidence: string[];
    masteryEvidence: string[];
  }>;
}
```

The context contains trusted data only. AI is not allowed to query the repository independently.

## 14. LessonBrief AI Boundary

Define a narrow provider-agnostic interface:

```ts
export interface LessonBriefGenerator {
  generate(context: LessonPreparationContext): Promise<GeneratedLessonBriefContent>;
}
```

Generated content contract:

```ts
export interface GeneratedLessonBriefContent {
  objectiveSummary: string;
  readinessCheck: string[];
  teachingSequence: Array<{
    stage: 'CONCRETE' | 'PICTORIAL' | 'ABSTRACT';
    guidance: string;
  }>;
  keyQuestions: string[];
  workedExampleSuggestions: string[];
  misconceptionWatchouts: string[];
  masteryCheck: string[];
}
```

The V1 adapter reuses the existing MiniMax Anthropic-compatible client through this boundary.

AI may explain objectives, suggest examples/questions, turn CPA data into parent-friendly guidance, and surface curated misconceptions.

AI may not change objective IDs, prerequisite facts, mastery/readiness, create curriculum facts, or write Evidence merely because prose was generated.

## 15. Generated LessonBrief Persistence

A generated brief is user-facing content that can be revisited later.

```ts
export interface LessonBriefRecord {
  id: string;
  lessonId: string;
  studentId: string;
  generator: string;
  model: string;
  contextVersion: string;
  content: GeneratedLessonBriefContent;
  createdAt: string;
}
```

`contextVersion` identifies the MathMagics context schema version. Regeneration appends a new record; it does not mutate historical content in place.

## 16. Persistence Architecture

### 16.1 Learning-state repository

Keep the existing Phase 2 interface:

```ts
interface LearningStateRepository
```

Implement:

```text
MemoryLearningStateRepository   # tests/domain fixtures
NeonLearningStateRepository     # durable app adapter
```

The Neon adapter persists only Phase 2 facts.

### 16.2 Planning repository

```ts
export interface PlanningRepository {
  createWeeklyPlan(plan: WeeklyPlan, lessons: DailyLesson[]): Promise<void>;
  getWeeklyPlan(planId: string): Promise<WeeklyPlan | undefined>;
  getWeeklyPlanForStudentWeek(studentId: string, weekStart: string): Promise<WeeklyPlan | undefined>;
  listWeeklyPlansForStudent(studentId: string): Promise<WeeklyPlan[]>;

  getDailyLesson(lessonId: string): Promise<DailyLesson | undefined>;
  listDailyLessonsForPlan(planId: string): Promise<DailyLesson[]>;

  appendExecutionEvent(event: LessonExecutionEvent): Promise<void>;
  listExecutionEvents(lessonId: string): Promise<LessonExecutionEvent[]>;

  appendLessonBrief(record: LessonBriefRecord): Promise<void>;
  listLessonBriefs(lessonId: string): Promise<LessonBriefRecord[]>;
}
```

`createWeeklyPlan` persists the plan plus lessons atomically. Plan/lesson records are immutable after creation in Phase 3.

Memory and Neon implementations share behavior tests.

## 17. PostgreSQL Schema

Use snake_case physical names while TypeScript domain contracts remain camelCase.

Minimum tables:

```text
students
current_positions
evidence_records
weekly_plans
daily_lessons
lesson_execution_events
lesson_briefs
```

### 17.1 students

Primary key: `id`. Fields mirror `StudentProfile`.

### 17.2 current_positions

For V1 one active assumption per student is sufficient.

Primary key: `student_id`. Fields mirror the current `CurrentPositionAssumption`.

Historical manual-position changes are not required yet. If later product usage needs auditing, add a dedicated history table in a future migration.

### 17.3 evidence_records

Primary key: `id`.

Indexes:

- `(student_id, objective_id, observed_at, recorded_at, id)`;
- `(student_id, observed_at)`.

Evidence remains append-only at the application repository boundary.

### 17.4 weekly_plans

Primary key: `id`.

Unique: `(student_id, week_start)` for the Phase 3 one-plan-per-student-week model.

### 17.5 daily_lessons

Primary key: `id`.

Foreign key: `weekly_plan_id -> weekly_plans.id`.

Unique: `(weekly_plan_id, sequence)`.

`objective_ids` and `rationale` may use JSONB because they are bounded embedded plan snapshots, not independently queried curriculum facts.

### 17.6 lesson_execution_events

Primary key: `id`.

Foreign key: `lesson_id -> daily_lessons.id`.

Index: `(lesson_id, occurred_at, id)`.

Events are append-only. Derived lesson/weekly-plan status is not stored.

### 17.7 lesson_briefs

Primary key: `id`.

Foreign key: `lesson_id -> daily_lessons.id`.

Index: `(lesson_id, created_at, id)`.

Generated content is JSONB.

## 18. What Must Not Be Persisted

Do not create database columns/tables for:

- mutable mastery state;
- mutable readiness state;
- mutable lesson/weekly status snapshots;
- `LearningPosition`;
- candidate priority scores;
- curriculum nodes/objectives copied from JSON;
- AI-created prerequisite facts.

The database stores household/application facts and immutable plan snapshots, not duplicate curriculum truth or derived projections.

## 19. Database Access & Transactions

Use Drizzle with Neon serverless HTTP by default.

Expected Phase 3 access patterns are short request/response queries, not interactive long-running transactions.

Use a transaction where one business action must persist a weekly plan and its lessons atomically.

Do not hold a database transaction open while calling the AI provider.

Correct sequence:

```text
create/persist deterministic plan + lessons
commit DB transaction
↓
build LessonPreparationContext
↓
call AI
↓
append generated LessonBrief record
```

An AI timeout must not roll back or corrupt the deterministic plan.

## 20. Migration Strategy

Use Drizzle Kit to generate SQL migrations from `schema.ts`.

Rules:

1. migrations are committed to Git;
2. local/dev migration runs before integration tests that require Neon;
3. production migrations are explicit deployment steps;
4. application startup does not auto-migrate;
5. Vercel preview builds do not mutate the production database;
6. destructive migrations require a separate Human Gate.

## 21. Environment Model

### 21.1 Local

- Next.js local runtime;
- domain tests use memory repositories;
- integration tests may use a Neon development database;
- secrets stay in macOS Keychain through the existing loader.

### 21.2 Vercel Preview

- Preview uses development/preview `DATABASE_URL`;
- Preview never points to production Neon;
- Preview secrets are scoped in Vercel environment variables.

### 21.3 Production

- Vercel production Functions in `sin1`;
- Neon production database in Singapore;
- production-only `DATABASE_URL`;
- production secrets managed by Vercel.

Required secrets after Phase 3:

```text
DATABASE_URL
SITE_PASSWORD
SESSION_SECRET
MINIMAX_API_KEY
```

## 22. Authentication / Session Hardening

Current MVP behavior stores the actual `SITE_PASSWORD` value in the `mm_auth` cookie and middleware compares it directly. This must be removed before durable student state is exposed.

Phase 3 keeps the V1 single-household access model and does **not** introduce a full user/tenant system.

### 22.1 Session format

After successful password verification, issue a random HMAC-signed session token containing no household password or database identity.

Conceptual payload:

```ts
{
  version: 1,
  issuedAt: number,
  expiresAt: number,
  nonce: string
}
```

Cookie:

```text
mm_session=<encoded-payload>.<hmac-signature>
```

Properties:

- `httpOnly`;
- `secure` in production;
- `sameSite=lax`;
- 7-day max age;
- `path=/`.

Signature key: `SESSION_SECRET`.

Verification is stateless. Signature verification uses the platform cryptographic API rather than a hand-written string comparison. No session table is required in Phase 3.

### 22.2 Password handling

- password remains server-only in `SITE_PASSWORD`;
- cookie never contains the password;
- auth endpoint returns only success/failure;
- failed auth does not reveal whether the server secret is unset vs incorrect in production response text.

### 22.3 Next.js proxy migration

Because Next.js 16 deprecates `middleware.ts`, Phase 3 migrates the access guard to the supported `proxy` convention while touching this boundary.

The proxy/session verifier must not access Neon for each page request.

## 23. Planner Service Boundary

Application orchestration exposes a narrow service equivalent to:

```ts
export interface TeachingPlannerService {
  derivePosition(studentId: string, now: string): Promise<LearningPosition>;
  listCandidates(studentId: string, now: string): Promise<LearningCandidate[]>;
  createWeeklyPlan(studentId: string, weekStart: string, now: string): Promise<WeeklyPlan>;
  prepareLesson(lessonId: string): Promise<LessonPreparationContext>;
}
```

The service composes:

- `LearningStateRepository`;
- `PlanningRepository`;
- Phase 1 curriculum APIs;
- Phase 2 learning queries;
- pure planning functions.

It does not import the MiniMax SDK.

## 24. Error Handling

Fail closed for:

- unknown student IDs;
- unknown curriculum IDs;
- invalid manual current position;
- cross-level planner targets above the active student level;
- blocked target accidentally passed to a `LEARN` lesson generator;
- duplicate plan/lesson/event IDs;
- invalid execution-event history;
- database constraint failures.

AI generation errors are recoverable application errors:

- deterministic plan remains saved;
- no empty/fake LessonBrief record is written;
- caller may retry generation explicitly.

## 25. Concurrency & Idempotency

V1 does not need distributed locks.

Minimum protections:

- stable caller-generated IDs;
- database primary/unique constraints;
- unique `(studentId, weekStart)` prevents duplicate weekly plans;
- regenerating a LessonBrief appends a new version;
- Evidence append remains duplicate-ID protected;
- execution events are duplicate-ID protected and validated against prior history.

If concurrent requests race to create the same student/week plan, one fails cleanly through the uniqueness constraint rather than silently duplicating the week.

## 26. Testing Strategy

### 26.1 Pure domain tests

Use memory repositories and real Phase 1 curriculum data.

Cover:

- curriculum order traversal;
- LearningPosition anchor rules;
- no false remediation for pre-anchor NOT_STARTED objectives;
- candidate precedence;
- blocked-target prerequisite promotion;
- reviewDue coexistence with forward learning;
- deterministic weekly-plan allocation;
- execution-event state derivation and invalid transitions;
- LessonPreparationContext construction.

### 26.2 Repository contract tests

Run the same behavioral contract against:

- `MemoryPlanningRepository`;
- Neon planning adapter where an integration database is available.

The Phase 2 durable learning-state adapter gets equivalent contract tests.

### 26.3 Auth tests

Cover:

- correct password issues `mm_session`, never `SITE_PASSWORD`;
- tampered signature rejected;
- expired token rejected;
- wrong password rejected;
- missing `SESSION_SECRET` fails closed;
- protected routes accept a valid token.

### 26.4 Regression gates

Final Phase 3 gate:

```text
npm test
npm run typecheck
npm run validate:curriculum
npm run lint
npm run build
```

Normal host build remains authoritative if the GrandeGPT sandbox alone cannot fetch Google-hosted Geist fonts.

## 27. Acceptance Scenarios

### Scenario A — Forward learning

State:

```text
P3-FRA-001 MASTERED
P3-FRA-002 MASTERED
P3-FRA-003 READY
```

Expected:

```text
LearningPosition anchored in P3 Fractions
→ candidate P3-FRA-003 / NEXT_IN_SEQUENCE
→ WeeklyPlan contains LEARN P3-FRA-003
→ LessonPreparationContext resolves real representations, strategies and misconceptions
```

### Scenario B — Prerequisite remediation

State:

```text
target = P3-FRA-003
P2-FRA-003 MASTERED
P3-FRA-001 DEVELOPING
```

Expected:

```text
P3-FRA-003 is not scheduled as LEARN
P3-FRA-001 becomes PREREQUISITE_SUPPORT
rationale.targetObjectiveId = P3-FRA-003
```

### Scenario C — Review plus forward progress

State:

```text
P3-FRA-001 MASTERED + reviewDue
next curriculum objective READY
sessionsPerWeek >= 2
```

Expected:

```text
one REVIEW slot for P3-FRA-001
plus one LEARN slot for the forward objective
```

A post-mastery error must not freeze the curriculum.

### Scenario D — Manual position without historical evidence

State:

```text
CurrentPositionAssumption = P3-FRA-003
all earlier unrelated P3 objectives have no evidence
```

Expected:

```text
planner does not classify every earlier NOT_STARTED objective as remediation
only explicit prerequisites or reviewDue objectives can pull learning backward
```

### Scenario E — Execution history

State:

```text
DailyLesson exists
execution events: STARTED -> COMPLETED(actualMinutes=27)
```

Expected:

```text
derived lesson state = COMPLETED
replaying events produces the same state
any later event is rejected
```

### Scenario F — AI failure isolation

State:

```text
deterministic DailyLesson persisted
MiniMax lesson-brief request fails/timeouts
```

Expected:

```text
plan remains valid and persisted
no fake/partial LessonBrief record
retry is possible without regenerating curriculum/mastery state
```

## 28. Phase 3 Delivery Slices

Implementation should be executed in small TDD slices:

1. **P3-0 Auth/session hardening** — replace password-in-cookie and migrate middleware to proxy.
2. **P3-1 Persistence foundation** — Drizzle schema/migrations, Neon DB factory, durable Phase 2 repository adapter.
3. **P3-2 Planning contracts + validation** — domain types, plan rules and execution-event rules.
4. **P3-3 Curriculum order + LearningPosition** — deterministic anchor derivation.
5. **P3-4 Candidate selection** — review/prerequisite/current/next precedence.
6. **P3-5 WeeklyPlan + DailyLesson generation** — deterministic plan creation and rationale.
7. **P3-6 Planning repository + execution history** — memory and Neon adapters, derived execution state.
8. **P3-7 LessonPreparationContext + AI generator boundary** — reuse MiniMax through provider abstraction.
9. **P3-8 End-to-end acceptance + deployment closeout** — real P2/P3 flows, full validation, Vercel/Neon deployment docs/config.

P3-0 and P3-1 are infrastructure slices, not invitations to redesign authentication or persistence beyond V1 needs.

## 29. Phase 3 Completion Definition

Phase 3 is complete only when the system can deterministically and durably execute:

```text
Student + Evidence + Curriculum
        ↓
Mastery / Readiness
        ↓
LearningPosition
        ↓
LearningCandidate selection
        ↓
WeeklyPlan / DailyLesson persisted
        ↓
append-only execution history
        ↓
LessonPreparationContext
        ↓
Parent/Tutor LessonBrief persisted
```

and all of the following are true:

- identical trusted state produces identical planning results;
- blocked objectives cannot become `LEARN` lessons;
- prerequisite remediation is explainable through structured rationale;
- reviewDue creates review work without blocking forward progress;
- manual current position does not fabricate historical learning gaps;
- AI owns prose, not curriculum/mastery/planner authority;
- durable storage contains facts, immutable plan snapshots and events, not mutable mastery/readiness/status projections;
- auth cookie no longer contains `SITE_PASSWORD`;
- Preview never points at the production Neon database;
- migrations are explicit and Git-tracked;
- Phase 4/5/6 domain models have not leaked into Phase 3;
- full test/typecheck/curriculum/lint/build gates pass.

## 30. Future Gates

The following require separate future decisions, not Phase 3 implementation guesswork:

- multi-household authentication/tenant model;
- production commercial billing;
- China-mainland deployment architecture;
- object storage for homework photos;
- queue/worker architecture if vision workloads require it;
- automatic adaptive replanning policy beyond explicit weekly-plan generation.
