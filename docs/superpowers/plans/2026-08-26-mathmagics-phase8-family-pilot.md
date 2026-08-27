# MathMagics Phase 8 Family Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare, activate, and run a real multi-week single-household MathMagics pilot that exercises the Phase 1–7 learning loop, records replayable evidence from existing canonical facts, and ends with an evidence-backed Phase 9 decision.

**Architecture:** Keep the existing Next.js 16 + Neon Singapore monolith and Phase 1–7 authority model. Add only a safe non-production activation harness, a read-only pilot review composition layer, and a minimal authenticated Pilot Shell that delegates to existing planning/practice/homework/correction/adaptation services. Do not create a second learning truth, generic analytics platform, or new pilot persistence schema.

**Tech Stack:** Next.js 16.2.6, React 19.2.4, TypeScript 5, Vitest 4.1.6, Drizzle ORM/Kit, Neon PostgreSQL, MiniMax provider adapters, Vercel `sin1`.

**Spec:** `docs/superpowers/specs/2026-08-26-mathmagics-phase8-family-pilot-design.md`

## Global Constraints

- Single household only; no tenancy, school/class model, RBAC expansion, or generalized identity.
- Existing immutable/append-only facts remain authoritative: `Attempt`, `EvidenceRecord`, `Mistake`/`MistakeEvent`, `StrategyInteraction`/`StrategyEvidence`, `LessonExecutionEvent`, `AdaptiveDecision`, `LessonSupersession`.
- Coverage, Mastery, Performance, and Strategy remain separate deterministic projections; no aggregate learning score.
- No durable pilot-event/analytics table unless an accepted pilot question is proven impossible to reconstruct from existing facts and a new design is approved.
- Qualitative family notes remain outside the product database; committed evidence is de-identified.
- `TEST_DATABASE_URL` is the sole live integration-test database input. Tests/migration helpers never fall back to `DATABASE_URL`.
- Preview/non-production Neon and Production Neon use distinct writable credentials/databases or branches in Singapore.
- Production migration/deployment requires an explicit Human Gate after non-production migration/contracts and full verification pass.
- Initial pilot adaptation policy stays `adaptive-policy-v1` unless a tested defect requires a versioned policy change.
- No broad redesign, streaks, rankings, gamification, notification system, generic analytics, or report automation.
- Production behavior changes follow RED → minimal GREEN → targeted verification → full regression verification → commit.
- Final code HEADs pass `npm test`, `npm run typecheck`, `npm run validate:curriculum`, `npm run lint`, and `npm run build`.

---

### Task 1: P8-0 Phase 7 Exact-HEAD Release Closure

**Files:**
- Modify: `.agent/CURRENT.md`
- Modify: `.agent/BACKLOG.md`

**Interfaces:**
- Consumes: canonical Phase 7 merge SHA `61fb3e16485d645692c69a527db2d1f2ba36fa96`.
- Produces: exact-HEAD verification evidence and roadmap state with Phase 7 closed / Phase 8 active.

- [ ] **Step 1: Verify the exact canonical Phase 7 merge SHA**

```bash
git status --short
git rev-parse HEAD
```

Expected at the Phase 7 release checkout:

```text
<clean status>
61fb3e16485d645692c69a527db2d1f2ba36fa96
```

If canonical `main` has advanced only by Phase 8 planning docs, verify `61fb3e1...` in an isolated checkout or controlled host verifier. Do not relabel a later SHA as the Phase 7 exact-HEAD gate.

- [ ] **Step 2: Run the complete release gate on that SHA**

```bash
npm test
npm run typecheck
npm run validate:curriculum
npm run lint
npm run build
git status --short
```

Expected: all commands PASS; live Neon suites are explicit skips without `TEST_DATABASE_URL`; curriculum validation reports 25 nodes / 68 objectives / 18 textbook mappings; final status is clean.

- [ ] **Step 3: Record the verified evidence**

