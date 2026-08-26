# MathMagics Phase 7 — Progress + Adaptive Learning Loop Design

**Date:** 2026-08-26

**Status:** Approved design, ready for implementation planning after Human Owner spec review

## 1. Purpose

Phase 7 closes the product loop from trusted learning facts back into future teaching decisions:

```text
Plan → Learn → Practice → Correct → Track → Adapt → next Learn
```

The phase adds four independent progress projections, deterministic next-best-lesson policy, controlled lesson supersession at lesson boundaries, and a minimal Parent/Tutor progress view. It must preserve the authority boundaries established by Phases 1–6: curriculum truth is version-controlled, Attempts and learning Evidence are canonical append-only facts, Mastery and Readiness remain deterministic projections, Mistake resolution remains Phase 6 code-owned logic, and AI does not decide learning facts or adaptation.

Phase 7 is intentionally small for the V1 single-household product. It does not add a general adaptive engine, mutable progress scores, background workers, Redis, or ML/LLM-driven lesson selection.

## 2. Locked product decisions

1. **Controlled execution-time adaptation.** WeeklyPlan and DailyLesson remain immutable snapshots. At the boundary before the next not-started lesson, deterministic policy may KEEP the current plan or create a superseding immutable DailyLesson.
2. **Four independent progress dimensions.** Curriculum Coverage, Knowledge Mastery, Practice Performance, and cross-topic Strategy Progress stay separate. No overall learning score is created.
3. **Priority policy with starvation guard.** Default priority is correction/prerequisite/review/current/next, but ordinary remediation cannot consume more than two consecutive completed lessons when safe forward learning is available.
4. **Strategy facts are explicit.** StrategyEvidence is append-only and may only come from structured, server-observed student interaction. A correct answer alone never proves strategy use.
5. **Performance uses a dual-bound window.** The sample is the intersection of the last seven days and the latest twelve root PRACTICE/HOMEWORK Attempts.
6. **Coverage is evidence-backed.** Coverage expresses exposure and engagement, not mastery.
7. **Adopted adaptive decisions are durable audit facts.** AdaptiveDecision is append-only and records policy version, fact cutoff, rationale, and selected lesson.
8. **Reevaluation happens only at lesson boundaries.** A STARTED lesson is immutable. COMPLETED/SKIPPED lessons may trigger evaluation of the next not-started effective lesson.
9. **Mistake priority is deterministic.** LOW/NORMAL/BLOCKING is derived from trusted Mistake/curriculum facts; AI cannot set severity.
10. **Minimal Parent/Tutor progress surface is Phase 7 scope.** Full analytics/dashboard work remains out of scope.

## 3. Architecture

### 3.1 Layering

Use two new storage-agnostic domains:

```text
Canonical facts
├─ EvidenceRecord
├─ Attempt
├─ LessonExecutionEvent
├─ Mistake / MistakeEvent
└─ StrategyInteraction / StrategyEvidence
        │
        ▼
lib/progress
├─ Coverage
├─ existing Mastery
├─ Performance
└─ Strategy Progress
        │
        ▼
lib/adaptation
├─ MistakePriority
├─ AdaptiveCandidates
├─ starvation guard
└─ deterministic selection
        │
        ▼
AdaptiveDecision
├─ KEEP
└─ SUPERSEDE
     └─ immutable DailyLesson + LessonSupersession
```

`lib/progress` answers only “what is the student’s current learning state?” `lib/adaptation` answers only “given that state and the current plan, should the next lesson remain or be replaced?” Existing planning code continues to create valid DailyLesson snapshots and does not become responsible for learning-state inference.

Dependencies flow upward only. Learning, practice, correction and curriculum domains must not depend on adaptation.

### 3.2 Authority boundaries

AI may prepare teaching wording, strategy explanation and Phase 6 correction guidance. AI may not:

- derive Coverage, Performance, Strategy state or MistakePriority;
- emit StrategyEvidence;
- rank adaptive candidates;
- choose KEEP/SUPERSEDE;
- choose lesson intent or authoritative objective;
- set Mastery/Readiness/Mistake state;
- weaken Phase 6 resolution gates.

Clients may submit structured interaction inputs, but may not submit authoritative mastery, strategy outcome, priority, rationale, lesson intent or objective selection.

## 4. Four-layer Progress model

### 4.1 Coverage

