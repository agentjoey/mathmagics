# MathMagics Phase 3 Teaching Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the deterministic Phase 3 teaching planner, trusted parent/tutor lesson-preparation boundary, signed-session hardening, and durable Neon/Drizzle persistence on top of the Phase 1 curriculum and Phase 2 learning-state model.

**Architecture:** Curriculum and learning-state authority remain deterministic. Planner decisions are pure and explainable; durable state stores facts, immutable plan snapshots, and append-only execution events. AI only transforms trusted `LessonPreparationContext` into lesson-preparation prose. The V1 deployment is a Next.js 16 modular monolith on Vercel `sin1`, backed by Neon PostgreSQL in Singapore through Drizzle and the Neon serverless driver.

**Tech Stack:** TypeScript, Next.js 16.2.6, Vitest 4.1.6, Web Crypto / Node crypto-compatible HMAC, Drizzle ORM + Drizzle Kit, `@neondatabase/serverless`, Neon PostgreSQL, existing MiniMax Anthropic-compatible provider.

**Spec:** `docs/superpowers/specs/2026-08-24-mathmagics-phase3-teaching-planner-and-persistence-design.md`

## Global Constraints

- Deployment target: Vercel Node.js Functions in `sin1` + Neon PostgreSQL in Singapore.
- Keep V1 single-household access. Do not add User/Household/Membership tenancy.
- Session cookie must not contain `SITE_PASSWORD` or another long-lived secret.
- Phase 2 `EvidenceRecord` stays append-only; mastery/readiness remain derived and are never persisted as mutable facts.
- `lib/planning` must not import Drizzle, Neon, Next.js request objects, or an LLM SDK.
- AI receives only deterministic `LessonPreparationContext`; it cannot choose objective IDs or rewrite curriculum/mastery/readiness.
- `WeeklyPlan` and `DailyLesson` are immutable creation snapshots. Execution is append-only `LessonExecutionEvent` projected into execution state.
- Automatic Phase 3 planning emits only `LEARN`, `PRACTICE`, `REVIEW`. `CORRECTION` and `ASSESSMENT` remain reserved values only.
- Do not implement `PracticeSession`, `Attempt`, homework OCR/photo grading, `Mistake`, dashboards, adaptive re-planning, Redis, queues, workers, object storage, microservices, or vector search.
- Curriculum ordering uses Phase 1 hierarchy/`sequence`, never ID lexical order.
- Manual current position is an anchor, not evidence that all earlier `NOT_STARTED` objectives are gaps.
- P3 may surface P2 remediation prerequisites; P2 may not plan P3 objectives.
- Production migrations are explicit. No startup auto-migrate and no Preview-to-production DB mutation.
- Preview and Production must use separate Neon credentials/database branches.

---

## Target File Structure

```text
lib/auth/
├── constants.ts
└── session.ts
proxy.ts
app/api/auth/route.ts

lib/planning/
├── types.ts
├── validation.ts
├── curriculum-order.ts
├── position.ts
├── candidates.ts
├── weekly-plan.ts
├── execution.ts
├── lesson-preparation.ts
├── lesson-brief-generator.ts
├── repository.ts
├── memory-repository.ts
├── service.ts
└── index.ts

lib/persistence/
├── db.ts
├── schema.ts
├── neon-learning-state-repository.ts
└── neon-planning-repository.ts

drizzle.config.ts
migrations/*.sql
lib/providers/minimax-lesson-brief.ts
```

Keep existing Phase 1/2 modules in place.

---

### Task 0: Harden Household Authentication and Move to Next.js Proxy

**Files:**
- Create: `lib/auth/constants.ts`
- Create: `lib/auth/session.ts`
- Create: `tests/auth-session.test.ts`
- Create: `proxy.ts`
- Modify: `app/api/auth/route.ts`
- Modify: `.env.example`
- Delete after replacement: `middleware.ts`

**Produces:**

```ts
export const SESSION_COOKIE_NAME = 'mm_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
export function issueSessionToken(secret: string, nowMs?: number, nonce?: string): Promise<string>;
export function verifySessionToken(token: string | undefined, secret: string, nowMs?: number): Promise<boolean>;
```

- [ ] **Step 1: Write RED tests**

Create runtime tests asserting a same-secret token verifies before expiry, and tampered/wrong-secret/malformed/expired tokens return `false`. Assert the token string contains neither signing secret nor a household password fixture. Use a fixed timestamp and fixed nonce in tests so output is deterministic.

