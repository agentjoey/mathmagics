# MathMagics Phase 7 — Progress + Adaptive Learning Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build deterministic four-layer progress projections and a lesson-boundary adaptive learning loop that can safely KEEP or supersede the next unstarted lesson, explain the decision to Parent/Tutor users, and preserve all Phase 1–6 authority boundaries.

**Architecture:** Add storage-agnostic `lib/progress`, `lib/strategy`, and `lib/adaptation` domains above existing canonical learning facts. Persist only append-only strategy facts and adopted adaptive decisions/supersessions; keep Coverage, Mastery, Performance, Strategy state and MistakePriority as deterministic projections. Weekly planning remains Phase 3 initial planning; Phase 7 adapts only the next effective PLANNED lesson at execution boundaries.

**Tech Stack:** Next.js 16.2.6, React 19, TypeScript, Vitest, Drizzle ORM, Neon PostgreSQL, existing signed-session auth, existing deterministic learning/planning/practice/correction domains.

**Spec:** `docs/superpowers/specs/2026-08-26-mathmagics-phase7-progress-adaptive-learning-design.md`

## Global Constraints

- Curriculum truth remains version-controlled and is never copied into mutable Postgres truth.
- `EvidenceRecord` remains append-only; Phase 2 `deriveMastery()` remains the only Mastery authority.
- `Readiness` remains deterministic; Phase 6 Mistake lifecycle/resolution remains deterministic and unchanged.
- One canonical `Attempt` ledger continues to serve `PRACTICE | HOMEWORK | CORRECTION`.
- Failed CORRECTION Attempts do not emit extra `incorrect` learning Evidence.
- `WeeklyPlan` and `DailyLesson` remain immutable snapshots; do not add mutable `superseded`, `replacedBy`, `adaptiveStatus` or correction-specific fields.
- Coverage, Mastery, Performance and Strategy remain independent; never persist or expose a combined learning score.
- Practice Performance uses only root `PRACTICE | HOMEWORK` Attempts in the intersection of the latest 7 days and latest 12 root Attempts.
- StrategyEvidence may only come from structured, server-observed interaction; a correct answer alone never proves strategy use.
- AI cannot derive Progress, StrategyEvidence, MistakePriority, candidate ranking, KEEP/SUPERSEDE, lesson intent or authoritative objective selection.
- Automatic CORRECTION decisions must bind a trusted unresolved canonical `mistakeId`.
- Ordinary CORRECTION/REVIEW cannot consume a third consecutive completed lesson when a safe READY forward candidate exists; only blocking Mistake/prerequisite gates may bypass.
- Same fact slice + same policy version must be replayable and deterministic.
- No Redis, queue, worker, vector DB, distributed lock, materialized progress cache, ML/BKT/IRT or LLM next-best-lesson engine.
- Live database contracts require explicit `TEST_DATABASE_URL`; never fall back to production `DATABASE_URL`.
- Generate and inspect `migrations/0004_*.sql`, but do not run `npm run db:migrate` against production during Phase 7 implementation.
- Final exact implementation HEAD must pass `npm test`, `npm run typecheck`, `npm run validate:curriculum`, `npm run lint`, `npm run build`, then `git status --short` must be clean.

---

## File Structure

```text
lib/progress/
  types.ts
  coverage.ts
  performance.ts
  service.ts
  parent-view.ts
  index.ts

lib/strategy/
  types.ts
  validation.ts
  projection.ts
  recorder.ts
  repository.ts
  memory-repository.ts
  index.ts

lib/adaptation/
  types.ts
  mistake-priority.ts
  progress-risk.ts
  candidates.ts
  policy.ts
  repository.ts
  memory-repository.ts
  effective-lesson.ts
  rationale.ts
  service.ts
  student-view.ts
  index.ts

lib/persistence/
  neon-strategy-repository.ts
  neon-adaptive-repository.ts
  schema.ts

app/api/progress/route.ts
app/api/learning/next/route.ts
app/api/learning/next/evaluate/route.ts
```

Existing repository extensions are deliberately narrow:

```text
lib/practice/repository.ts
lib/practice/memory-repository.ts
lib/persistence/neon-practice-repository.ts
  -> add listAttemptsForStudent(studentId)

lib/planning/memory-repository.ts
  -> add a concrete-class-only replacement insertion helper used by MemoryAdaptiveRepository;
     do not widen PlanningRepository's public write contract
```

New tests:

```text
tests/progress-coverage.test.ts
tests/progress-performance.test.ts
tests/progress-service.test.ts
tests/strategy-projection.test.ts
tests/strategy-recorder.test.ts
tests/strategy-repository.test.ts
tests/adaptation-mistake-priority.test.ts
tests/adaptation-policy.test.ts
tests/adaptation-starvation.test.ts
tests/adaptation-repository.test.ts
tests/adaptation-effective-lesson.test.ts
tests/adaptation-service.test.ts
tests/progress-parent-view.test.ts
tests/adaptation-views.test.ts
tests/adaptation-api-contracts.test.ts
tests/adaptation-e2e.test.ts
tests/persistence-phase7-schema.test.ts
tests/persistence-neon-phase7-contract.test.ts
```

---

### Task 1: Progress Domain — Coverage, Performance and Objective/Topic Projections