Update `.agent/CURRENT.md` with the exact SHA, command outcomes, and the statement that P8-0 performed no production migration/deploy. Update `.agent/BACKLOG.md` by marking Phase 7 exact-HEAD verification complete and making Phase 8 active while leaving Neon activation gates open.

- [ ] **Step 4: Review and commit**

```bash
git diff -- .agent/CURRENT.md .agent/BACKLOG.md
git add .agent/CURRENT.md .agent/BACKLOG.md
git commit -m "docs: close Phase 7 release gate"
```

Expected: documentation-only change.

---

### Task 2: Safe Non-Production Neon Migration and Contract Harness

**Files:**
- Create: `scripts/pilot-database-guard.ts`
- Create: `scripts/migrate-test-database.ts`
- Create: `scripts/verify-pilot-neon.ts`
- Create: `tests/pilot-database-guard.test.ts`
- Modify: `package.json`
- Modify: `docs/deployment.md`

**Interfaces:**
- Produces: `requireNonProductionDatabase(env: PilotDatabaseEnvironment): string`.
- Produces: `npm run db:migrate:test`.
- Produces: `npm run verify:pilot-neon`.

- [ ] **Step 1: Write the RED guard test**

```ts
import { describe, expect, it } from 'vitest';
import { requireNonProductionDatabase } from '@/scripts/pilot-database-guard';

describe('pilot database guard', () => {
  it('requires explicit TEST_DATABASE_URL', () => {
    expect(() => requireNonProductionDatabase({})).toThrow('TEST_DATABASE_URL is required');
  });

  it('rejects a test url equal to production', () => {
    const url = 'postgresql://same.example/db';
    expect(() => requireNonProductionDatabase({ TEST_DATABASE_URL: url, DATABASE_URL: url }))
      .toThrow('TEST_DATABASE_URL must not equal DATABASE_URL');
  });

  it('returns an isolated explicit test url', () => {
    expect(requireNonProductionDatabase({
      TEST_DATABASE_URL: 'postgresql://test.example/db',
      DATABASE_URL: 'postgresql://prod.example/db',
    })).toBe('postgresql://test.example/db');
  });
});
```

- [ ] **Step 2: Verify RED**

```bash
npx vitest run tests/pilot-database-guard.test.ts
```

Expected: FAIL because the guard module does not exist.

- [ ] **Step 3: Implement the guard**

```ts
export interface PilotDatabaseEnvironment {
  TEST_DATABASE_URL?: string;
  DATABASE_URL?: string;
}

export function requireNonProductionDatabase(env: PilotDatabaseEnvironment): string {
  const testUrl = env.TEST_DATABASE_URL?.trim();
  if (!testUrl) throw new Error('TEST_DATABASE_URL is required');
  const productionUrl = env.DATABASE_URL?.trim();
  if (productionUrl && productionUrl === testUrl) {
    throw new Error('TEST_DATABASE_URL must not equal DATABASE_URL');
  }
  return testUrl;
}
```

- [ ] **Step 4: Verify GREEN**

```bash
npx vitest run tests/pilot-database-guard.test.ts
```

Expected: PASS.

- [ ] **Step 5: Implement the safe migration runner**

`scripts/migrate-test-database.ts`:

```ts
import { spawnSync } from 'node:child_process';
import { requireNonProductionDatabase } from './pilot-database-guard';

const testUrl = requireNonProductionDatabase(process.env);
const result = spawnSync('npm', ['run', 'db:migrate'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: testUrl },
  shell: false,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
```

- [ ] **Step 6: Implement the contract runner**

`scripts/verify-pilot-neon.ts`:

```ts
import { spawnSync } from 'node:child_process';
import { requireNonProductionDatabase } from './pilot-database-guard';

requireNonProductionDatabase(process.env);
const files = [
  'tests/persistence-neon-contract.test.ts',
  'tests/persistence-neon-practice-contract.test.ts',
  'tests/persistence-neon-homework-contract.test.ts',
  'tests/persistence-neon-correction-contract.test.ts',
  'tests/persistence-neon-phase7-contract.test.ts',
  'tests/pilot-neon-full-loop.test.ts',
];
const result = spawnSync('npx', ['vitest', 'run', ...files], {
  stdio: 'inherit',
  env: process.env,
  shell: false,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
```