- [ ] **Step 2: Run GrandeGPT `test` and confirm RED**

Expected: missing `@/lib/auth/session`.

- [ ] **Step 3: Implement versioned HMAC session token**

Payload:

```ts
interface SessionPayload {
  version: 1;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
}
```

Encode payload as base64url, sign exact encoded payload with HMAC-SHA-256, and return `<payload>.<signature>`. Default expiry is exactly seven days. Verification must fail closed and use timing-safe signature comparison. The helper must be usable from Next.js proxy runtime without Neon access.

- [ ] **Step 4: Update auth route**

On correct password + configured `SESSION_SECRET`, issue `mm_session` with:

```ts
{
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: SESSION_MAX_AGE_SECONDS,
  path: '/',
}
```

Invalid credentials return generic `401 Unauthorized`. Cookie never stores `SITE_PASSWORD`.

- [ ] **Step 5: Replace `middleware.ts` with `proxy.ts`**

Allow `/auth` and `/api/auth`; verify `mm_session` for protected routes; redirect invalid sessions to `/auth`; preserve static/image/favicon exclusions. No DB lookup.

- [ ] **Step 6: Extend `.env.example`**

Add empty committed declarations:

```text
SESSION_SECRET=
DATABASE_URL=
```

- [ ] **Step 7: Run `test` + `lint` profiles**

Expected: PASS.

- [ ] **Step 8: Commit**

```text
feat: harden household session authentication
```

---

### Task 1: Define Planning Contracts, Validation, and Execution Projection

**Files:**
- Create: `lib/planning/types.ts`
- Create: `lib/planning/validation.ts`
- Create: `lib/planning/execution.ts`
- Create: `lib/planning/index.ts`
- Create: `tests/planning-contracts.test.ts`

**Produces:** `LearningPosition`, `PlannerCandidateReason`, `LearningCandidate`, `LessonIntent`, `PlanningRationale`, `WeeklyPlan`, `DailyLesson`, `LessonExecutionEvent`, `DailyLessonExecutionState`, `LessonBriefRecord`, validators, and `deriveLessonExecutionState`.

- [ ] **Step 1: Write RED validation tests**

Test exact boundaries:

```text
sessionsPerWeek integer 1..7
minutesPerSession integer 10..180
weekStart YYYY-MM-DD
DailyLesson objectiveIds 1..2 unique IDs
estimatedMinutes positive integer
LessonIntent exact enum
```

Execution transitions:

```text
PLANNED -> STARTED -> COMPLETED
PLANNED -> SKIPPED
STARTED -> SKIPPED
```

Reject duplicate STARTED, events after COMPLETED/SKIPPED, cross-lesson events, and invalid timestamps.

- [ ] **Step 2: Run `test`, confirm RED**

Expected: missing planning runtime module/functions.

- [ ] **Step 3: Implement approved types**

`WeeklyPlan` and `DailyLesson` contain no mutable execution status. Use exact candidate reasons:

```ts
'REVIEW_DUE' | 'PREREQUISITE_SUPPORT' | 'CURRENT_POSITION' | 'NEXT_IN_SEQUENCE'
```

- [ ] **Step 4: Implement execution projection**

Sort events by `occurredAt`, then ID; never mutate input; reject invalid histories; empty history projects `PLANNED`. `actualMinutes` is available only from terminal event data.

- [ ] **Step 5: Run `test` + `lint`**

Expected: PASS.

- [ ] **Step 6: Commit**

```text
feat: define phase 3 planning contracts
```

---

### Task 2: Traverse Real Curriculum Order and Derive LearningPosition

**Files:**
- Create: `lib/planning/curriculum-order.ts`
- Create: `lib/planning/position.ts`
- Modify: `lib/planning/index.ts`
- Create: `tests/planning-position.test.ts`

**Produces:**

```ts
listLevelObjectivesInCurriculumOrder(levelId, dataset?): LearningObjective[]
deriveLearningPosition(repository, studentId, now): Promise<LearningPosition>
```

- [ ] **Step 1: Write curriculum-order RED tests**

Using real Phase 1 data, assert P2 returns 32 objectives, P3 returns 36, all belong to requested level, and hierarchy order follows node/objective `sequence`. Include:

```ts
const ids = listLevelObjectivesInCurriculumOrder('P3').map((o) => o.id);
expect(ids.indexOf('P3-FRA-001')).toBeLessThan(ids.indexOf('P3-FRA-003'));
```

- [ ] **Step 2: Run `test`, confirm RED**

