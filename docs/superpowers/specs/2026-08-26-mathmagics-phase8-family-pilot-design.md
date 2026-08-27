# MathMagics Phase 8 — Family Pilot Design

**Date:** 2026-08-26

**Status:** Approved design, ready for Human Owner spec review before implementation planning

## 1. Purpose

Phase 8 moves MathMagics from an internally verified learning system to a real single-household pilot. The goal is not to expand feature breadth. The goal is to determine whether the Phase 1–7 learning loop works reliably, understandably, and safely in ordinary family use over multiple weeks.

The product loop under validation is:

```text
Curriculum
  → Plan
  → Learn
  → Practice / Homework
  → Detect Mistake
  → Correct
  → Track Coverage / Mastery / Performance / Strategy
  → Adapt next lesson
  → Parent understands what happened and why
  → repeat over multiple weeks
```

Phase 8 must produce evidence strong enough to decide what Phase 9 should be. It must not hide product uncertainty behind more curriculum, more dashboards, multi-household infrastructure, or a new learning algorithm.

## 2. Locked Phase 8 decisions

1. **Pilot-first, not feature-first.** Existing P2/P3 curriculum and the Phase 1–7 learning engine are the subject of the pilot.
2. **Single household remains the V1 boundary.** No multi-household identity, tenancy, school/class model, or RBAC expansion is introduced.
3. **Existing canonical facts remain the evidence source.** Attempt, Evidence, Mistake, Strategy, lesson execution and AdaptiveDecision history remain authoritative. Phase 8 does not create a second analytics truth.
4. **No combined learning score.** Coverage, Mastery, Performance and Strategy remain independent dimensions.
5. **No new durable pilot-event table by default.** Product evidence should be derived from existing durable facts and read-only projections. A new schema is permitted only if implementation planning proves a specific pilot question cannot be answered safely from existing facts.
6. **Qualitative family feedback stays outside the product database.** Human observations may be kept in a private pilot journal controlled by the Human Owner. Only de-identified summaries and decisions may be committed to the repository.
7. **Production activation is an explicit gate.** Existing migrations `0000`–`0004` must be proven against non-production Neon before production migration or pilot deployment.
8. **Adaptive policy is frozen during the initial pilot window unless a defect is found.** Policy changes must be versioned and cannot be tuned opportunistically in response to individual sessions.
9. **Pilot blockers may be fixed; unrelated polish may not.** UX changes are allowed only when they remove a concrete barrier to completing or understanding the learning loop.
10. **Phase 8 ends in an evidence review.** Completion is based on the quality of observed evidence and product decisions, not merely elapsed calendar time.

## 3. Scope and gate sequence

Phase 8 is executed as five gates:

```text
P8-0  Phase 7 Release Closure
  ↓
P8-1  Pilot Activation
  ↓
P8-2  Minimal Observation Layer
  ↓
P8-3  Family Pilot UX
  ↓
P8-4  Multi-week Pilot + Evidence Review
```

Design and documentation may proceed before P8-0 closes. No production pilot starts until P8-0 and P8-1 pass.

## 4. P8-0 — Phase 7 Release Closure

Phase 7 PR #8 is already merged. Phase 8 must not treat that as equivalent to a verified production candidate.

The exact canonical merge HEAD must pass:

```text
npm test
npm run typecheck
npm run validate:curriculum
npm run lint
npm run build
git status --short
```

Expected behavior:

- test, typecheck, curriculum validation, lint and build all pass on the same exact HEAD;
- `git status --short` is clean;
- intentional live-Neon skips remain clearly identified rather than silently counted as integration coverage;
- `.agent/CURRENT.md` and `.agent/BACKLOG.md` are corrected so Phase 7 no longer appears as an unfinished implementation gate once this verification has passed;
- no production migration or deployment happens during P8-0.

Environment/bootstrap failures are classified separately from product failures. A failed tool environment is not a product pass, and a missing dependency in a disposable worktree is not a reason to weaken the release gate.

## 5. P8-1 — Pilot Activation

### 5.1 Deployment topology