**Files:**
- Create: `lib/progress/types.ts`
- Create: `lib/progress/coverage.ts`
- Create: `lib/progress/performance.ts`
- Create: `lib/progress/service.ts`
- Create: `lib/progress/index.ts`
- Modify: `lib/practice/repository.ts`
- Modify: `lib/practice/memory-repository.ts`
- Modify: `lib/persistence/neon-practice-repository.ts`
- Test: `tests/progress-coverage.test.ts`
- Test: `tests/progress-performance.test.ts`
- Test: `tests/progress-service.test.ts`
- Modify Test: `tests/practice-repository.test.ts`

**Interfaces:**

```ts
export type CoverageState = 'NOT_SEEN' | 'INTRODUCED' | 'ENGAGED' | 'PRACTISED';
export type PerformanceState = 'INSUFFICIENT_DATA' | 'STRUGGLING' | 'UNSTABLE' | 'STABLE';

export interface PerformanceSnapshot {
  state: PerformanceState;
  attemptCount: number;
  correctRate: number;
  independentCorrectRate: number;
  hintRate: number;
  incorrectRate: number;
  recentIncorrectStreak: number;
  recurrenceCount: number;
  windowStart: string | null;
  windowEnd: string | null;
}

export interface ObjectiveProgress {
  studentId: string;
  objectiveId: string;
  coverage: CoverageState;
  mastery: MasterySnapshot;
  performance: PerformanceSnapshot;
  reviewDue: boolean;
  strategyIds: string[];
}

export interface TopicProgressSummary {
  objectiveCount: number;
  coverage: { notSeen: number; introduced: number; engaged: number; practised: number };
  mastery: { notStarted: number; introduced: number; developing: number; mastered: number };
  performance: { insufficientData: number; struggling: number; unstable: number; stable: number };
}

export interface PerformanceRiskFacts {
  recurrenceCount(studentId: string, objectiveId: string, cutoff: string): Promise<number>;
  hasBlockingMistake(studentId: string, objectiveId: string, cutoff: string): Promise<boolean>;
}
```

`lib/progress` consumes `PerformanceRiskFacts` by interface only and never imports `lib/adaptation`. Task 3 supplies the production adapter from deterministic correction facts. Task 1 tests use a fake implementation.

Add to `PracticeRepository` and both implementations:

```ts
listAttemptsForStudent(studentId: string): Promise<Attempt[]>;
```

It returns defensive clones sorted by `(submittedAt,id)` and does not filter source kind; `derivePerformance()` owns the root-source filter.

- [ ] **Step 1: Write Coverage RED tests**

Create `tests/progress-coverage.test.ts`:

```ts
expect(deriveCoverage({ objectiveId: OBJ, evidence: [], rootAttempts: [], completedLearnLessons: [] })).toBe('NOT_SEEN');
expect(deriveCoverage({ objectiveId: OBJ, evidence: [introduced], rootAttempts: [], completedLearnLessons: [] })).toBe('INTRODUCED');
expect(deriveCoverage({ objectiveId: OBJ, evidence: [], rootAttempts: [wrongPractice], completedLearnLessons: [] })).toBe('ENGAGED');
expect(deriveCoverage({ objectiveId: OBJ, evidence: [wrongEvidence], rootAttempts: [wrongPractice], completedLearnLessons: [] })).toBe('PRACTISED');
expect(deriveCoverage({ objectiveId: OBJ, evidence: [correctionEvidence], rootAttempts: [], completedLearnLessons: [] })).not.toBe('PRACTISED');
```

- [ ] **Step 2: Run Coverage RED, implement, then GREEN**

```bash
npx vitest run tests/progress-coverage.test.ts
```

Expected before implementation: FAIL. Implement root-source matching so `PRACTISED` requires Evidence whose `origin.refId` matches a root PRACTICE/HOMEWORK Attempt; completed LEARN can establish only INTRODUCED. Rerun and expect PASS.

- [ ] **Step 3: Write/implement PracticeRepository student query**

Extend `tests/practice-repository.test.ts` with mixed sources/students and assert ordered ids plus defensive clone behavior:

```ts
expect((await repository.listAttemptsForStudent('s1')).map((attempt) => attempt.id))
  .toEqual(['a-old', 'a-same-time-1', 'a-same-time-2', 'a-new']);
```

Memory filters/sorts/clones. Neon queries `attempts.studentId`, orders by submitted timestamp/id, and reuses `rowToAttempt()`.

```bash
npx vitest run tests/practice-repository.test.ts tests/persistence-neon-practice-contract.test.ts
```

Expected: PASS or explicit Neon skip when `TEST_DATABASE_URL` is absent.

- [ ] **Step 4: Write Performance RED tests**

Cover `<3 -> INSUFFICIENT_DATA`, independent rate `<0.50 -> STRUGGLING`, latest two incorrect -> STRUGGLING, recurrence+current incorrect -> STRUGGLING, exact STABLE gate, remaining sufficient sample -> UNSTABLE, CORRECTION exclusion, >7-day exclusion, latest-at-most-12, deterministic ties.

```ts
expect(derivePerformance({ attempts: stableFive, evaluatedAt: NOW, recurrenceCount: 0, hasBlockingMistake: false }).state)
  .toBe('STABLE');
expect(derivePerformance({ attempts: stableFive, evaluatedAt: NOW, recurrenceCount: 0, hasBlockingMistake: true }).state)
  .toBe('UNSTABLE');
```

- [ ] **Step 5: Implement Performance policy**