- [ ] **Step 7: Add package scripts and deployment docs**

Add without removing existing scripts:

```json
"db:migrate:test": "tsx scripts/migrate-test-database.ts",
"verify:pilot-neon": "tsx scripts/verify-pilot-neon.ts"
```

Document this exact non-production sequence:

```bash
TEST_DATABASE_URL='<non-production-neon-url>' npm run db:migrate:test
TEST_DATABASE_URL='<non-production-neon-url>' npm run verify:pilot-neon
```

- [ ] **Step 8: Verify and commit**

```bash
npx vitest run tests/pilot-database-guard.test.ts
npm run typecheck
npm run lint
git add scripts/pilot-database-guard.ts scripts/migrate-test-database.ts scripts/verify-pilot-neon.ts tests/pilot-database-guard.test.ts package.json docs/deployment.md
git commit -m "feat: add safe pilot database verification harness"
```

---

### Task 3: P8-2 Read-Only Pilot Review Projection

**Files:**
- Create: `lib/pilot/types.ts`
- Create: `lib/pilot/review.ts`
- Create: `lib/pilot/index.ts`
- Create: `tests/pilot-review.test.ts`
- Create: `app/api/pilot/review/route.ts`
- Create: `tests/pilot-review-api.test.ts`

**Interfaces:**
- Consumes: `ParentProgressService`, `PlanningRepository`, `AdaptiveRepository`, `deriveLessonExecutionState`.
- Produces: `PilotReviewService.getReview(studentId: string, evaluatedAt: string): Promise<PilotReview>`.
- Produces: authenticated read-only `GET /api/pilot/review?studentId=<id>`.

- [ ] **Step 1: Define exact read-model types using existing unions**

```ts
import type {
  AdaptiveDecisionAction,
  AdaptiveRationaleCode,
  NextLessonView,
} from '@/lib/adaptation';
import type { ParentProgressView } from '@/lib/progress';
import type { DailyLessonExecutionState, LessonIntent } from '@/lib/planning';

export interface PilotLessonReview {
  lessonId: string;
  weekStart: string;
  sequence: number;
  intent: LessonIntent;
  objectiveIds: string[];
  execution: DailyLessonExecutionState;
  adapted: boolean;
}

export interface PilotAdaptiveReview {
  decisionId: string;
  sourceLessonId: string;
  action: AdaptiveDecisionAction;
  policyVersion: 'adaptive-policy-v1';
  inputFactCutoff: string;
  rationaleCodes: AdaptiveRationaleCode[];
  createdAt: string;
}

export interface PilotReview {
  studentId: string;
  evaluatedAt: string;
  progress: ParentProgressView;
  lessons: PilotLessonReview[];
  recentAdaptiveDecisions: PilotAdaptiveReview[];
  nextLesson: NextLessonView | null;
}
```

- [ ] **Step 2: Write RED historical-cutoff tests**

Use memory repositories. Seed a plan, lesson events and adaptive decisions both before and after the cutoff. Assert:

```ts
const review = await service.getReview('pilot-student', '2026-08-26T10:00:00.000Z');
expect(review.progress.evaluatedAt).toBe(review.evaluatedAt);
expect(review.lessons.find((lesson) => lesson.lessonId === 'lesson-1')?.execution.status).toBe('COMPLETED');
expect(review.lessons.some((lesson) => lesson.lessonId === 'future-created-lesson')).toBe(false);
expect(review.recentAdaptiveDecisions.every((decision) => decision.createdAt <= review.evaluatedAt)).toBe(true);
```

Also assert serialized output contains none of `answerSpec`, `solutionOutline`, raw Attempt payloads, provider-private reasoning, or mutation functions.

- [ ] **Step 3: Verify RED**

```bash
npx vitest run tests/pilot-review.test.ts
```

Expected: FAIL because `PilotReviewService` does not exist.

- [ ] **Step 4: Implement deterministic read composition**