- [ ] **Step 3: Implement hierarchy traversal**

Traverse `level -> strands -> topics -> objectives` using real `sequence`, fail closed for malformed topology.

- [ ] **Step 4: Add LearningPosition RED tests**

Cover objective anchor, topic anchor, no-position fallback, active-level `MASTERED + reviewDue` collection, no fake gaps before anchor, and rejection of P3 anchor for P2 student.

- [ ] **Step 5: Implement LearningPosition**

Return the approved structure with caller-provided `derivedAt=now`. Manual anchor is not converted into evidence.

- [ ] **Step 6: Run `test` + `lint`**

- [ ] **Step 7: Commit**

```text
feat: derive curriculum learning position
```

---

### Task 3: Select Deterministic Learning Candidates

**Files:**
- Create: `lib/planning/candidates.ts`
- Modify: `lib/planning/index.ts`
- Create: `tests/planning-candidates.test.ts`

**Produces:**

```ts
listLearningCandidates(repository, position): Promise<LearningCandidate[]>
```

- [ ] **Step 1: Write precedence RED tests**

Assert class ordering:

```text
REVIEW_DUE
PREREQUISITE_SUPPORT
CURRENT_POSITION
NEXT_IN_SEQUENCE
```

Within prerequisite support, order non-mastered prerequisites by `NOT_STARTED`, `INTRODUCED`, `DEVELOPING`, then curriculum order.

- [ ] **Step 2: Write real P3-FRA-003 remediation test**

Given `P2-FRA-003=MASTERED` and `P3-FRA-001=DEVELOPING`, `P3-FRA-003` must not be a teachable target; `P3-FRA-001` appears as `PREREQUISITE_SUPPORT` with target `P3-FRA-003`.

- [ ] **Step 3: Write review + forward-progress coexistence test**

A `MASTERED + reviewDue` objective and a later READY forward objective must both appear.

- [ ] **Step 4: Run `test`, confirm RED**

- [ ] **Step 5: Implement selection**

No weighted score, no AI, no recursive prerequisite traversal, no arbitrary skipping past a blocked logical next target, no duplicate reason/target tuples.

- [ ] **Step 6: Run `test` + `lint`**

- [ ] **Step 7: Commit**

```text
feat: select deterministic learning candidates
```

---

### Task 4: Generate Deterministic WeeklyPlan and DailyLesson Snapshots

**Files:**
- Create: `lib/planning/weekly-plan.ts`
- Modify: `lib/planning/index.ts`
- Create: `tests/planning-weekly-plan.test.ts`

**Pure-generator interface:**

```ts
export interface WeeklyPlanningInput {
  student: StudentProfile;
  weekStart: string;
  now: string;
  candidates: LearningCandidate[];
  planId: string;
  lessonIds: string[];
}

export interface WeeklyPlanBundle {
  plan: WeeklyPlan;
  lessons: DailyLesson[];
}

generateWeeklyPlan(input: WeeklyPlanningInput): WeeklyPlanBundle
```

IDs are injected only into the pure generator for deterministic testing. The public service in Task 7 keeps the approved narrow signature and owns ID generation through an injected `IdFactory`.

- [ ] **Step 1: Write allocation RED tests**

For a 4-session student assert: max one early REVIEW, highest-priority teachable candidate becomes LEARN, a later PRACTICE slot may target the learned/developing objective, prerequisite support precedes blocked target, lesson count never exceeds schedule, minutes come from `StudentProfile`, each lesson has 1 primary + at most 1 review objective, and automatic output never uses CORRECTION/ASSESSMENT.

- [ ] **Step 2: Run `test`, confirm RED**

- [ ] **Step 3: Implement deterministic allocation**

No hidden time/randomness. Reject insufficient injected lesson IDs. Persist structured rationale, never prose rationale.

- [ ] **Step 4: Add repeatability test**

Identical structured inputs produce deep-equal output.

- [ ] **Step 5: Run `test` + `lint`**

- [ ] **Step 6: Commit**

```text
feat: generate deterministic weekly lesson plans
```

---

### Task 5: Add PlanningRepository and Memory Adapter

**Files:**
- Create: `lib/planning/repository.ts`
- Create: `lib/planning/memory-repository.ts`
- Modify: `lib/planning/index.ts`
- Create: `tests/planning-repository.test.ts`

**Produces:**