```ts
if (sample.length < 3) return 'INSUFFICIENT_DATA';
if (independentCorrectRate < 0.50 || recentIncorrectStreak >= 2 || (recurrenceCount >= 1 && hasCurrentIncorrect)) return 'STRUGGLING';
if (sample.length >= 5 && independentCorrectRate >= 0.80 && incorrectRate <= 0.20 && recentIncorrectStreak === 0 && !hasBlockingMistake) return 'STABLE';
return 'UNSTABLE';
```

Do not derive or alter Mastery.

- [ ] **Step 6: Write/implement ProgressService**

A fake `PerformanceRiskFacts` drives Task 1 tests. Prove `Mastery='DEVELOPING'` can coexist with `Performance='STABLE'`. Expose:

```ts
getObjectiveProgress(studentId: string, objectiveId: string, cutoff: string): Promise<ObjectiveProgress>;
getTopicProgress(studentId: string, topicId: string, cutoff: string): Promise<TopicProgressSummary>;
```

Load Evidence, student Attempts, completed LEARN execution facts, existing `getObjectiveMastery()`, curriculum `strategyIds`, and injected risk facts at/before cutoff.

- [ ] **Step 7: Run Task 1 GREEN + typecheck**

```bash
npx vitest run tests/progress-coverage.test.ts tests/progress-performance.test.ts tests/progress-service.test.ts tests/practice-repository.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit Task 1**

```bash
git add lib/progress lib/practice/repository.ts lib/practice/memory-repository.ts lib/persistence/neon-practice-repository.ts tests/progress-coverage.test.ts tests/progress-performance.test.ts tests/progress-service.test.ts tests/practice-repository.test.ts
git commit -m "feat: add deterministic progress projections"
```

---

### Task 2: Strategy Facts, Trusted Recorder and Cross-Topic Projection

**Files:**
- Create: `lib/strategy/types.ts`
- Create: `lib/strategy/validation.ts`
- Create: `lib/strategy/projection.ts`
- Create: `lib/strategy/recorder.ts`
- Create: `lib/strategy/repository.ts`
- Create: `lib/strategy/memory-repository.ts`
- Create: `lib/strategy/index.ts`
- Test: `tests/strategy-projection.test.ts`
- Test: `tests/strategy-recorder.test.ts`
- Test: `tests/strategy-repository.test.ts`

**Interfaces:**

```ts
export type StrategyInteractionType = 'PROMPTED' | 'INDEPENDENT_SELECTION' | 'INDEPENDENT_CONSTRUCTION' | 'TRANSFER_APPLICATION';
export type StrategyInteractionOutcome = 'VALID' | 'MISAPPLIED';
export type StrategyEvidenceType = 'PROMPTED_USE' | 'INDEPENDENT_USE' | 'INDEPENDENT_TRANSFER' | 'MISAPPLICATION';
export type StrategyProgressState = 'NOT_OBSERVED' | 'DEVELOPING' | 'RELIABLE';

export interface StrategyInteraction {
  id: string;
  studentId: string;
  objectiveId: string;
  strategyId: string;
  sourceKind: 'PRACTICE' | 'HOMEWORK' | 'CORRECTION' | 'LESSON';
  sourceRefId: string;
  interactionType: StrategyInteractionType;
  outcome: StrategyInteractionOutcome;
  observedAt: string;
  recordedAt: string;
}

export interface StrategyEvidence {
  id: string;
  studentId: string;
  strategyId: string;
  objectiveId: string;
  type: StrategyEvidenceType;
  interactionId: string;
  observedAt: string;
  recordedAt: string;
}

export interface StrategyRepository {
  appendInteraction(interaction: StrategyInteraction): Promise<void>;
  appendEvidence(evidence: StrategyEvidence): Promise<void>;
  getInteraction(id: string): Promise<StrategyInteraction | undefined>;
  getEvidenceByInteraction(interactionId: string): Promise<StrategyEvidence | undefined>;
  listInteractionsForStudent(studentId: string, cutoff: string): Promise<StrategyInteraction[]>;
  listEvidenceForStudent(studentId: string, cutoff: string): Promise<StrategyEvidence[]>;
}
```

Trusted recorder input is server-constructed, not a route body:

```ts
export interface RecordStrategyInteractionInput {
  interactionId: string;
  evidenceId: string;
  studentId: string;
  objectiveId: string;
  strategyId: string;
  sourceKind: StrategyInteraction['sourceKind'];
  sourceRefId: string;
  assistanceRevealed: boolean;
  interactionKind: 'SELECTION' | 'CONSTRUCTION' | 'TRANSFER';
  structurallyValid: boolean;
}
```

- [ ] **Step 1: Write Strategy projection RED tests**

Assert NOT_OBSERVED; prompted -> DEVELOPING; three independent uses on one objective -> DEVELOPING; >=3 qualifying independent evidence across >=2 objectives with >=1 transfer -> RELIABLE; later MISAPPLICATION -> DEVELOPING; full post-misapplication requalification -> RELIABLE.

- [ ] **Step 2: Implement validation/projection and run GREEN**

Sort `(observedAt,recordedAt,id)`. RELIABLE considers only qualifying evidence after latest MISAPPLICATION. Validate curriculum strategy/objective compatibility.

```bash
npx vitest run tests/strategy-projection.test.ts
```

Expected: PASS.

- [ ] **Step 3: Write recorder authority RED tests**

Prove a correct Attempt without structured interaction emits no StrategyEvidence. Trusted mapping must be:

```text
PROMPTED + VALID -> PROMPTED_USE
INDEPENDENT_SELECTION/CONSTRUCTION + VALID -> INDEPENDENT_USE
TRANSFER_APPLICATION + VALID -> INDEPENDENT_TRANSFER
qualifying invalid use -> MISAPPLICATION
```

- [ ] **Step 4: Implement deterministic recorder**

```ts
const interactionType = input.assistanceRevealed
  ? 'PROMPTED'
  : input.interactionKind === 'TRANSFER'
    ? 'TRANSFER_APPLICATION'
    : input.interactionKind === 'SELECTION'
      ? 'INDEPENDENT_SELECTION'
      : 'INDEPENDENT_CONSTRUCTION';