`PilotReviewService.getReview()` performs these exact operations in order:

1. validate `evaluatedAt` as ISO date-time;
2. call `ParentProgressService.getView(studentId, evaluatedAt)`;
3. list student weekly plans whose `createdAt <= evaluatedAt`;
4. list each plan's lessons whose `createdAt <= evaluatedAt`;
5. derive each lesson execution from events whose `occurredAt <= evaluatedAt`;
6. mark replacement lessons adapted only when a supersession exists with `createdAt <= evaluatedAt`;
7. collect decisions for included source lessons whose `createdAt <= evaluatedAt`;
8. sort lessons by `weekStart`, `sequence`, `lessonId` and decisions by `createdAt`, `decisionId`;
9. set `nextLesson` from the existing parent progress projection;
10. return structured-cloned read data only.

The service exposes no repository writes.

- [ ] **Step 5: Verify GREEN**

```bash
npx vitest run tests/pilot-review.test.ts
```

Expected: PASS.

- [ ] **Step 6: Add the read-only API contract and route**

Use the existing handler-factory style from `app/api/progress/route.ts`. Tests cover 401 unauthenticated, 400 missing student, 404 unknown student, 200 exact review payload, and absence of POST/PUT/PATCH/DELETE exports.

```ts
export interface PilotReviewGetDependencies {
  sessionSecret(): string | undefined;
  now(): string;
  studentExists(studentId: string): Promise<boolean>;
  getReview(studentId: string, evaluatedAt: string): Promise<PilotReview>;
}
```

Production `GET` constructs existing repositories/services plus `PilotReviewService`; it does not reimplement progress logic.

- [ ] **Step 7: Verify and commit**

```bash
npx vitest run tests/pilot-review.test.ts tests/pilot-review-api.test.ts
npm run typecheck
npm run lint
git add lib/pilot app/api/pilot/review tests/pilot-review.test.ts tests/pilot-review-api.test.ts
git commit -m "feat: add read-only family pilot review"
```

---

### Task 4: P8-3 Minimal Lesson Execution and Practice Commands

**Files:**
- Create: `lib/pilot/session.ts`
- Create: `tests/pilot-session.test.ts`
- Create: `app/api/pilot/lesson/route.ts`
- Create: `app/api/pilot/practice/route.ts`
- Create: `tests/pilot-session-api.test.ts`

**Interfaces:**
- Consumes: `PlanningRepository`, `AdaptiveRepository`, `PracticeService`, `findNextEffectiveLesson`, `deriveLessonExecutionState`.
- Produces: `PilotSessionService` orchestration only; all grading/Evidence/Mistake authority stays in existing services.

- [ ] **Step 1: Write RED transition and authority tests**

```ts
const started = await service.startNextLesson(STUDENT, at(1));
expect(started.execution.status).toBe('STARTED');
await expect(service.startNextLesson(STUDENT, at(2))).resolves.toMatchObject({ lessonId: started.lessonId });
await expect(service.completeLesson(STUDENT, started.lessonId, 30, at(3)))
  .resolves.toMatchObject({ status: 'COMPLETED' });
await expect(service.completeLesson(STUDENT, started.lessonId, 30, at(4))).rejects.toThrow();
await expect(service.startNextLesson('other-student', at(5))).rejects.toThrow();
```

Practice tests prove the pilot layer never accepts authoritative `outcome`, `answerSpec`, `hintUsed`, Mastery, or Evidence.

- [ ] **Step 2: Verify RED**

```bash
npx vitest run tests/pilot-session.test.ts
```

- [ ] **Step 3: Implement `PilotSessionService`**

```ts
export interface PilotSessionDependencies {
  planning: PlanningRepository;
  adaptive: AdaptiveRepository;
  practice: PracticeService;
  clock: { now(): string };
  ids: {
    executionEventId(
      lessonId: string,
      type: 'STARTED' | 'COMPLETED' | 'SKIPPED',
      at: string,
    ): string;
  };
}
```