Keep the existing V1 deployment architecture:

```text
Vercel Next.js 16
  region: sin1
       │
       ├── Preview → non-production Neon Singapore
       └── Production → production Neon Singapore
```

Curriculum truth remains version-controlled JSON in the application bundle. Mastery, Readiness, LearningPosition, execution state and the four Phase 7 progress dimensions remain derived projections rather than mutable database truth.

### 5.2 Required environment separation

Preview/integration and Production must not share a writable Neon database or credentials.

Production requires:

- `MINIMAX_API_KEY`;
- `SITE_PASSWORD`;
- `SESSION_SECRET`;
- `DATABASE_URL` pointing only to production Neon.

Integration testing may additionally use:

- `TEST_DATABASE_URL` pointing only to disposable/non-production Neon.

Tests must never fall back from `TEST_DATABASE_URL` to production `DATABASE_URL`.

### 5.3 Migration activation gate

Before any production migration:

1. provision or confirm a non-production Neon database/branch in Singapore;
2. apply committed migrations `0000` through `0004` to non-production;
3. run the learning/planning, practice, homework, correction, strategy and adaptive Neon contract suites against explicit `TEST_DATABASE_URL`;
4. run a representative full-loop service scenario against non-production persistence;
5. review failures as product/schema defects rather than bypassing them;
6. only after all checks pass, request the explicit Human Gate for production migration/deployment;
7. apply exactly the reviewed migration chain to production;
8. deploy the exact reviewed application HEAD;
9. perform production smoke verification before real pilot use.

No application startup migration is introduced. Preview never migrates Production.

### 5.4 Production smoke verification

The first pilot release must prove, using a disposable or known-safe pilot student state where appropriate:

- authenticated session works;
- progress view can read current state;
- next-lesson read works;
- one safe learning/practice flow can persist and be read back;
- adaptive evaluation can be invoked without corrupting an already-started lesson;
- parent-facing projections do not leak answer keys, raw internal policy payloads, or provider-private reasoning;
- production runtime logs show no repeated database/auth/provider failure loop.

## 6. P8-2 — Minimal Observation Layer

### 6.1 Principle

The pilot should observe the learning system without inventing a parallel analytics system.

The default evidence model is read-only projection over existing durable facts:

```text
WeeklyPlan / DailyLesson
LessonExecutionEvent
Attempt
EvidenceRecord
Homework observations
Mistake / MistakeEvent
StrategyInteraction / StrategyEvidence
AdaptiveDecision / LessonSupersession
        │
        ▼
Pilot evidence projections
```

### 6.2 Questions the system must answer

For any review date/cutoff the system should be able to answer:

1. What was planned?
2. What was actually learned or attempted?
3. What has evidence-backed Coverage?
4. What is currently Mastered?
5. What appears recently STABLE / UNSTABLE / STRUGGLING?
6. Which mistakes remain unresolved or have recurred?
7. Which strategies are developing or reliable?
8. What lesson was selected next?
9. Was that lesson kept or superseded?
10. Why did the deterministic adaptation policy make that decision?

The answer must be reconstructable from trusted facts at the relevant cutoff. A dashboard screenshot is not evidence if the underlying state cannot be replayed.

### 6.3 Minimal pilot review projection

Implementation planning may introduce a read-only `PilotReview` or equivalent composition layer that returns, at minimum:

```ts
interface PilotReview {
  evaluatedAt: string;
  studentId: string;
  plannedLessons: unknown[];
  completedLessons: unknown[];
  coverageSummary: unknown;
  masterySummary: unknown;
  performanceSummary: unknown;
  strategySummary: unknown;
  unresolvedMistakes: unknown[];
  recentRecurrences: unknown[];
  nextLesson: unknown;
  latestAdaptiveDecision: unknown | null;
}
```

The final implementation should reuse existing public/domain view types wherever practical rather than duplicate them behind `unknown` placeholders. This interface is illustrative, not a mandate for a specific file or route.

### 6.4 Data minimization

Phase 8 does not require:

- raw screen recording;
- raw chat transcript analytics;
- generic clickstream tracking;
- third-party behavioral analytics SDKs;
- durable storage of homework source images;
- advertising identifiers;
- household names, addresses, phone numbers, or unnecessary child profile fields.

If product telemetry is later proposed, it requires a separate design and Human Gate.

## 7. P8-3 — Family Pilot UX

Phase 8 UX exists to make the proven engine usable, not to redesign the product.

### 7.1 Student daily loop

The student must be able to understand and complete this flow without product-internal terminology:

```text
What am I doing today?
  → Learn / Practice / Homework / Correction
  → finish the activity
  → see what happens next
```

The UI must not expose Mastery percentages that do not exist, internal candidate ranking, raw MistakePriority, hidden answer truth, or provider reasoning.

### 7.2 Parent/Tutor daily loop

The Parent/Tutor surface must answer, in plain language:

```text
What did the student work on?
What appears mastered?
What is still unstable?
What still needs correction?
What is being taught next?
Why did the next lesson change, if it changed?
```

The four progress dimensions must remain visibly distinct. Product wording may explain them, but cannot collapse them into a single score or color that implies one overall ability value.

### 7.3 Allowed UX work

A UX change is in scope only if at least one of these is true:

- the student cannot complete a normal pilot session;
- the parent cannot find the current learning state;
- the parent cannot understand a meaningful adaptive change;
- a recovery/error state leaves the household unable to continue safely;
- the UI exposes information forbidden by an existing authority/privacy boundary.

Cosmetic redesign, broad navigation restructuring, gamification, streaks, rankings, generic analytics charts and new notification systems remain out of scope.

## 8. P8-4 — Multi-week pilot protocol

### 8.1 Pilot duration

The pilot is intentionally multi-week. The exact calendar duration may be adjusted by the Human Owner based on actual learning cadence, but Phase 8 may not be declared complete from a handful of demonstration sessions.

The pilot should contain enough repeated use to observe:

- new learning;
- normal practice;
- at least one real correction path if mistakes occur naturally;
- recurrence behavior if it occurs naturally;
- adaptive KEEP decisions;
- at least one meaningful adaptive SUPERSEDE event if the trusted facts naturally justify it;
- return to forward learning after remediation;
- parent interpretation of the resulting state.

The system must not manufacture mistakes or force supersession merely to satisfy a checklist.

### 8.2 Daily review

For each real learning day, record a compact private observation containing:

- whether the planned session was started and completed;
- major friction or failure;
- whether the student could understand what to do next;
- whether the parent could explain the system state in their own words;
- any mismatch between family expectation and deterministic system decision;
- incident severity if a product defect occurred.

Qualitative notes remain outside the product database and repository unless de-identified.

### 8.3 Weekly evidence review

At least once per pilot week, review:

- lesson completion and abandonment;
- Coverage movement;
- Mastery movement and review-due behavior;
- recent Performance stability/instability;
- unresolved and recurrent Mistakes;
- correction closure and transfer evidence;
- Strategy development/transfer;
- adaptive KEEP/SUPERSEDE decisions and rationale;
- starvation-guard behavior;
- family understanding of next-lesson rationale;
- product incidents and manual interventions.

The weekly review should distinguish:

```text
product defect
vs
curriculum/content gap
vs
expected learner difficulty
vs
family preference
vs
operator/deployment issue
```

These categories must not be blended, because each implies a different Phase 9 response.

## 9. Pilot success criteria

Phase 8 is successful only if evidence supports all of the following.

### 9.1 Reliability

- canonical learning facts can be persisted and replayed without unexplained gaps;
- lesson execution and adaptation history remain immutable/auditable;
- no repeated auth, database, provider or migration issue blocks normal family use;
- failures are recoverable without mutating canonical history by hand.

### 9.2 Learning-state fidelity

Across sampled review points, the system can correctly explain:

- what was learned;
- what is mastered;
- what is recently unstable;
- what still requires correction;
- what strategy evidence exists;
- what should be taught next.

Material disagreements between system state and observed reality must be logged and classified.

### 9.3 Adaptive-loop quality