const evidenceType = !input.structurallyValid
  ? 'MISAPPLICATION'
  : interactionType === 'PROMPTED'
    ? 'PROMPTED_USE'
    : interactionType === 'TRANSFER_APPLICATION'
      ? 'INDEPENDENT_TRANSFER'
      : 'INDEPENDENT_USE';
```

Persist one evidence per interaction. Exact replay idempotent; conflicting id reuse throws.

- [ ] **Step 5: Write/implement memory repository contract**

Test defensive clones, ordering, cutoff filtering, duplicate replay/conflict, one evidence per interaction.

- [ ] **Step 6: Run Task 2 suite + typecheck**

```bash
npx vitest run tests/strategy-projection.test.ts tests/strategy-recorder.test.ts tests/strategy-repository.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add lib/strategy tests/strategy-projection.test.ts tests/strategy-recorder.test.ts tests/strategy-repository.test.ts
git commit -m "feat: add trusted strategy evidence"
```

---

### Task 3: MistakePriority, Production Performance Risk Adapter and Adaptive Candidate Policy

**Files:**
- Create: `lib/adaptation/types.ts`
- Create: `lib/adaptation/mistake-priority.ts`
- Create: `lib/adaptation/progress-risk.ts`
- Create: `lib/adaptation/candidates.ts`
- Create: `lib/adaptation/policy.ts`
- Create: `lib/adaptation/index.ts`
- Modify: `lib/correction/index.ts` only if an existing projector/repository type is not exported
- Modify: `lib/planning/index.ts` only if an existing readiness/curriculum helper is not exported
- Test: `tests/adaptation-mistake-priority.test.ts`
- Test: `tests/adaptation-policy.test.ts`
- Test: `tests/adaptation-starvation.test.ts`
- Modify Test: `tests/progress-service.test.ts`

**Interfaces:**

```ts
export type MistakePriority = 'LOW' | 'NORMAL' | 'BLOCKING';
export type AdaptiveRationaleCode =
  | 'BLOCKING_MISTAKE'
  | 'RECURRENT_MISTAKE'
  | 'PREREQUISITE_GAP'
  | 'URGENT_REVIEW'
  | 'REVIEW_DUE'
  | 'PERFORMANCE_STRUGGLING'
  | 'STRATEGY_DEVELOPMENT_NEEDED'
  | 'CURRENT_OBJECTIVE_NOT_MASTERED'
  | 'NEXT_OBJECTIVE_READY'
  | 'STARVATION_GUARD_FORWARD_PROGRESS'
  | 'NO_HIGHER_PRIORITY_NEED'
  | 'SOURCE_LESSON_ALREADY_STARTED'
  | 'REPLACEMENT_LESSON_IMMUTABLE';
```

- [ ] **Step 1: Write/implement MistakePriority**

RED fixtures:

```ts
expect(deriveMistakePriority(pendingUnknown)).toBe('LOW');
expect(deriveMistakePriority(confirmedUnresolved)).toBe('NORMAL');
expect(deriveMistakePriority(confirmedDirectPrerequisite)).toBe('BLOCKING');
expect(deriveMistakePriority(recurrentConfirmedTarget)).toBe('BLOCKING');
expect(deriveMistakePriority(masteredThenRecurrentRegression)).toBe('BLOCKING');
```

Use existing Phase 6 projection/events and curriculum prerequisites. No stored priority.

- [ ] **Step 2: Implement production `PerformanceRiskFacts` adapter**

`lib/adaptation/progress-risk.ts` loads canonical Mistake episodes/events at/before cutoff, derives recurrence count and `deriveMistakePriority()`, and implements Task 1's interface. `lib/progress` never imports this adapter. Extend `tests/progress-service.test.ts` to prove a blocking recurrence prevents STABLE while identical Attempts without blocking facts are STABLE.

- [ ] **Step 3: Write candidate/ranking RED tests**

Cover exact order:

```text
BLOCKING_CORRECTION > PREREQUISITE_SUPPORT > NORMAL_CORRECTION > REVIEW > CURRENT_POSITION > NEXT_IN_SEQUENCE
```

Performance may select/retain PRACTICE but cannot change Mastery. Strategy only adds `STRATEGY_DEVELOPMENT_NEEDED`/structured practice preference.

- [ ] **Step 4: Implement candidate construction with exact intents**

```text
PREREQUISITE_SUPPORT:
  NOT_STARTED/INTRODUCED -> LEARN
  DEVELOPING -> PRACTICE
  MASTERED + reviewDue -> REVIEW

CURRENT_POSITION:
  NOT_STARTED/INTRODUCED -> LEARN
  DEVELOPING -> PRACTICE