`startNextLesson()` resolves the trusted effective lesson, verifies student ownership, derives current state, returns an existing STARTED state idempotently, otherwise appends one STARTED event. `completeLesson()` and `skipLesson()` verify ownership and valid state transitions before appending immutable events. Practice methods perform ownership checks and delegate unchanged to `PracticeService.createPracticeSession`, `revealHint`, and `submitAttempt`.

- [ ] **Step 4: Verify GREEN**

```bash
npx vitest run tests/pilot-session.test.ts
```

- [ ] **Step 5: Add narrow command APIs**

Lesson request union:

```ts
type LessonCommand =
  | { command: 'START'; studentId: string }
  | { command: 'COMPLETE'; studentId: string; lessonId: string; actualMinutes: number }
  | { command: 'SKIP'; studentId: string; lessonId: string; actualMinutes?: number };
```

Practice request union:

```ts
type PracticeCommand =
  | { command: 'CREATE_SESSION'; studentId: string; lessonId: string; objectiveId: string }
  | { command: 'REVEAL_HINT'; studentId: string; sessionId: string; itemId: string }
  | { command: 'SUBMIT_ATTEMPT'; studentId: string; attemptId: string; sessionId: string; itemId: string; answerText: string; retryOfAttemptId?: string };
```

Reject unknown top-level keys. API tests cover auth, ownership, allowed commands, and rejection of client authority fields.

- [ ] **Step 6: Verify and commit**

```bash
npx vitest run tests/pilot-session.test.ts tests/pilot-session-api.test.ts
npm run typecheck
npm run lint
git add lib/pilot/session.ts app/api/pilot/lesson app/api/pilot/practice tests/pilot-session.test.ts tests/pilot-session-api.test.ts
git commit -m "feat: expose minimal pilot lesson and practice commands"
```

---

### Task 5: P8-3 Homework and Correction Commands

**Files:**
- Create: `lib/pilot/homework-correction.ts`
- Create: `app/api/pilot/homework/route.ts`
- Create: `app/api/pilot/correction/route.ts`
- Create: `tests/pilot-homework-correction.test.ts`
- Create: `tests/pilot-homework-correction-api.test.ts`

**Interfaces:**
- Consumes: `HomeworkServiceImpl`, `CorrectionServiceImpl`, `CorrectionAttemptObserver`.
- Produces: authenticated zero-authority transport/orchestration wrappers.

- [ ] **Step 1: Write RED end-to-end wrapper tests with deterministic fake providers**

Exercise:

```text
homework bytes
→ submitHomework
→ ambiguous/low-confidence problem cannot grade
→ parent confirmation
→ gradeHomeworkProblem
→ incorrect HOMEWORK Attempt
→ CorrectionAttemptObserver
→ canonical open Mistake
→ existing correction reasoning/transfer gate
```

Unit tests use deterministic fake HomeworkVision/Correction providers and never call a live model.

- [ ] **Step 2: Verify RED**

```bash
npx vitest run tests/pilot-homework-correction.test.ts
```

- [ ] **Step 3: Implement the zero-authority wrapper**

The wrapper validates student ownership and transport bounds, then delegates to existing service methods. It must not copy `gradeAnswer`, confidence thresholds, objective mapping, diagnosis policy, Mistake projection, or resolution policy into `lib/pilot`.

- [ ] **Step 4: Verify GREEN**

```bash
npx vitest run tests/pilot-homework-correction.test.ts
```

- [ ] **Step 5: Add authenticated APIs**

Homework upload computes SHA-256 server-side and constructs:

```ts
{
  submissionId: stableServerGeneratedId,
  studentId: trustedStudentId,
  bytes,
  mimeType,
  sha256: serverComputedSha256,
}
```

Correction API exposes only existing correction command inputs. Reject payloads attempting to assert `diagnosis`, `mistakeState`, `resolved`, `evidence`, `outcome`, or `mastery`.

- [ ] **Step 6: Verify and commit**