```ts
export type CoverageState = 'NOT_SEEN' | 'INTRODUCED' | 'ENGAGED' | 'PRACTISED';
```

Project the highest state supported by trusted facts:

- `NOT_SEEN`: no qualifying lesson/evidence/root-attempt fact for the objective.
- `INTRODUCED`: `introduced` Evidence exists, or a completed LEARN lesson contained the objective.
- `ENGAGED`: at least one root PRACTICE or HOMEWORK Attempt exists for the objective.
- `PRACTISED`: at least one root PRACTICE/HOMEWORK Attempt exists and canonical learning Evidence was produced for that same root attempt. Incorrect Evidence still counts because Coverage measures engagement, not success.

CORRECTION-only activity cannot promote a never-taught objective directly to `PRACTISED`.

### 4.2 Mastery

Phase 7 reuses the Phase 2 `deriveMastery()` policy unchanged:

```text
NOT_STARTED | INTRODUCED | DEVELOPING | MASTERED
```

Phase 7 may consume `state`, `reviewDue`, `evidenceCount`, and `lastEvidenceAt`, but may not introduce a competing mastery percentage, confidence score or adaptive override.

### 4.3 Practice Performance

```ts
export type PerformanceState =
  | 'INSUFFICIENT_DATA'
  | 'STRUGGLING'
  | 'UNSTABLE'
  | 'STABLE';
```

Input sample:

```text
root source = PRACTICE | HOMEWORK
AND observedAt >= evaluatedAt - 7 days
AND among those facts keep the latest at most 12 Attempts
```

CORRECTION Attempts are excluded from root performance. `recurrenceCount` counts resolved-then-recurred Mistake episodes for the same objective with recurrence facts at or before the evaluation cutoff.

```ts
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
```

V1 thresholds:

- `INSUFFICIENT_DATA`: `attemptCount < 3`.
- `STRUGGLING`: `attemptCount >= 3` and at least one of:
  - `independentCorrectRate < 0.50`;
  - `recentIncorrectStreak >= 2`;
  - `recurrenceCount >= 1` and the window contains a current incorrect root attempt.
- `STABLE`: all of:
  - `attemptCount >= 5`;
  - `independentCorrectRate >= 0.80`;
  - `incorrectRate <= 0.20`;
  - `recentIncorrectStreak === 0`;
  - no unresolved BLOCKING Mistake for the objective at the evaluation cutoff.
- `UNSTABLE`: sufficient sample exists but neither STRUGGLING nor STABLE applies.

Performance is a recent-condition projection. It may influence practice intent/rationale but cannot directly change Mastery.

### 4.4 Strategy Progress

Strategy facts are independent from objective Evidence.

```ts
export type StrategyEvidenceType =
  | 'PROMPTED_USE'
  | 'INDEPENDENT_USE'
  | 'INDEPENDENT_TRANSFER'
  | 'MISAPPLICATION';

export type StrategyProgressState =
  | 'NOT_OBSERVED'
  | 'DEVELOPING'
  | 'RELIABLE';
```

Projection:

- `NOT_OBSERVED`: no StrategyEvidence.
- `DEVELOPING`: at least one StrategyEvidence exists, but RELIABLE is not satisfied.
- `RELIABLE`: considering qualifying evidence after the latest `MISAPPLICATION` (or all evidence if none exists), all must hold:
  - at least 3 `INDEPENDENT_USE | INDEPENDENT_TRANSFER` facts;
  - those facts cover at least 2 different objectives;
  - at least 1 is `INDEPENDENT_TRANSFER`.

A later `MISAPPLICATION` resets RELIABLE qualification. The student must re-accumulate the full RELIABLE gate after that failure. This is intentionally strict and deterministic.

A correct answer cannot produce StrategyEvidence. Only a structured, server-observed strategy interaction can do so.

## 5. Strategy interaction authority

```ts
export type StrategyInteractionType =
  | 'PROMPTED'
  | 'INDEPENDENT_SELECTION'
  | 'INDEPENDENT_CONSTRUCTION'
  | 'TRANSFER_APPLICATION';

export type StrategyInteractionOutcome = 'VALID' | 'MISAPPLIED';
```

The server resolves `studentId`, `objectiveId`, `strategyId`, source identity, hint/assistance state, interaction type and outcome from trusted UI/session/problem context. The client does not send `independent: true` or a StrategyEvidence type.

Deterministic mapping examples:

```text
PROMPTED + VALID                  → PROMPTED_USE
INDEPENDENT_SELECTION + VALID     → INDEPENDENT_USE
INDEPENDENT_CONSTRUCTION + VALID  → INDEPENDENT_USE
TRANSFER_APPLICATION + VALID      → INDEPENDENT_TRANSFER
qualifying structured invalid use → MISAPPLICATION
```

`objectiveId` and `strategyId` must be valid curriculum identities and the interaction must be compatible with trusted problem/activity structure. Unsupported or ambiguous structures fail closed and emit no positive StrategyEvidence.

## 6. MistakePriority

```ts
export type MistakePriority = 'LOW' | 'NORMAL' | 'BLOCKING';
```

Priority is a projection, never a mutable field.

- `LOW`: OBSERVED/pending-confirmation episode, UNKNOWN/generic unproven diagnosis, or no trusted evidence that the episode blocks forward learning.
- `NORMAL`: confirmed unresolved Mistake that does not meet BLOCKING rules.
- `BLOCKING`: any trusted condition below:
  - the confirmed diagnosis is relevant to a prerequisite needed by the current/next target;
  - the same confirmed diagnosis target has recurred after a resolved episode;
  - a previously MASTERED objective has recurrence regression.

AI rationale never changes priority.

## 7. Adaptive candidates and deterministic policy

### 7.1 Candidate model

```ts
export interface AdaptiveCandidate {
  objectiveId: string;
  intent: 'CORRECTION' | 'REVIEW' | 'LEARN' | 'PRACTICE';
  reason:
    | 'BLOCKING_MISTAKE'
    | 'UNRESOLVED_MISTAKE'
    | 'PREREQUISITE_GAP'
    | 'REVIEW_DUE'
    | 'PERFORMANCE_STRUGGLING'
    | 'CURRENT_OBJECTIVE'
    | 'NEXT_READY_OBJECTIVE';
  priorityClass: 'MANDATORY' | 'HIGH' | 'NORMAL';
  targetObjectiveId?: string;
  targetMistakeId?: string;
}
```

Default ordering:

```text
BLOCKING_CORRECTION
> PREREQUISITE_SUPPORT
> NORMAL_CORRECTION
> REVIEW
> CURRENT_POSITION
> NEXT_IN_SEQUENCE
```

No weighted aggregate score is used.

### 7.2 Candidate rules

**BLOCKING_CORRECTION**

An unresolved BLOCKING Mistake produces a MANDATORY CORRECTION candidate bound to the canonical `mistakeId`. It may supersede LEARN/PRACTICE/REVIEW and may bypass the starvation guard.

**PREREQUISITE_SUPPORT**

If the planned/forward target is NEEDS_SUPPORT or BLOCKED because a concrete prerequisite is not mastered, the prerequisite becomes the candidate. Intent is:

```text
NOT_STARTED / INTRODUCED → LEARN
DEVELOPING               → PRACTICE
MASTERED + reviewDue     → REVIEW
```

**NORMAL_CORRECTION**

A confirmed unresolved NORMAL Mistake produces CORRECTION. It may supersede PRACTICE/REVIEW. For a planned LEARN lesson, NORMAL_CORRECTION may supersede only when all are true:

1. the starvation guard does not require forward learning;
2. the Mistake objective is the same as the planned lesson’s primary objective, or is a direct curriculum prerequisite of that primary objective; and
3. the Mistake is CONFIRMED and unresolved at the cutoff.

Otherwise the LEARN lesson is kept and the Mistake remains available for a later boundary.

**REVIEW**

MASTERED + `reviewDue` produces REVIEW. Recent incorrect/recurrence facts make it urgent, but REVIEW stays below prerequisite support and correction priority. If Performance is STABLE and there is no recent regression, a normal review must not repeatedly displace forward learning.

**CURRENT_POSITION**

For the current curriculum anchor:

```text
NOT_STARTED / INTRODUCED          → LEARN
DEVELOPING + any PerformanceState → PRACTICE
```

STABLE Performance does not imply MASTERED.

**NEXT_IN_SEQUENCE**

Only when the current anchor is MASTERED and the next curriculum objective is READY. V1 intent is normally LEARN.

### 7.3 Strategy influence

Strategy is a modifier, not an independent curriculum authority. If an objective requires a strategy that is NOT_OBSERVED/DEVELOPING, the policy may keep/select structured PRACTICE and add `STRATEGY_DEVELOPMENT_NEEDED`. It must not invent a standalone strategy curriculum lesson.