- KEEP/SUPERSEDE decisions are reproducible from trusted facts and policy version;
- no STARTED lesson is replaced automatically;
- remediation does not starve safe forward progress except where blocking gates justify it;
- after a blocking condition resolves, the system can return to forward learning;
- parents can understand the main reason for a material lesson change without reading internal policy structures.

### 9.4 Family usability

- the student can normally determine what to do next;
- the parent can normally determine current learning state and unresolved issues;
- normal use does not require the Human Owner to explain internal product semantics every session;
- repeated friction points are captured as evidence rather than silently worked around.

## 10. Incident and intervention policy

### 10.1 Severity

Use a simple pilot incident scale:

- **P0 — Stop:** risk of corrupted canonical facts, cross-environment data exposure, auth bypass, wrong-student data, destructive migration, or unsafe automatic adaptation behavior.
- **P1 — Blocker:** household cannot continue the intended learning loop without operator intervention.
- **P2 — Material friction:** flow can continue, but state/rationale is confusing or a repeated workaround is required.
- **P3 — Cosmetic/minor:** does not change learning correctness or session completion.

### 10.2 Response

- P0 stops the pilot until corrected and verified.
- P1 may pause the affected flow; a bounded fix may be shipped after normal RED → GREEN → exact verification.
- P2 is collected and prioritized by repeated impact; do not automatically convert every observation into code work.
- P3 is normally deferred until after the pilot.

Manual database edits to make learning state “look right” are forbidden except controlled recovery under a separately reviewed incident procedure.

## 11. Change control during the pilot

To preserve evidence quality:

1. pin the pilot to an identifiable application SHA and adaptation `policyVersion`;
2. record every pilot release/change point;
3. do not tune mastery thresholds, performance thresholds, starvation rules, MistakePriority or adaptation ranking based on a single anecdote;
4. any learning-policy defect fix requires explicit tests demonstrating the old behavior and corrected behavior;
5. if policy changes materially, treat evidence before and after the change as separate cohorts/windows;
6. curriculum corrections must be version-controlled and attributable to specific source/content defects.

## 12. Evidence report and Phase 9 decision

At the end of the pilot, produce a de-identified repository document containing:

### 12.1 Evidence summary

- pilot window and application/policy versions;
- number of real learning days and completed sessions;
- learning-loop paths actually observed;
- important Coverage/Mastery/Performance/Strategy patterns;
- Mistake/correction/recurrence outcomes;
- adaptive decisions observed;
- family comprehension findings;
- incident summary;
- unresolved defects and uncertainties.

### 12.2 Decision classification

Every significant finding should be classified as one of:

```text
KEEP
  current design worked; preserve it

FIX
  bounded defect or usability problem

ADJUST POLICY
  deterministic learning policy needs evidence-backed revision

EXPAND CURRICULUM
  engine is adequate; breadth is now the bottleneck

EXPAND PRODUCT
  multi-household, reporting or workflow expansion is justified

MORE EVIDENCE
  conclusion is not yet supported
```

### 12.3 Phase 9 gate

Phase 9 is not selected in advance. The evidence report recommends the next phase from observed constraints.

Examples:

- stable engine + curriculum bottleneck → curriculum breadth;
- stable learning loop + parent information bottleneck → reporting/parent experience;
- stable single household + validated external demand → multi-household identity;
- adaptation defects → policy hardening before expansion;
- unreliable core loop → remediation phase rather than expansion.

## 13. Testing and verification strategy

### 13.1 Existing regression suite

Every Phase 8 code change must preserve the complete existing repository verification:

```text
npm test
npm run typecheck
npm run validate:curriculum
npm run lint
npm run build
```

### 13.2 New code, if any

Pilot-specific application code must be developed TDD-first and should prefer read-only composition over new persistence.

Tests must prove as applicable:

- pilot/review projections are deterministic at a fact cutoff;
- no later facts leak into historical review;
- parent/student projections do not leak answer truth or internal policy payloads;
- all four progress dimensions remain separate;
- no pilot endpoint can mutate Mastery, Readiness, Mistake state, Strategy state or adaptive decisions;
- auth boundaries match the existing single-household signed-session model.