```bash
npx vitest run tests/pilot-homework-correction.test.ts tests/pilot-homework-correction-api.test.ts
npm run typecheck
npm run lint
git add lib/pilot/homework-correction.ts app/api/pilot/homework app/api/pilot/correction tests/pilot-homework-correction.test.ts tests/pilot-homework-correction-api.test.ts
git commit -m "feat: expose trusted homework and correction pilot flows"
```

---

### Task 6: P8-3 Minimal Authenticated Family Pilot Shell

**Files:**
- Create: `app/pilot/page.tsx`
- Create: `app/pilot/student/page.tsx`
- Create: `app/pilot/parent/page.tsx`
- Create: `components/pilot/PilotStudentClient.tsx`
- Create: `components/pilot/PilotParentClient.tsx`
- Create: `components/pilot/ProgressDimensionCard.tsx`
- Create: `tests/pilot-ui-copy.test.ts`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes existing next/progress APIs plus Tasks 3–5 pilot APIs.
- Produces one student daily-loop surface and one parent/tutor state/rationale surface.

- [ ] **Step 1: Write RED semantic/copy tests**

The pilot UI must contain distinct labels:

```text
学习覆盖
知识掌握
近期表现
解题策略
```

and must not contain aggregate/gamification labels:

```text
总分
综合能力分
综合掌握率
排名
连续打卡
```

Tests also require parent-facing unresolved-mistake and next-lesson-rationale copy.

- [ ] **Step 2: Verify RED**

```bash
npx vitest run tests/pilot-ui-copy.test.ts
```

- [ ] **Step 3: Implement `/pilot` entry**

Expose only two primary routes:

```text
学生学习
家长查看
```

- [ ] **Step 4: Implement student daily loop**

Render current next lesson, Start, intent-appropriate activity, Complete/Skip, practice question/hint/answer/retry, homework upload, correction flow only when a canonical correction projection exists, and a final “接下来” refresh. Never render answer keys, `AnswerSpec`, raw solution outlines, provider-private reasoning, Mastery setters, or adaptive ranking.

- [ ] **Step 5: Implement parent/tutor view**

Render these five questions from `/api/pilot/review`:

```text
今天学了什么？
哪些内容已经掌握？
哪些内容最近还不稳定？
哪些错误仍需要订正？
下一步学什么，为什么？
```

Use separate cards for Coverage/Mastery/Performance/Strategy. Present `NextLessonView.rationale[].title/explanation` rather than raw policy codes as the primary explanation.

- [ ] **Step 6: Make `/pilot` the bounded V1 entry without deleting legacy fixtures**

Modify `app/page.tsx` to prominently link to `/pilot`. Keep Q05/Q18 reachable only as a clearly labeled legacy/demo section if regression fixtures still require them.

- [ ] **Step 7: Verify and commit**

```bash
npx vitest run tests/pilot-ui-copy.test.ts tests/adaptation-views.test.ts tests/correction-views.test.ts
npm run typecheck
npm run lint
npm run build
git add app/pilot components/pilot app/page.tsx tests/pilot-ui-copy.test.ts
git commit -m "feat: add minimal family pilot shell"
```

---

### Task 7: P8-1 Non-Production Full-Loop Verification and Production Human Gate

**Files:**
- Create: `tests/pilot-neon-full-loop.test.ts`
- Modify: `docs/operations.md`
- Modify: `.agent/CURRENT.md`
- Modify: `.agent/BACKLOG.md`

**Interfaces:**
- Consumes: explicit migrated `TEST_DATABASE_URL`, Tasks 2–6 candidate code, existing Neon repositories/services.
- Produces: a cleanup-safe Neon full-loop contract and the evidence package for production approval.

- [ ] **Step 1: Write the live Neon full-loop test**

Instantiate:

```ts
const db = createNeonDatabase(TEST_DATABASE_URL);
const learning = new NeonLearningStateRepository(db);
const planning = new NeonPlanningRepository(db);
const practice = new NeonPracticeRepository(db);
const homework = new NeonHomeworkRepository(db);
const mistakes = new NeonMistakeRepository(db);
const strategy = new NeonStrategyRepository(db);
const adaptive = new NeonAdaptiveRepository(db);
```