### 7.4 Starvation guard

`remediationIntent = CORRECTION | REVIEW`.

Look only at actual `COMPLETED` effective lessons. SKIPPED, PLANNED and superseded originals do not count. If the two most recent completed lessons are both remediation, and:

- no BLOCKING Mistake exists;
- no blocking prerequisite exists; and
- a READY forward candidate exists;

then ordinary remediation candidates are demoted and the next lesson must return to CURRENT_POSITION or NEXT_IN_SEQUENCE.

Only BLOCKING_MISTAKE and BLOCKED_PREREQUISITE conditions may bypass this guard. NORMAL correction, reviewDue and Performance STRUGGLING may not.

### 7.5 Material supersession

A new candidate does not replace a planned lesson merely because it ranks slightly higher. V1 material rules are:

| Source | Candidate | Action |
| --- | --- | --- |
| LEARN/PRACTICE/REVIEW | BLOCKING_CORRECTION | SUPERSEDE → CORRECTION |
| LEARN | PREREQUISITE_SUPPORT | SUPERSEDE → prerequisite lesson |
| PRACTICE/REVIEW | NORMAL_CORRECTION | SUPERSEDE → CORRECTION |
| LEARN | NORMAL_CORRECTION | SUPERSEDE only under the exact three conditions in §7.2; otherwise KEEP |
| LEARN | NORMAL_REVIEW | KEEP |
| PRACTICE | NORMAL_REVIEW | KEEP unless the source objective is already MASTERED and reviewDue is urgent |
| any | no materially better candidate | KEEP |

### 7.6 Rationale codes

V1 code-owned enum:

```text
BLOCKING_MISTAKE
RECURRENT_MISTAKE
PREREQUISITE_GAP
URGENT_REVIEW
REVIEW_DUE
PERFORMANCE_STRUGGLING
STRATEGY_DEVELOPMENT_NEEDED
CURRENT_OBJECTIVE_NOT_MASTERED
NEXT_OBJECTIVE_READY
STARVATION_GUARD_FORWARD_PROGRESS
NO_HIGHER_PRIORITY_NEED
SOURCE_LESSON_ALREADY_STARTED
REPLACEMENT_LESSON_IMMUTABLE
```

AI cannot generate rationale codes.

## 8. Lesson-boundary adaptation

WeeklyPlan generation remains Phase 3 initial planning. Phase 7 adapts only at execution time.

Permitted triggers:

1. after a DailyLesson is COMPLETED;
2. after a DailyLesson is SKIPPED;
3. before the next effective lesson has STARTED;
4. Parent/Tutor explicitly requests deterministic reevaluation.

A STARTED lesson is never superseded. COMPLETED/SKIPPED lessons are not replacement targets; they only cause the next not-started effective lesson to be evaluated.

One original source lesson may have multiple historical KEEP decisions under different cutoffs, but at most one adopted SUPERSEDE. Once superseded, the original is frozen. A replacement lesson may not itself be superseded in V1. New learning facts after replacement are handled at the next lesson boundary, preventing replacement chains.

## 9. Persistence design

Phase 6 has 19 durable tables. Phase 7 adds four append-only fact tables for an expected total of 23:

```text
strategy_interactions
strategy_evidence
adaptive_decisions
lesson_supersessions
```

No `student_progress`, `objective_progress`, `strategy_mastery`, `performance_state`, `next_best_lesson`, mutable score or recommendation table is added.

### 9.1 strategy_interactions

```ts
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
```

The source must be resolvable to trusted canonical context. LESSON is allowed only for an explicit structured strategy activity, not because the strategy was merely taught.

### 9.2 strategy_evidence

```ts
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
```

One interaction produces at most one StrategyEvidence. Use a stable identity such as `strategy-evidence:${interactionId}` and enforce `UNIQUE(interaction_id)`.

### 9.3 adaptive_decisions

```ts
export type AdaptiveDecisionAction = 'KEEP' | 'SUPERSEDE';

export interface AdaptiveDecision {
  id: string;
  studentId: string;
  sourceLessonId: string;
  action: AdaptiveDecisionAction;
  selectedIntent: LessonIntent;
  selectedObjectiveIds: string[];
  targetMistakeId?: string;
  rationaleCodes: AdaptiveRationaleCode[];
  policyVersion: 'adaptive-policy-v1';
  evaluatedAt: string;
  inputFactCutoff: string;
  createdAt: string;
}
```