NEXT_IN_SEQUENCE:
  next NOT_STARTED/INTRODUCED + READY -> LEARN
  next DEVELOPING + READY -> PRACTICE
  next MASTERED -> skip to next non-mastered objective
```

- [ ] **Step 5: Implement exact material supersession matrix**

LEARN + NORMAL_CORRECTION supersedes only when starvation guard does not require forward learning, Mistake objective is the same primary objective or a direct prerequisite, and Mistake is CONFIRMED/unresolved. PRACTICE/REVIEW + NORMAL_CORRECTION may supersede. LEARN + NORMAL_REVIEW keeps. PRACTICE + NORMAL_REVIEW keeps unless source objective is MASTERED with urgent review.

- [ ] **Step 6: Write/implement starvation guard**

Two effective COMPLETED remediation lessons + NORMAL correction + READY forward candidate -> forward with `STARVATION_GUARD_FORWARD_PROGRESS`. Same history + BLOCKING Mistake -> CORRECTION bypasses. Count only effective COMPLETED.

- [ ] **Step 7: Run Task 3 suite + typecheck**

```bash
npx vitest run tests/adaptation-mistake-priority.test.ts tests/adaptation-policy.test.ts tests/adaptation-starvation.test.ts tests/progress-service.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit Task 3**

```bash
git add lib/adaptation lib/correction/index.ts lib/planning/index.ts tests/adaptation-mistake-priority.test.ts tests/adaptation-policy.test.ts tests/adaptation-starvation.test.ts tests/progress-service.test.ts
git commit -m "feat: add adaptive lesson policy"
```

---

### Task 4: Adaptive Persistence, Neon Repositories and Effective Lesson Projection

**Files:**
- Create: `lib/adaptation/repository.ts`
- Create: `lib/adaptation/memory-repository.ts`
- Create: `lib/adaptation/effective-lesson.ts`
- Modify: `lib/adaptation/types.ts`
- Modify: `lib/planning/memory-repository.ts`
- Modify: `lib/persistence/schema.ts`
- Create: `lib/persistence/neon-strategy-repository.ts`
- Create: `lib/persistence/neon-adaptive-repository.ts`
- Test: `tests/adaptation-repository.test.ts`
- Test: `tests/adaptation-effective-lesson.test.ts`
- Create: `tests/persistence-phase7-schema.test.ts`
- Create: `tests/persistence-neon-phase7-contract.test.ts`

**Interfaces:**

```ts
export interface AdaptiveDecision {
  id: string;
  studentId: string;
  sourceLessonId: string;
  action: 'KEEP' | 'SUPERSEDE';
  selectedIntent: LessonIntent;
  selectedObjectiveIds: string[];
  targetMistakeId?: string;
  rationaleCodes: AdaptiveRationaleCode[];
  policyVersion: 'adaptive-policy-v1';
  evaluatedAt: string;
  inputFactCutoff: string;
  createdAt: string;
}

export interface LessonSupersession {
  id: string;
  studentId: string;
  sourceLessonId: string;
  replacementLessonId: string;
  adaptiveDecisionId: string;
  createdAt: string;
}

export interface AdaptiveRepository {
  getDecisionByEvaluationKey(studentId: string, sourceLessonId: string, inputFactCutoff: string, policyVersion: string): Promise<AdaptiveDecision | undefined>;
  listDecisionsForSourceLesson(sourceLessonId: string): Promise<AdaptiveDecision[]>;
  appendKeepDecision(decision: AdaptiveDecision): Promise<void>;
  commitSupersession(input: { decision: AdaptiveDecision; replacementLesson: DailyLesson; supersession: LessonSupersession }): Promise<void>;
  getSupersessionForSourceLesson(sourceLessonId: string): Promise<LessonSupersession | undefined>;
  getSupersessionByReplacementLesson(replacementLessonId: string): Promise<LessonSupersession | undefined>;
}
```

- [ ] **Step 1: Write/implement memory repository RED/GREEN**

Prove multiple KEEP cutoffs, exact-key idempotency, conflicting reuse failure, one source/replacement/decision per supersession, defensive clones. Add a concrete-class-only helper to `MemoryPlanningRepository` so `MemoryAdaptiveRepository` can stage a replacement into the same lesson store inside `commitSupersession()` without widening `PlanningRepository`.

- [ ] **Step 2: Write/implement EffectiveLesson projection**

```ts
expect(await resolveEffectiveLesson(original)).toEqual({ lesson: original, originalLessonId: original.id, adapted: false });
expect((await resolveEffectiveLesson(originalAfterSupersede)).lesson.id).toBe(replacement.id);
expect((await resolveEffectiveLesson(replacement)).originalLessonId).toBe(original.id);
```

Replacement may not become a later supersession source. Missing source/replacement is a data-integrity error.

- [ ] **Step 3: Write Phase 7 schema RED test**

Add exactly four tables to schema target:

```text
strategy_interactions
strategy_evidence
adaptive_decisions
lesson_supersessions
```

Required uniqueness:

```text
strategy_evidence.interaction_id UNIQUE
adaptive_decisions(student_id, source_lesson_id, input_fact_cutoff, policy_version) UNIQUE
lesson_supersessions.source_lesson_id UNIQUE
lesson_supersessions.replacement_lesson_id UNIQUE
lesson_supersessions.adaptive_decision_id UNIQUE
```

Test forbidden mutable identifiers are absent.