Use `randomUUID()` suffixes for every durable id and deterministic fake AI providers. Exercise:

```text
student/current position
→ weekly plan + lesson execution
→ root practice Attempt + Evidence
→ incorrect Attempt → Mistake
→ correction + transfer resolution
→ recurrence
→ StrategyEvidence
→ adaptive evaluation
→ ParentProgressView
→ PilotReview historical replay
```

Cleanup only rows belonging to the unique test student, in foreign-key-safe delete order; never truncate shared tables.

- [ ] **Step 2: Prove RED on an unmigrated disposable Neon database**

```bash
TEST_DATABASE_URL='<fresh-non-production-url>' npx vitest run tests/pilot-neon-full-loop.test.ts
```

Expected: FAIL because required tables do not exist.

- [ ] **Step 3: Apply committed migrations only to that non-production database**

```bash
TEST_DATABASE_URL='<fresh-non-production-url>' npm run db:migrate:test
```

- [ ] **Step 4: Run all Neon contracts**

```bash
TEST_DATABASE_URL='<fresh-non-production-url>' npm run verify:pilot-neon
```

Expected: all listed suites PASS with zero integration skips.

- [ ] **Step 5: Run complete candidate verification**

```bash
npm test
npm run typecheck
npm run validate:curriculum
npm run lint
npm run build
git status --short
```

Expected: PASS and clean.

- [ ] **Step 6: Record operations/run evidence**

Update `docs/operations.md` with pilot health checks and P0/P1/P2/P3 incident response. Update `.agent/CURRENT.md` with candidate SHA, non-production environment name only, migration/contract/full-verification results, and explicit “Production not migrated/deployed”. Keep Production activation unchecked in `.agent/BACKLOG.md`.

- [ ] **Step 7: Commit pre-production evidence**

```bash
git add tests/pilot-neon-full-loop.test.ts docs/operations.md .agent/CURRENT.md .agent/BACKLOG.md
git commit -m "test: verify Phase 8 pilot candidate on Neon"
```

- [ ] **Step 8: HUMAN GATE — Production migration/deployment**

Present exact candidate SHA, non-production migration result, all Neon contract results, full verification results, and the exact production action sequence. Do not migrate/deploy Production before explicit approval.

- [ ] **Step 9: After approval, perform exact reviewed production actions**

```text
1. Confirm Production DATABASE_URL differs from TEST_DATABASE_URL.
2. Apply committed migrations 0000–0004 through the approved production mechanism.
3. Deploy the exact reviewed application SHA to Vercel sin1.
4. Smoke-check auth, progress, next lesson, pilot review.
5. Run one known-safe pilot-student read path before real learning writes.
6. Record deployed SHA and smoke result without credentials.
```

P0 conditions stop the pilot; do not patch canonical learning facts manually.

---

### Task 8: P8-4 Multi-Week Pilot Protocol and Evidence Closeout

**Files:**
- Create: `docs/pilot/family-pilot-runbook.md`
- Create: `docs/pilot/family-pilot-weekly-review-template.md`
- Create after real use: `docs/pilot/family-pilot-evidence-report.md`
- Modify after real use: `.agent/CURRENT.md`
- Modify after real use: `.agent/BACKLOG.md`

**Interfaces:**
- Consumes: production Pilot Shell, canonical projections, private Human Owner qualitative journal.
- Produces: de-identified evidence report with one primary `KEEP | FIX | ADJUST POLICY | EXPAND CURRICULUM | EXPAND PRODUCT | MORE EVIDENCE` recommendation.

- [ ] **Step 1: Create the daily pilot runbook**

Use this exact session sequence:

```text
1. Confirm deployed SHA/policy version.
2. Student follows the Pilot Shell next lesson.
3. Parent records major friction/comprehension notes privately.
4. Read PilotReview at session end.
5. Classify incidents P0/P1/P2/P3.
6. Do not change policy from one anecdote.
```

Do not manufacture wrong answers, recurrence, or supersession to satisfy coverage.