KEEP also records the fully selected current intent/objectives so the audit snapshot is self-contained. `selectedIntent === 'CORRECTION'` requires a trusted unresolved `targetMistakeId`; for non-CORRECTION decisions, `targetMistakeId` must be absent.

Evaluation idempotency key:

```text
studentId + sourceLessonId + inputFactCutoff + policyVersion
```

Enforce a unique constraint for that tuple. The production service obtains one trusted server `now` and uses it for both `evaluatedAt` and `inputFactCutoff`; clients author neither field. `createdAt` is the durable write time and may be later than the cutoff. All input facts consumed by the decision must have their relevant canonical observed/occurred timestamp at or before `inputFactCutoff`.

`adaptive-policy-v1` binds the implementation to `coverage-policy-v1`, the existing mastery policy, `performance-policy-v1`, `strategy-policy-v1`, and `mistake-priority-v1`.

### 9.4 lesson_supersessions

```ts
export interface LessonSupersession {
  id: string;
  studentId: string;
  sourceLessonId: string;
  replacementLessonId: string;
  adaptiveDecisionId: string;
  createdAt: string;
}
```

Constraints:

```text
UNIQUE(source_lesson_id)
UNIQUE(replacement_lesson_id)
UNIQUE(adaptive_decision_id)
```

Replacement lessons stay in the existing `daily_lessons` ledger, use the same WeeklyPlan/student and logical sequence as the source, and remain immutable. Do not add mutable `superseded`, `replacedBy`, `adaptiveStatus` or correction-specific fields to DailyLesson.

Application/repository logic must also prevent a replacement lesson from later becoming another supersession source.

### 9.5 Transaction boundary

For SUPERSEDE, the following commit atomically in one transaction:

```text
AdaptiveDecision(SUPERSEDE)
+ replacement DailyLesson
+ LessonSupersession
```

Any failure rolls back all three. KEEP writes only AdaptiveDecision.

All Phase 7 repositories are append-only and expose no update/delete state setters.

## 10. Progress and adaptation services

### 10.1 Progress facts and service

Avoid a giant “get everything” persistence abstraction. Compose existing narrow repositories:

```ts
export interface ProgressFacts {
  learning: LearningStateRepository;
  attempts: AttemptRepository;
  planning: PlanningRepository;
  correction: MistakeRepository;
  strategy: StrategyRepository;
}
```

`ProgressService` derives objective/student views at a supplied trusted evaluation cutoff and writes nothing.

### 10.2 StrategyRepository

```ts
export interface StrategyRepository {
  appendInteraction(interaction: StrategyInteraction): Promise<void>;
  appendEvidence(evidence: StrategyEvidence): Promise<void>;
  listInteractionsForStudent(studentId: string, cutoff: string): Promise<StrategyInteraction[]>;
  listEvidenceForStudent(studentId: string, cutoff: string): Promise<StrategyEvidence[]>;
}
```

No mutable strategy-state methods exist.

### 10.3 AdaptiveRepository

```ts
export interface AdaptiveRepository {
  getDecisionByEvaluationKey(
    studentId: string,
    sourceLessonId: string,
    inputFactCutoff: string,
    policyVersion: string,
  ): Promise<AdaptiveDecision | null>;

  appendKeepDecision(decision: AdaptiveDecision): Promise<void>;

  commitSupersession(input: {
    decision: AdaptiveDecision;
    replacementLesson: DailyLesson;
    supersession: LessonSupersession;
  }): Promise<void>;

  getSupersessionForSourceLesson(sourceLessonId: string): Promise<LessonSupersession | null>;
  getSupersessionByReplacementLesson(replacementLessonId: string): Promise<LessonSupersession | null>;
}
```

### 10.4 AdaptiveLearningService

Domain-level evaluation accepts a server-selected source lesson. Application-level `evaluateNextPlannedLesson(studentId, clock)` resolves the next effective PLANNED lesson and invokes the domain operation.

Execution order:

```text
1. resolve source/effective DailyLesson
2. verify student ownership
3. reject supersession of a replacement
4. if source already superseded, return existing effective replacement
5. inspect execution state; STARTED cannot be replaced
6. obtain one trusted server now; set evaluatedAt = inputFactCutoff = now
7. return exact existing decision for same evaluation key when present
8. load trusted facts <= cutoff
9. derive Coverage/Mastery/Performance/Strategy
10. derive MistakePriority
11. list/rank candidates
12. apply starvation guard/material supersession policy
13. persist KEEP or atomic SUPERSEDE
14. return effective lesson + code-owned rationale
```

Concurrency uses database unique constraints and transactions. If simultaneous calls race, the conflict path reloads the existing decision/supersession and returns it. V1 needs no distributed lock, queue or Redis.

A KEEP at cutoff T1 may be reevaluated at a later cutoff T2 if the lesson is still PLANNED. A SUPERSEDE freezes that source lesson permanently.

Uncertainty does not grant permission to supersede. Data-integrity violations throw; insufficient evidence for a materially better candidate yields safe KEEP.

## 11. Effective lesson projection

```ts
export interface EffectiveLesson {
  lesson: DailyLesson;
  originalLessonId: string;
  adapted: boolean;
  adaptiveDecisionId?: string;
}
```

Projection:

- source without supersession → source is effective;
- source with supersession → replacement is effective;
- direct lookup of replacement still reports `originalLessonId = source` and `adapted = true`.

Student-facing lesson lists use effective lessons by default. Parent/Tutor audit surfaces may show both original and replacement.

## 12. Parent/Tutor and Student views