- [ ] **Step 4: Implement Drizzle schema**

Follow existing id/timestamp/FK conventions. Keep arrays JSON-compatible only where existing conventions support it and validate enum members at repository boundary. CORRECTION requires `targetMistakeId`; non-CORRECTION forbids it. Do not run migration generation in this task.

- [ ] **Step 5: Write/implement Neon StrategyRepository contract**

Guard with explicit `TEST_DATABASE_URL`; otherwise intentional skip. Test append, exact replay, conflicting ids, one evidence per interaction, cutoff ordering and round-trip.

- [ ] **Step 6: Write/implement Neon AdaptiveRepository transaction contract**

`commitSupersession()` must use one Drizzle transaction inserting replacement into existing `daily_lessons` plus adaptive decision + supersession. Inject a deterministic unique conflict and prove no partial attempted decision/replacement remains. Exact identical unique race may reload as replay; mismatched state throws.

- [ ] **Step 7: Run Task 4 suite + typecheck**

```bash
npx vitest run tests/adaptation-repository.test.ts tests/adaptation-effective-lesson.test.ts tests/persistence-phase7-schema.test.ts tests/persistence-neon-phase7-contract.test.ts tests/planning-repository.test.ts
npm run typecheck
```

Expected: PASS; live Neon contract may intentionally skip only without explicit test DB.

- [ ] **Step 8: Commit Task 4**

```bash
git add lib/adaptation lib/planning/memory-repository.ts lib/persistence/schema.ts lib/persistence/neon-strategy-repository.ts lib/persistence/neon-adaptive-repository.ts tests/adaptation-repository.test.ts tests/adaptation-effective-lesson.test.ts tests/persistence-phase7-schema.test.ts tests/persistence-neon-phase7-contract.test.ts
git commit -m "feat: add adaptive persistence"
```

---

### Task 5: AdaptiveLearningService — Lesson Boundary, Replay and Concurrency

**Files:**
- Create: `lib/adaptation/service.ts`
- Modify: `lib/adaptation/index.ts`
- Test: `tests/adaptation-service.test.ts`
- Create: `tests/adaptation-e2e.test.ts`

**Interfaces:**

```ts
export interface AdaptiveServiceDependencies {
  learningRepository: LearningStateRepository;
  practiceRepository: PracticeRepository;
  planningRepository: PlanningRepository;
  mistakeRepository: MistakeRepository;
  strategyRepository: StrategyRepository;
  adaptiveRepository: AdaptiveRepository;
  performanceRiskFacts: PerformanceRiskFacts;
  clock: { now(): string };
  ids: {
    decisionId(sourceLessonId: string, cutoff: string): string;
    replacementLessonId(sourceLessonId: string, cutoff: string): string;
    supersessionId(sourceLessonId: string): string;
  };
}

export interface AdaptiveEvaluationResult {
  decision: AdaptiveDecision;
  effectiveLesson: EffectiveLesson;
}

export class AdaptiveLearningService {
  evaluateLesson(sourceLessonId: string, studentId: string): Promise<AdaptiveEvaluationResult>;
  evaluateNextPlannedLesson(studentId: string): Promise<AdaptiveEvaluationResult | null>;
}
```

- [ ] **Step 1: Write lesson-state RED tests**

Cover PLANNED/no material need -> KEEP; PLANNED/BLOCKING Mistake -> SUPERSEDE CORRECTION; STARTED -> KEEP `SOURCE_LESSON_ALREADY_STARTED`; completed/skipped source -> next not-started lesson; replacement -> immutable response.

- [ ] **Step 2: Implement service flow**

```text
resolve source/effective lesson
verify student ownership
return existing supersession when source frozen
reject replacement-as-source
inspect execution state
obtain one trusted now/cutoff
return exact existing same-key decision if present
load facts <= cutoff
derive Progress + MistakePriority + candidates
apply starvation/material policy
persist KEEP or atomic SUPERSEDE
return effective lesson + decision
```

Cutoff fields: Evidence `observedAt`; Attempt `submittedAt`; MistakeEvent `occurredAt`; StrategyEvidence `observedAt`; LessonExecutionEvent `occurredAt`.

- [ ] **Step 3: Implement next-PLANNED resolution**

Load weekly plans/lessons, project effective lesson, derive execution state, choose earliest `(weekStart,sequence,createdAt,id)` effective PLANNED lesson. Completed/skipped is never replacement target.

- [ ] **Step 4: Write replay/cutoff tests**

Same key returns original decision. KEEP at T1 can become SUPERSEDE at T2 only with new facts and still-PLANNED source. T1 replay cannot see T2 Evidence/MistakeEvent.

- [ ] **Step 5: Write concurrency test**

Two same-key evaluations via `Promise.all()` leave one decision and, for SUPERSEDE, one replacement/supersession. Unique conflict reloads only identical state.

- [ ] **Step 6: Run Task 5 suite + typecheck**