```ts
export interface PlanningRepository {
  createWeeklyPlan(plan: WeeklyPlan, lessons: DailyLesson[]): Promise<void>;
  getWeeklyPlan(planId: string): Promise<WeeklyPlan | undefined>;
  findWeeklyPlan(studentId: string, weekStart: string): Promise<WeeklyPlan | undefined>;
  listWeeklyPlansForStudent(studentId: string): Promise<WeeklyPlan[]>;
  getDailyLesson(lessonId: string): Promise<DailyLesson | undefined>;
  listDailyLessonsForPlan(planId: string): Promise<DailyLesson[]>;
  appendExecutionEvent(event: LessonExecutionEvent): Promise<void>;
  listExecutionEvents(lessonId: string): Promise<LessonExecutionEvent[]>;
  appendLessonBrief(record: LessonBriefRecord): Promise<void>;
  listLessonBriefs(lessonId: string): Promise<LessonBriefRecord[]>;
}
```

`createWeeklyPlan` is atomic at repository semantics.

- [ ] **Step 1: Write RED behavior tests**

Cover plan+ordered lessons, unique `(studentId, weekStart)`, duplicate IDs, defensive copies, append-only globally unique event IDs, deterministic event ordering, append-only lesson-brief versions, unknown lesson rejection, and student mismatch rejection.

- [ ] **Step 2: Run `test`, confirm RED**

- [ ] **Step 3: Implement `MemoryPlanningRepository`**

Use Maps/arrays, defensive cloning, deterministic sorting. No update/delete APIs for immutable plan/event/brief history.

- [ ] **Step 4: Run `test` + `lint`**

- [ ] **Step 5: Commit**

```text
feat: add planning repository boundary
```

---

### Task 6: Add Neon + Drizzle Durable Persistence

**Files:**
- Modify: `package.json`, `package-lock.json`, `.env.example`
- Create: `drizzle.config.ts`
- Create: `lib/persistence/db.ts`
- Create: `lib/persistence/schema.ts`
- Create: `lib/persistence/neon-learning-state-repository.ts`
- Create: `lib/persistence/neon-planning-repository.ts`
- Create: `migrations/0000_phase3_learning_and_planning.sql`
- Create: `tests/persistence-schema.test.ts`

**Required packages:**

```text
dependencies: drizzle-orm, @neondatabase/serverless
devDependencies: drizzle-kit
```

- [ ] **Step 1: Install packages with npm**

Never hand-edit the lockfile. If controlled worktree package installation is unavailable, stop at this exact environment gate and request one Human Owner `npm install` command.

- [ ] **Step 2: Write schema RED test**

Import runtime table exports and assert exact physical tables:

```text
students
current_positions
evidence_records
weekly_plans
daily_lessons
lesson_execution_events
lesson_briefs
```

Also inspect committed migration text to ensure it has no mutable `mastery_state` or `readiness_state` columns.

- [ ] **Step 3: Run `test`, confirm RED**

- [ ] **Step 4: Implement Drizzle schema**

Constraints:

```text
students.id PK
current_positions.student_id PK -> students.id
evidence_records.id PK
weekly_plans.id PK + unique(student_id, week_start)
daily_lessons.id PK + unique(weekly_plan_id, sequence)
lesson_execution_events.id PK
lesson_briefs.id PK
```

Indexes:

```text
evidence_records(student_id, objective_id, observed_at, recorded_at, id)
evidence_records(student_id, observed_at)
weekly_plans(student_id, week_start)
lesson_execution_events(lesson_id, occurred_at, id)
lesson_briefs(lesson_id, created_at, id)
```

Use JSONB only for bounded snapshot fields: lesson objective IDs/rationale and brief content.

- [ ] **Step 5: Generate and inspect SQL migration with Drizzle Kit**

Commit generated SQL. Do not add runtime/startup auto-migrate code.

- [ ] **Step 6: Implement lazy DB factory**

Use Neon serverless HTTP + Drizzle. Read `DATABASE_URL` only when DB adapter is instantiated/used; pure unit imports/build must not require DB connectivity.

- [ ] **Step 7: Implement `NeonLearningStateRepository`**

Match existing Phase 2 interface behavior: student, current position, append/list evidence, duplicate-ID protection, no evidence update/delete.

- [ ] **Step 8: Implement `NeonPlanningRepository`**

Match memory contract. `createWeeklyPlan` must persist plan+lessons atomically. No transaction may span an AI call.

- [ ] **Step 9: Add shared repository-contract test helpers**

Memory contract runs by default. Neon integration contract runs only when `TEST_DATABASE_URL` is present, and must never substitute production `DATABASE_URL`.