- [ ] **Step 2: Create the weekly review template**

```markdown
# Family Pilot Weekly Review

- Pilot week:
- Application SHA:
- Adaptation policy version:
- Real learning days:
- Completed / skipped sessions:

## Coverage
## Mastery
## Performance
## Strategy
## Mistakes / correction / recurrence
## Adaptive KEEP / SUPERSEDE decisions
## Parent understanding of rationale
## Student friction / abandonment
## Product incidents
## Manual interventions
## Classification
- Product defect:
- Curriculum/content gap:
- Expected learner difficulty:
- Family preference:
- Operator/deployment issue:
```

No synthetic learning score.

- [ ] **Step 3: Run the real pilot over multiple weeks**

A few demonstration sessions are insufficient. Continue until repeated ordinary use provides evidence for the approved questions. Do not claim validation for correction/recurrence/supersession if those paths never occur naturally.

- [ ] **Step 4: Preserve release boundaries during the pilot**

For every change record:

```text
old SHA / policy version
change reason
new SHA / policy version
verification evidence
first real session on new release
```

A material policy change splits evidence into before/after windows.

- [ ] **Step 5: Create the final de-identified evidence report**

Include pilot window, SHA/policy versions, real learning days, loop paths observed, separate Coverage/Mastery/Performance/Strategy findings, Mistake/correction/recurrence outcomes, adaptive findings, family comprehension, friction, incidents, interventions, unresolved uncertainties, and recommendation classification per material finding. Exclude child/household names, raw homework images, private journal text, credentials, and unnecessary PII.

- [ ] **Step 6: Select one primary Phase 9 path**

```text
KEEP
FIX
ADJUST POLICY
EXPAND CURRICULUM
EXPAND PRODUCT
MORE EVIDENCE
```

The primary next bottleneck must be evidence-backed; a secondary follow-up may be recorded.

- [ ] **Step 7: Close Phase 8 only when the approved acceptance criteria are actually met**

Update `.agent/CURRENT.md` and `.agent/BACKLOG.md` only after the report exists. If evidence is insufficient, leave Phase 8 open as `MORE EVIDENCE` rather than closing because time passed.

- [ ] **Step 8: Commit the evidence closeout**

```bash
git add docs/pilot/family-pilot-runbook.md docs/pilot/family-pilot-weekly-review-template.md docs/pilot/family-pilot-evidence-report.md .agent/CURRENT.md .agent/BACKLOG.md
git commit -m "docs: close Phase 8 family pilot with evidence"
```

---

## Plan Self-Review

### Spec coverage

- P8-0 exact release closure → Task 1.
- Non-production isolation/migration/contracts → Tasks 2 and 7.
- Read-only pilot evidence composition → Task 3.
- Student lesson/practice flow → Task 4.
- Homework/correction flow → Task 5.
- Parent/student Pilot Shell → Task 6.
- Production Human Gate → Task 7 Step 8.
- Multi-week evidence, incidents, change control, de-identification, Phase 9 decision → Task 8.
- No new schema is planned. If an accepted pilot question cannot be reconstructed from existing facts, stop and return to design review before generating `0005`.

### Placeholder scan

The plan contains no unfinished implementation placeholders. Every new public interface is named and typed; every operational gate has an exact command sequence or exact required evidence.

### Type consistency

- Pilot adaptive reviews reuse `AdaptiveDecisionAction` and `AdaptiveRationaleCode`; they do not invent a second action/rationale union.
- `PilotReviewService` is read-only.
- `PilotSessionService` delegates grading/Evidence/Mistake authority to existing services.
- `TEST_DATABASE_URL` remains the sole live-test database authority.
- Parent/student UI consumes existing view contracts and does not introduce mutable learning state.

## Execution Order and Review Boundaries

Execute Tasks 1–6 with normal TDD and one reviewable commit per task. Task 7 is the pre-production integration gate and stops at the explicit Production Human Gate. Task 8 begins only after production smoke verification and necessarily spans real household use; its evidence report cannot be truthfully generated before those observations exist.