### 13.3 Live Neon contracts

Before production activation, all existing Neon repository contracts for migrations `0000`–`0004` must pass against explicit non-production `TEST_DATABASE_URL`.

If Phase 8 adds no schema, no `0005` migration should exist merely to “mark the phase.”

## 14. Phase 8 acceptance criteria

Phase 8 is complete only when all of the following hold:

1. Phase 7 exact canonical release verification is complete and recorded.
2. Preview/non-production and Production Neon are separated.
3. Migrations `0000`–`0004` pass explicit non-production Neon contracts before Production migration.
4. Production activation occurs only after the required Human Gate.
5. Production smoke verification passes on the exact pilot release.
6. A real multi-week single-household pilot is completed using existing P2/P3 curriculum.
7. The system can reconstruct what was planned, attempted, learned, mastered, unstable, unresolved and selected next from trusted facts.
8. Coverage, Mastery, Performance and Strategy remain independent.
9. Real adaptive decisions observed during the pilot remain deterministic, replayable and understandable at the parent-facing level.
10. Correction and recurrence behavior is evaluated from real use without manufactured failures.
11. Pilot incidents are classified and material defects are not silently worked around.
12. Qualitative family feedback is kept private; committed evidence is de-identified.
13. No multi-household infrastructure, generic analytics platform, third-party clickstream SDK or broad curriculum expansion is introduced as incidental pilot work.
14. A de-identified Pilot Evidence Report is committed.
15. That report makes an evidence-backed Phase 9 recommendation rather than assuming the next product expansion in advance.

## 15. Explicit non-goals

Phase 8 does not include:

- P4/P5 curriculum expansion;
- multi-household identity, tenancy or RBAC;
- school/class/teacher organization;
- generalized event analytics or data warehouse;
- third-party product analytics SDKs;
- weekly/monthly automated email reports;
- PDF report generation;
- streaks, badges, rankings or gamification;
- full Parent dashboard redesign;
- AI-written progress truth;
- LLM-selected next lesson;
- new mutable learning/progress scores;
- adaptive difficulty, IRT, Bayesian Knowledge Tracing or ML personalization;
- Redis, queues, workers, background adaptation jobs or distributed locks;
- durable homework-image retention;
- collecting unnecessary household/child PII;
- broad refactoring unrelated to a demonstrated pilot blocker.

## 16. Design invariants carried forward

Phase 8 must preserve all earlier learning-authority invariants:

- curriculum truth is version-controlled;
- EvidenceRecord is append-only;
- one canonical Attempt ledger serves PRACTICE/HOMEWORK/CORRECTION;
- Mastery and Readiness are deterministic projections;
- Coverage, Performance and Strategy are deterministic projections rather than mutable truth;
- Mistake episodes/events are immutable/append-only and hard-fact resolution remains code-owned;
- WeeklyPlan/DailyLesson are immutable snapshots;
- AdaptiveDecision and LessonSupersession remain durable audit facts;
- STARTED lessons are not automatically replaced;
- AI never owns answer keys, grading, Evidence, Mistake resolution, learning state or adaptive selection;
- unsupported/ambiguous trusted structures fail closed;
- production database tests never use `DATABASE_URL` as a fallback.

These are requirements, not implementation suggestions.

## 17. Implementation-planning boundary

After Human Owner review of this spec, implementation planning should decompose Phase 8 into the smallest operational/code slices necessary to execute P8-0 through P8-4.

The plan should assume that some slices may be documentation/operations-only. It must not invent code merely to make the phase look substantial.

Expected planning categories are:

1. P8-0 exact-HEAD release closure;
2. P8-1 non-production Neon migration/contract activation and production release gate;
3. P8-2 read-only pilot evidence composition, only where existing views are insufficient;
4. P8-3 bounded pilot UX blockers discovered before or during use;
5. P8-4 pilot protocol, evidence capture and final evidence report.

No Phase 8 implementation begins before the Human Owner approves this written spec.