```bash
npx vitest run tests/adaptation-service.test.ts tests/adaptation-e2e.test.ts tests/adaptation-starvation.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit Task 5**

```bash
git add lib/adaptation/service.ts lib/adaptation/index.ts tests/adaptation-service.test.ts tests/adaptation-e2e.test.ts
git commit -m "feat: orchestrate lesson-boundary adaptation"
```

---

### Task 6: Parent/Tutor Progress View, Student View and API Contracts

**Files:**
- Create: `lib/progress/parent-view.ts`
- Create: `lib/adaptation/rationale.ts`
- Create: `lib/adaptation/student-view.ts`
- Modify: `lib/progress/index.ts`
- Modify: `lib/adaptation/index.ts`
- Create: `app/api/progress/route.ts`
- Create: `app/api/learning/next/route.ts`
- Create: `app/api/learning/next/evaluate/route.ts`
- Test: `tests/progress-parent-view.test.ts`
- Test: `tests/adaptation-views.test.ts`
- Test: `tests/adaptation-api-contracts.test.ts`

**Interfaces:**

```ts
export interface ParentProgressView {
  studentId: string;
  levelId: StudentLevel;
  evaluatedAt: string;
  summary: ProgressSummary;
  topics: TopicProgressView[];
  strategies: StrategyProgressView[];
  mistakes: ParentMistakeGroups;
  nextLesson: NextLessonView | null;
}

export interface NextLessonView {
  lessonId: string;
  intent: LessonIntent;
  objectiveIds: string[];
  adapted: boolean;
  originalLessonId?: string;
  rationale: ParentAdaptiveRationale[];
  targetMistakeId?: string;
}

export interface StudentNextLessonView {
  lessonId: string;
  intent: LessonIntent;
  objectiveSummary: string;
  adapted: boolean;
}
```

V1 endpoints use household session auth plus explicit student selector:

```text
GET  /api/progress?studentId=s1
GET  /api/learning/next?studentId=s1
POST /api/learning/next/evaluate?studentId=s1
```

Server verifies `learningRepository.getStudent(studentId)` exists in the V1 single-household boundary. POST body is absent/empty; no objective/intent/state authority fields are accepted.

- [ ] **Step 1: Write/implement Parent view**

Prove `PRACTISED + DEVELOPING + STRUGGLING` remains independent; `MASTERED + reviewDue + STRUGGLING` remains expressible; RELIABLE strategy exposes factual counts; BLOCKING recurrence appears in attention/next lesson. Serialized view must not contain combined score, AnswerSpec, solution outline, raw Attempt/MistakeEvent payload or AI rationale.

- [ ] **Step 2: Implement closed rationale mapping**

Export a complete `Record<AdaptiveRationaleCode,{title:string;explanation:string}>`. Example:

```ts
BLOCKING_MISTAKE: {
  title: '需要先解决一个关键错误',
  explanation: '这个尚未解决的问题可能影响接下来的学习。',
},
```

Test map keys equal the closed rationale-code fixture list. No runtime AI rewrite.

- [ ] **Step 3: Write/implement Student view**

Expose lesson identity, intent, objective summary and adapted flag. Do not expose independent-correct rate, MistakePriority, policyVersion or raw rationale codes.

- [ ] **Step 4: Write API contract RED tests**

Verify signed-session rejection, missing/unknown student rejection, GET projections, and POST reevaluation. Non-empty POST authority fields such as `intent`, `objectiveId`, `priority`, `mastery`, `rationale`, `evaluatedAt`, `inputFactCutoff` are rejected.

- [ ] **Step 5: Implement thin routes**

Reuse `SESSION_COOKIE_NAME` / `verifySessionToken()`. Instantiate existing Neon learning/planning/practice/correction repositories plus Task 4 `NeonStrategyRepository`/`NeonAdaptiveRepository`; build the deterministic services and verify student. Keep all policy outside route handlers.

- [ ] **Step 6: Run Task 6 suite + typecheck**

```bash
npx vitest run tests/progress-parent-view.test.ts tests/adaptation-views.test.ts tests/adaptation-api-contracts.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit Task 6**

```bash
git add lib/progress/parent-view.ts lib/progress/index.ts lib/adaptation/rationale.ts lib/adaptation/student-view.ts lib/adaptation/index.ts app/api/progress app/api/learning tests/progress-parent-view.test.ts tests/adaptation-views.test.ts tests/adaptation-api-contracts.test.ts
git commit -m "feat: expose adaptive progress views"
```

---

### Task 7: Migration 0004, Full-loop E2E, Authority Audit and Closeout

**Files:**
- Create: generated `migrations/0004_*.sql`
- Create: generated `migrations/meta/0004_snapshot.json`
- Modify: `migrations/meta/_journal.json`
- Modify: `tests/adaptation-e2e.test.ts`
- Modify: `.agent/BACKLOG.md`
- Modify: `.agent/CURRENT.md`

- [ ] **Step 1: Generate migration 0004**

```bash
npm run db:generate
```

Expected: generated `0004_<name>.sql`, snapshot and journal update. If controlled sandbox cannot spawn Drizzle because of known bootstrap/environment limitations, classify it as infrastructure and run this exact generation command once on approved Host task worktree. Never run production migration here.

- [ ] **Step 2: Inspect migration**

Confirm exactly four Phase 7 table creations plus required FK/index work:

```text
strategy_interactions
strategy_evidence
adaptive_decisions
lesson_supersessions
```

Confirm no mutable `progress_state`, `strategy_mastery_state`, `performance_score`, `current_recommendation`, mutable lesson replacement field, or second Attempt/lesson ledger. Compute generated migration SHA for closeout.

```bash
npx vitest run tests/persistence-phase7-schema.test.ts tests/persistence-neon-phase7-contract.test.ts
```

Expected: schema PASS; Neon contract PASS with explicit test DB or intentional skip only.