- [ ] **Step 10: Run `test` + `lint`**

Expected: default suite PASS without external DB.

- [ ] **Step 11: Commit**

```text
feat: add neon drizzle persistence adapters
```

---

### Task 7: Build TeachingPlannerService and Trusted LessonPreparationContext

**Files:**
- Create: `lib/planning/service.ts`
- Create: `lib/planning/lesson-preparation.ts`
- Create: `lib/planning/lesson-brief-generator.ts`
- Modify: `lib/planning/index.ts`
- Create: `tests/planning-lesson-preparation.test.ts`

**Public service must match approved spec exactly:**

```ts
export interface TeachingPlannerService {
  derivePosition(studentId: string, now: string): Promise<LearningPosition>;
  listCandidates(studentId: string, now: string): Promise<LearningCandidate[]>;
  createWeeklyPlan(studentId: string, weekStart: string, now: string): Promise<WeeklyPlan>;
  prepareLesson(lessonId: string): Promise<LessonPreparationContext>;
}
```

Use an injected factory internally:

```ts
export interface IdFactory {
  planId(): string;
  lessonId(sequence: number): string;
}
```

This keeps public API narrow while the pure generator receives deterministic IDs.

Also define:

```ts
export interface LessonBriefGenerator {
  generate(context: LessonPreparationContext): Promise<GeneratedLessonBriefContent>;
}
```

- [ ] **Step 1: Write service RED tests**

Assert service reads schedule from `StudentProfile`, composes position/candidates, refuses duplicate `(studentId, weekStart)`, uses injected IDs, persists plan+lessons, and returns the created `WeeklyPlan` exactly as approved.

- [ ] **Step 2: Implement service orchestration**

Compose repositories + pure planning functions only. No MiniMax/Drizzle imports.

- [ ] **Step 3: Write trusted-context RED test**

For a real lesson targeting `P3-FRA-003`, assert context includes exactly the planned objective plus trusted mastery/readiness/prerequisites/representations/strategies/misconceptions/readinessEvidence/masteryEvidence. Context must not introduce unplanned objectives.

- [ ] **Step 4: Implement `buildLessonPreparationContext`**

Use Phase 1 curriculum APIs and Phase 2 learning queries.

- [ ] **Step 5: Define generated brief content contract**

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

- [ ] **Step 6: Run `test` + `lint`**

- [ ] **Step 7: Commit**

```text
feat: add teaching planner service and lesson context
```

---

### Task 8: Reuse MiniMax Behind the LessonBriefGenerator Boundary

**Files:**
- Create: `lib/providers/minimax-lesson-brief.ts`
- Create: `tests/lesson-brief-generator.test.ts`
- Modify only if a reusable helper is required: `lib/providers/minimax.ts`

- [ ] **Step 1: Write provider-contract RED test with injected fake LLM call**

Assert prompt/input contains planned objective IDs, curated teaching knowledge, mastery/readiness summaries, and explicit authority constraints. No network/API key in unit test.

- [ ] **Step 2: Implement `MiniMaxLessonBriefGenerator`**

Reuse existing `@anthropic-ai/sdk`/MiniMax-compatible configuration. Serialize only trusted context, request structured JSON, validate required fields, reject malformed output, and never write evidence/mastery/persistence itself.

- [ ] **Step 3: Implement generation persistence helper**

Use exact order:

```text
prepare deterministic context
-> call AI
-> construct immutable LessonBriefRecord
-> append record
```

Inputs include caller-provided `briefId`, `now`, generator/model names, and `contextVersion='phase3-v1'`. No DB transaction spans AI.

- [ ] **Step 4: Add AI failure test**

On provider throw/invalid output, deterministic plan remains untouched and no empty brief record is appended.

- [ ] **Step 5: Run `test` + `lint`**

- [ ] **Step 6: Commit**

```text
feat: generate lesson briefs through minimax boundary
```

---

### Task 9: Prove Phase 3 End-to-End and Close Out Deployment

**Files:**
- Create: `tests/planning-e2e.test.ts`
- Modify: `.agent/CURRENT.md`, `.agent/BACKLOG.md`, `docs/deployment.md`
- Create/modify only if absent/needed: `vercel.json`

- [ ] **Step 1: Scenario A — forward learning**

P3 Fractions anchor, `P3-FRA-001=MASTERED`, `P3-FRA-002=MASTERED`, `P3-FRA-003=READY/not mastered`. Through public service/repositories assert candidate -> LEARN lesson -> trusted context for `P3-FRA-003`.