### 12.1 ParentProgressView

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
```

It must answer six questions:

1. What has been learned/exposed?
2. What is actually mastered?
3. What is recently unstable?
4. Which mistakes remain active or recurring?
5. Which cross-topic strategies are developing/reliable?
6. What is next, and why?

Summary exposes counts, not a synthetic score: objectives introduced/practised/mastered, struggling/review-due/active/recurrent attention counts, and observed/developing/reliable strategy counts.

Objective views keep Coverage, Mastery and Performance as separate fields. Example: PRACTISED + DEVELOPING + STRUGGLING is displayed as “practised, still developing, recently needs support”, not “42% complete”.

### 12.2 StrategyProgressView

Expose state plus factual counts such as independent uses, transfers, objective count and last observed time. Do not expose an invented strategy score or broad cognitive/personality inference.

### 12.3 Mistakes

Reuse the Phase 6 active/resolved/recurring ParentMistakeGroups. Phase 7 may project LOW/NORMAL/BLOCKING plus deterministic reason codes. LOW/pending can be presented as “being confirmed” rather than a high-severity warning.

### 12.4 NextLessonView

Expose current effective lesson, adapted flag, original lesson where relevant, objective(s), code-owned human rationale and `targetMistakeId` for correction when appropriate. If an original PRACTICE becomes CORRECTION, Parent/Tutor view must clearly show original versus current plan and why.

Internal rationale codes map through a code-owned text table. AI does not rewrite the explanation at runtime.

### 12.5 Student view

Student output is deliberately thin: lesson identity/title, intent, objective summary and adapted flag. Do not expose rates, MistakePriority, policy version or internal analytics.

### 12.6 API surface

V1 application endpoints:

```text
GET  /api/progress
GET  /api/learning/next
POST /api/learning/next/evaluate
```

The POST means only “reevaluate the next unstarted lesson using current trusted facts”. It does not accept client-authored intent, objective, mastery, priority or rationale. Existing signed-session/single-household identity boundaries remain; Phase 7 does not add multi-household RBAC.

## 13. Topic aggregation

Parent topic summaries report counts by independent state dimensions:

```ts
export interface TopicProgressSummary {
  objectiveCount: number;
  coverage: {
    notSeen: number;
    introduced: number;
    engaged: number;
    practised: number;
  };
  mastery: {
    notStarted: number;
    introduced: number;
    developing: number;
    mastered: number;
  };
  performance: {
    insufficientData: number;
    struggling: number;
    unstable: number;
    stable: number;
  };
}
```

Display-only ratios such as `masteredCount / objectiveCount` and `practisedCount / objectiveCount` are allowed. They must not become a combined learning score or stored learning truth.

## 14. Persistence migration

Generate and inspect `migrations/0004_*.sql` during implementation. Expected contents are exactly the four Phase 7 tables plus required FK/unique/index changes.

Migration review must prove there is no mutable `progress_state`, `strategy_mastery_state`, `performance_score`, `current_recommendation`, or mutable lesson replacement field.

Do not apply the migration to production in Phase 7 implementation. Before first real durable-data deployment, existing activation rules still require separate Neon development/Preview and production databases, explicit non-production migration/testing, explicit `TEST_DATABASE_URL`, and reviewed promotion.

## 15. Testing strategy

### 15.1 Progress policy tests

Coverage tests cover all four states, root-attempt/evidence semantics, CORRECTION-only exclusion and deterministic ordering.

Performance tests cover:

- fewer than 3 attempts → INSUFFICIENT_DATA;
- independent rate < 0.50 → STRUGGLING;
- two-latest incorrect streak → STRUGGLING;
- recurrence plus current incorrect → STRUGGLING;
- exact STABLE gate (>=5, >=0.80 independent, <=0.20 incorrect, no streak, no blocking Mistake);
- remaining sufficient samples → UNSTABLE;
- CORRECTION excluded;
- >7-day Attempts excluded;
- latest at most 12 retained;
- tie ordering deterministic.

Strategy tests cover NOT_OBSERVED, prompted/developing, same-objective insufficiency, cross-objective transfer RELIABLE gate, MISAPPLICATION reset, and full requalification after later evidence.

### 15.2 Strategy authority tests

Prove that a correct answer alone emits no positive StrategyEvidence; client `independent` claims are rejected/ignored; unknown/incompatible strategies fail closed; AI output cannot directly emit StrategyEvidence.

### 15.3 Adaptive policy tests

Test every priority layer and material supersession rule, including the exact LEARN + NORMAL_CORRECTION three-condition gate. Explicitly prove Performance cannot change Mastery and Strategy cannot become independent curriculum authority.

### 15.4 Starvation E2E

Scenario:

```text
completed CORRECTION
→ completed REVIEW
→ NORMAL unresolved Mistake remains
→ READY forward candidate exists
→ next evaluation selects forward lesson
→ rationale contains STARVATION_GUARD_FORWARD_PROGRESS
```

Then add a BLOCKING Mistake and prove CORRECTION may bypass the guard.

### 15.5 Supersession/replay/concurrency

Prove:

- PLANNED source can be superseded and original remains durable;
- STARTED/COMPLETED/SKIPPED source cannot be replaced;
- replacement cannot be superseded again;
- one source has at most one replacement;
- KEEP at T1 may become SUPERSEDE at T2 after new trusted facts;
- exact evaluation-key replay returns the original decision;
- concurrent same-evaluation requests produce one decision/replacement/supersession;
- transactional failure rolls back all SUPERSEDE writes;
- replay at an older cutoff does not read later facts.

### 15.6 Parent/Student projection tests

Verify four-layer semantics remain separate and that Parent/Student outputs do not leak AnswerSpec, solutionOutline, raw Attempt payload, MistakeEvent payload, AI rationale, or inappropriate internal policy fields.

### 15.7 Neon contracts

Require explicit `TEST_DATABASE_URL`; never fall back to production `DATABASE_URL`. Cover append-only inserts, idempotent strategy evidence, decision replay, transactional supersession, unique-conflict recovery and effective-lesson reads.

### 15.8 Static authority audit

Final implementation must prove no production setters such as:

```text
setCoverageState
setPerformanceState
setStrategyState
setMistakePriority
setNextBestLesson
updateAdaptiveDecision
updateLessonSupersession
```

Also prove no LLM lesson ranking/intent selection, no client authority injection, unchanged Mastery authority, unchanged Phase 6 Mistake resolution gate, one canonical Attempt ledger, and no mutable DailyLesson supersession fields.

### 15.9 Full-loop E2E

At least one cross-Phase story must cover:

```text
learn objective
→ root practice
→ derive Coverage/Mastery/Performance
→ structured StrategyInteraction → StrategyEvidence
→ Mistake observed/corrected
→ later recurrence
→ BLOCKING MistakePriority
→ planned lesson superseded by CORRECTION
→ auditable AdaptiveDecision
→ correction completed
→ next boundary restores forward learning
→ ParentProgressView explains state and adaptation
```

### 15.10 Repository verification

Final implementation HEAD must pass:

```text
npm test
npm run typecheck
npm run validate:curriculum
npm run lint
npm run build
git status --short
```

`git status --short` must be clean. Environment/bootstrap failures must be classified as environment failures, not silently treated as product passes or product failures.

## 16. Implementation slices

Use seven TDD-oriented tasks during implementation planning:

1. **Progress domain**: Coverage, Performance, Objective/Topic projections.
2. **Strategy facts + projection**: interaction/evidence authority, memory repository, policy.
3. **MistakePriority + candidate policy**: deterministic ranking, material change, starvation guard.
4. **Adaptive persistence + effective lesson**: decision/supersession contracts and memory/Neon persistence.
5. **AdaptiveLearningService**: lesson-boundary orchestration, atomicity, concurrency and replay.
6. **Parent/Tutor + Student projections/API**: minimal progress and next-lesson surfaces.
7. **Migration + Neon contracts + full E2E + closeout**: `0004`, static authority audit, repo verification, CURRENT/BACKLOG updates.

The implementation plan may refine file boundaries based on repository structure, but it must not weaken the design contracts in this document.

## 17. Acceptance criteria

Phase 7 is complete only when all of the following hold:

1. Coverage, Mastery, Performance and Strategy remain independent deterministic dimensions with no combined mutable score.
2. Coverage implements NOT_SEEN/INTRODUCED/ENGAGED/PRACTISED from trusted facts.
3. Phase 2 Mastery remains the only mastery authority.
4. Performance uses the seven-day/latest-twelve root-attempt intersection and exact V1 state rules.
5. StrategyEvidence only comes from structured server-observed interactions; correct answers alone do not prove strategy use.
6. Strategy RELIABLE requires the full cross-objective independent/transfer gate after the latest misapplication.
7. MistakePriority is deterministic and non-persistent.
8. Next Best Lesson is prerequisite-aware and Mistake-aware without AI authority.
9. Automatic CORRECTION lessons bind an unresolved canonical Mistake.
10. Ordinary CORRECTION/REVIEW cannot consume a third consecutive completed lesson when a safe READY forward candidate exists; only blocking gates may bypass.
11. WeeklyPlan/DailyLesson history remains immutable; adaptation uses AdaptiveDecision + replacement DailyLesson + LessonSupersession.
12. STARTED lessons are never automatically replaced.
13. Formal evaluations record policyVersion, inputFactCutoff, rationale and selected lesson.
14. Same fact slice + same policy version is replayable and deterministic.
15. One source lesson has at most one supersession; replacement chains are forbidden in V1.
16. Parent/Tutor view explains learned/mastered/unstable/mistake/strategy/next-lesson state without collapsing dimensions.
17. AI cannot own Progress, StrategyEvidence, MistakePriority, ranking, KEEP/SUPERSEDE, lesson intent or objective selection.
18. No Redis, queue, worker, vector DB, distributed lock or materialized progress cache is introduced.
19. `0004` is generated and reviewed but not automatically applied to production.
20. Final tests, typecheck, curriculum validation, lint and production build pass at exact implementation HEAD, subject only to explicitly documented host/environment gates.

## 18. Explicit non-goals

Phase 7 does not include:

- full Parent dashboard redesign;
- weekly/monthly reports, trend charts, heatmaps, radar charts, streaks, rankings or notifications;
- learning-time analytics or PDF/email reporting;
- AI narrative progress reports;
- school/class/teacher organization or multi-household RBAC;
- manual lesson override or teacher-authored adaptive-rule engine;
- adaptive difficulty/IRT/Bayesian Knowledge Tracing/ML mastery prediction;
- LLM-based next-best-lesson selection;
- materialized progress snapshots/caches;
- Redis, queues, workers, background adaptation jobs or distributed locks;
- production migration or deployment as part of implementation closeout.

Family Pilot remains Phase 8.

## 19. Design invariants carried forward

Phase 7 must preserve these existing invariants:

- curriculum truth is version-controlled, not copied into mutable Postgres truth;
- EvidenceRecord remains append-only;
- Mastery and Readiness remain deterministic projections;
- one canonical Attempt ledger continues to serve PRACTICE/HOMEWORK/CORRECTION;
- failed CORRECTION Attempts do not inflate learning Evidence;
- Mistake episodes/events remain immutable/append-only and resolution remains the Phase 6 hard-gate projection;
- WeeklyPlan and DailyLesson remain immutable snapshots;
- AI never owns answer keys, grading, Evidence, Mistake resolution or adaptation state;
- unsupported/ambiguous trusted structures fail closed;
- production database tests never use `DATABASE_URL` as a fallback.

These invariants are requirements, not implementation suggestions.