- [ ] **Step 3: Extend full-loop E2E**

Add one cross-Phase story:

```text
learn objective
-> root PRACTICE Attempt/Evidence
-> derive Coverage/Mastery/Performance
-> structured StrategyInteraction -> StrategyEvidence
-> Mistake observed/resolved
-> later recurrence creates new episode
-> MistakePriority becomes BLOCKING
-> next PLANNED lesson superseded by CORRECTION
-> AdaptiveDecision records targetMistakeId/policy/cutoff/rationale
-> correction completes
-> next boundary restores forward learning when no blocking gate remains
-> ParentProgressView explains progress, recurrence and adaptation
```

Include two-remediation starvation and replacement-chain prohibition through the real service path.

- [ ] **Step 4: Run all Phase 7 targeted tests**

```bash
npx vitest run \
  tests/progress-coverage.test.ts \
  tests/progress-performance.test.ts \
  tests/progress-service.test.ts \
  tests/strategy-projection.test.ts \
  tests/strategy-recorder.test.ts \
  tests/strategy-repository.test.ts \
  tests/adaptation-mistake-priority.test.ts \
  tests/adaptation-policy.test.ts \
  tests/adaptation-starvation.test.ts \
  tests/adaptation-repository.test.ts \
  tests/adaptation-effective-lesson.test.ts \
  tests/adaptation-service.test.ts \
  tests/progress-parent-view.test.ts \
  tests/adaptation-views.test.ts \
  tests/adaptation-api-contracts.test.ts \
  tests/adaptation-e2e.test.ts \
  tests/persistence-phase7-schema.test.ts \
  tests/persistence-neon-phase7-contract.test.ts
```

Expected: all non-live tests PASS; Neon contract PASS with explicit test DB or intentional skip only.

- [ ] **Step 5: Static authority audit**

```bash
rg "setCoverageState|setPerformanceState|setStrategyState|setMistakePriority|setNextBestLesson|updateAdaptiveDecision|updateLessonSupersession" lib app
rg "overallScore|learningScore|performance_score|strategy_mastery_state|current_recommendation" lib app
rg "Minimax|provider|CorrectionTeachingProvider" lib/adaptation lib/progress lib/strategy
```

Expected: no production mutable setters/combined score/AI-provider dependency in authority domains.

Re-run existing authority-sensitive suites:

```bash
npx vitest run tests/learning-mastery-policy.test.ts tests/correction-projection.test.ts tests/correction-e2e.test.ts tests/practice-attempt-source.test.ts tests/planning-weekly-plan.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run full verification before closeout commit**

```bash
npm test
npm run typecheck
npm run validate:curriculum
npm run lint
npm run build
git status --short
```

Expected: five commands exit 0. Status is expected to contain only intended Task 7 migration/E2E/closeout changes because Task 7 is not committed yet; any unrelated file fails the gate. Environment/bootstrap failure is reported as environment failure, not product PASS.

- [ ] **Step 7: Update closeout docs**

`.agent/BACKLOG.md`: Phase 7 complete only after Step 6 passes; Phase 8 becomes next. `.agent/CURRENT.md`: record implementation candidate HEAD/base, four progress dimensions/thresholds, `adaptive-policy-v1`, starvation guard, Strategy authority, four new tables, generated 0004 filename/SHA, exact verification outputs, no production migration/deploy, Phase 8 next. Preserve unresolved activation gates.

- [ ] **Step 8: Commit Task 7**

```bash
git add migrations tests/adaptation-e2e.test.ts .agent/BACKLOG.md .agent/CURRENT.md
git commit -m "feat: complete Phase 7 adaptive learning loop"
```

- [ ] **Step 9: Re-run exact-HEAD verification after commit**

```bash
npm test
npm run typecheck
npm run validate:curriculum
npm run lint
npm run build
git status --short
git rev-parse HEAD
```

Expected: exact committed HEAD passes all five gates and `git status --short` is empty. Use this SHA for PR/merge closeout. Do not apply production migration or deploy without a separate explicit Human Owner gate.

---

## Review Gates

After every Task 1–7 commit:

1. Review the task diff against this plan and the approved spec.
2. Confirm no authority boundary was weakened to make tests easier.
3. Confirm task-specific RED was observed before GREEN and targeted tests/typecheck pass afterward.
4. Keep commits task-scoped; do not mix dependency upgrades, unrelated refactoring or dashboard redesign.
5. If the existing repository makes a defined interface impossible without changing an approved contract, stop that slice, document the concrete incompatibility, and revise the plan/spec before implementing around it.

## Final Scope Audit

The completed implementation must contain:

```text
Coverage projection
+ unchanged Mastery authority
+ recent Performance projection
+ trusted Strategy interaction/evidence/projection
+ deterministic MistakePriority
+ deterministic candidate ranking/starvation guard
+ append-only AdaptiveDecision/LessonSupersession
+ immutable replacement DailyLesson
+ lesson-boundary AdaptiveLearningService
+ minimal Parent/Tutor + Student views/API
+ exactly four Phase 7 durable tables
+ migration 0004 generated/reviewed but not applied to production
```

It must not add dashboard redesign, reports/trends/heatmaps, notifications, manual lesson overrides, multi-household RBAC, adaptive difficulty/IRT/BKT/ML prediction, LLM next-best-lesson selection, materialized progress snapshots, Redis/queues/workers/distributed locks, production migration or deployment.