- [ ] **Step 2: Scenario B — prerequisite remediation**

`P2-FRA-003=MASTERED`, `P3-FRA-001=DEVELOPING`, target `P3-FRA-003`. Assert target not scheduled LEARN; `P3-FRA-001` scheduled first with `PREREQUISITE_SUPPORT` rationale targeting `P3-FRA-003`.

- [ ] **Step 3: Scenario C — review while advancing**

One active-level objective is `MASTERED + reviewDue=true` and a later objective is READY. Same weekly plan includes REVIEW plus forward LEARN.

- [ ] **Step 4: Execution-history scenario**

Append STARTED -> COMPLETED and derive COMPLETED. Verify no Evidence is written merely because lesson execution completed.

- [ ] **Step 5: Lock deployment docs/config**

Document Vercel `sin1`, Neon Singapore, Preview DB separation, required env (`DATABASE_URL`, `SITE_PASSWORD`, `SESSION_SECRET`, `MINIMAX_API_KEY`), explicit production migrations, and no startup migration. Keep `vercel.json` minimal.

- [ ] **Step 6: Run GrandeGPT final profiles**

Run `test`, `lint`, `build`. If sandbox build fails only on known Google Geist network fetch, preserve evidence and require host build on same HEAD.

- [ ] **Step 7: Host verification**

From exact worktree/HEAD:

```bash
npm run typecheck
npm run validate:curriculum
npm run build
```

If `TEST_DATABASE_URL` exists, also run Neon integration contract before claiming live DB verification.

- [ ] **Step 8: Static boundary audit**

Verify no `setMastery`, no persisted mastery/readiness, no PracticeSession/Attempt/Mistake implementation, no infrastructure import from `lib/planning`, no `SITE_PASSWORD` cookie logic, append/list-only execution history, no startup migration, and no Redis/queue/worker/object-storage dependency.

- [ ] **Step 9: Update CURRENT/BACKLOG after verification only**

Mark Phase 3 complete, record deployment/persistence/session/planner/AI boundaries, and make Phase 4 Practice/Attempt the next HIGH phase. Mark MM-P3-001..007 complete.

- [ ] **Step 10: Re-run fresh `test` + `lint` after docs/status edits**

- [ ] **Step 11: Commit**

```text
test: prove phase 3 teaching planner scenarios
```

---

## Phase 3 Final Review Checklist

1. Base includes merged Phase 2 `781ef9eb416d039d6ade6547d0b8f1ab4d850f4f`.
2. `proxy.ts` validates signed `mm_session`; cookie never contains `SITE_PASSWORD`.
3. Session verification is stateless and makes no Neon lookup.
4. Curriculum JSON remains sole curriculum truth; Neon has no curriculum copy.
5. Evidence append-only; mastery/readiness derived.
6. LearningPosition derived, not persisted.
7. Candidate precedence is deterministic.
8. Pre-anchor NOT_STARTED objectives are not blanket gaps.
9. BLOCKED target cannot become LEARN.
10. reviewDue does not freeze forward learning.
11. WeeklyPlan/DailyLesson have no mutable execution status.
12. Execution is append-only events projected into state.
13. `PlanningRepository.createWeeklyPlan` atomically stores plan+lessons.
14. Memory and Neon adapters share repository behavior contracts.
15. Neon schema has no mutable mastery/readiness.
16. No startup/preview auto-migrate of production.
17. LessonPreparationContext contains only trusted facts.
18. Public TeachingPlannerService signature matches approved spec.
19. MiniMax adapter cannot choose lesson objective IDs or write evidence/mastery.
20. AI failure cannot corrupt deterministic plan.
21. Deferred Phase 4+ domains/infrastructure remain absent.
22. Vercel region explicitly `sin1`; Neon production Singapore.
23. Preview and production DB credentials separated.
24. Fresh test/typecheck/curriculum validation/lint/host build are green before PR.
25. Neon adapter is only called live-verified after optional integration contract passes against `TEST_DATABASE_URL`.

## Expected Commit Sequence

```text
feat: harden household session authentication
feat: define phase 3 planning contracts
feat: derive curriculum learning position
feat: select deterministic learning candidates
feat: generate deterministic weekly lesson plans
feat: add planning repository boundary
feat: add neon drizzle persistence adapters
feat: add teaching planner service and lesson context
feat: generate lesson briefs through minimax boundary
test: prove phase 3 teaching planner scenarios
```
