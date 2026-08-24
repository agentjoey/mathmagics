# MathMagics Phase 4 — Practice / Attempt Core Design

Date: 2026-08-25
Status: Proposed for Human Owner review
Base: Phase 3 merged at `9660870a996b07b165353eaf53a8fd41a971b0b5`

## 1. Purpose

Phase 4 adds the first trustworthy student-practice loop on top of the Phase 1 curriculum, Phase 2 Evidence/Mastery core, and Phase 3 Teaching Planner.

The product must be able to answer:

- what practice the student was given;
- what the student actually submitted;
- whether that submission was deterministically correct or incorrect;
- whether a hint had been revealed before submission;
- whether the submission was a retry of an earlier wrong attempt; and
- what Phase 2 Evidence follows from that immutable practice history.

The governing rule remains:

> Curriculum truth, mathematical correctness, Evidence, Mastery and Readiness are application-owned deterministic facts. AI may help express teaching content but does not own those facts.

Phase 4 is therefore an **Attempt-first, deterministic-evidence** subsystem, not an AI-grading subsystem.

---

## 2. Locked scope

### In scope

1. `PracticeSession` for exactly one `DailyLesson × LearningObjective`.
2. Immutable `PracticeItem` with durable structured mathematical parameters and server-only `AnswerSpec`.
3. Deterministic difficulty policy using `FOUNDATION | CORE | APPLICATION | CHALLENGE`.
4. Deterministic item generation for the existing deep teaching slices.
5. Server-observed append-only hint reveal facts.
6. Immutable `Attempt` with deterministic grading and linear retry provenance.
7. Pure, versioned `Attempt → EvidenceRecord` projection.
8. Idempotent recovery if Attempt persists but its derived Evidence write is interrupted.
9. Storage-agnostic `PracticeRepository`, memory adapter, and Neon/Drizzle adapter.
10. P2/P3 end-to-end scenarios using real curriculum, learning-state and planning contracts.
11. Narrow optional AI rendering/explanation boundary that cannot change mathematical truth.

### Explicitly out of scope

- persistent `Mistake` lifecycle or misconception confirmation;
- homework photo ingestion, OCR, handwriting recognition or object storage;
- free-response AI grading that automatically writes Evidence;
- dashboards, aggregate practice summaries or ability scores;
- spaced repetition, IRT, psychometrics or advanced adaptive difficulty;
- gamification, badges or streaks;
- multi-objective `PracticeSession`;
- generator coverage for all 68 objectives;
- queues, workers, Redis, Kafka, microservices or vector search;
- production migration as an incidental part of Phase 4 implementation.

`Mistake` remains Phase 6. Homework Vision remains Phase 5. Advanced adaptation remains Phase 7.

---

## 3. Authority model

```text
Curriculum JSON
   ↓
LearningObjective / teaching knowledge
   +
StudentProfile / CurrentPositionAssumption
   +
EvidenceRecord[]
   ↓
Mastery / Readiness (derived)
   +
DailyLesson (Phase 3 snapshot)
   ↓
PracticePreparationContext
   ↓
Deterministic PracticeBlueprint
   ↓
Deterministic structured PracticeItem[]
   ↓
Student submission
   ↓
Deterministic grader
   ↓
Immutable Attempt
   ↓
Pure Attempt → Evidence projection
   ↓
Phase 2 Mastery / Readiness (derived again)
```

AI is absent from the grading/evidence tail.

### AI may

- add optional non-authoritative teaching prose around code-owned mathematical tokens;
- improve hint wording while the hint target remains code-owned;
- produce post-answer explanations from immutable item/grade facts.

### AI may not

- choose/change `objectiveId` or difficulty slot;
- change operands, fraction values, operation structure or canonical answer;
- decide `CORRECT` vs `INCORRECT`;
- decide whether a hint was revealed;
- invent retry provenance;
- write Evidence, Mastery or Readiness.

---

## 4. Package boundary

```text
lib/practice/
├── types.ts
├── validation.ts
├── preparation.ts
├── blueprint.ts
├── generators/
├── grading.ts
├── hints.ts
├── evidence.ts
├── repository.ts
├── memory-repository.ts
├── service.ts
└── index.ts
```

`lib/practice` may depend on curriculum, learning and planning domain APIs. It must not import Drizzle, Neon, Next.js request objects, Vercel APIs or MiniMax SDKs.

Infrastructure adapters remain under `lib/persistence/`.

---

## 5. PracticeSession

```ts
export interface PracticeSession {
  id: string;
  studentId: string;
  lessonId: string;
  objectiveId: string;
  policyVersion: string;
  createdAt: string;
}
```

### Invariants

- student and DailyLesson exist;
- lesson belongs to the same student;
- `objectiveId` is present in `DailyLesson.objectiveIds`;
- objective is valid for the student under existing P2/P3 rules;
- readiness is not `BLOCKED` at creation time;
- Phase 4 only creates sessions for lesson intent `PRACTICE` or `REVIEW`;
- one `(lessonId, objectiveId)` has at most one V1 PracticeSession.

There is no mutable `PracticeSession.status`.

### Idempotent creation

`createPracticeSession(lessonId, objectiveId, now)` first checks for an existing session. If one exists, it returns that immutable session and does not regenerate or overwrite items, even if a newer policy version exists. Historical practice stays reproducible.

Repeated later practice should come from a later planned lesson rather than silently creating unlimited sessions against one plan snapshot.

---

## 6. PracticePreparationContext

```ts
export interface PracticePreparationContext {
  student: StudentProfile;
  lesson: DailyLesson;
  objective: LearningObjective;
  mastery: MasterySnapshot;
  readiness: ObjectiveReadiness;
  representations: Representation[];
  strategies: ProblemSolvingStrategy[];
  misconceptions: Misconception[];
  policyVersion: string;
  preparedAt: string;
}
```

This context is assembled by application code using Phase 1/2/3 query APIs. Generated prose cannot replace these facts.

---

## 7. PracticeBlueprint

```ts
export interface PracticeBlueprint {
  objectiveId: string;
  policyVersion: string;
  slots: DifficultyBand[];
}
```

V1 creates four items per session.

### `practice-v1`

| Mastery / review state | Slots |
|---|---|
| `NOT_STARTED` | FOUNDATION, FOUNDATION, CORE, CORE |
| `INTRODUCED` | FOUNDATION, FOUNDATION, CORE, CORE |
| `DEVELOPING` | FOUNDATION, CORE, CORE, APPLICATION |
| `MASTERED`, `reviewDue=true` | CORE, CORE, APPLICATION, APPLICATION |
| `MASTERED`, `reviewDue=false` | CORE, APPLICATION, APPLICATION, CHALLENGE |

`reviewDue` deliberately suppresses CHALLENGE after a post-mastery error. This is a simple versioned policy, not an ability model.

---

## 8. Structured problem truth

A persisted item must contain durable code-owned mathematical structure, not only a prompt string.

```ts
export type PracticeProblemSpec =
  | ArithmeticProblemSpec
  | FractionProblemSpec
  | WordProblemSpec;
```

Each variant is a strongly typed discriminated union owned by the deterministic generator family. It records the operands/quantities, operation or relationship, and other parameters needed to prove the answer key and audit the item later.

It is **not** arbitrary AI JSON.

Examples of generator-owned families include:

- multiplication/division fact and inverse-family structures;
- equal-sharing/grouping structures;
- equivalent/simplest/compare/fraction-operation structures;
- part-whole/comparison/equal-groups word-problem structures.

The exact union variants belong in implementation types and tests; the architectural requirement is that every Evidence-producing PracticeItem has a typed, code-owned `problemSpec` from which its `AnswerSpec` is derivable and testable.

---

## 9. AnswerSpec and deterministic grading

Only deterministically gradable answers may automatically produce Evidence.

```ts
export type AnswerSpec =
  | { kind: 'INTEGER'; value: string }
  | { kind: 'DECIMAL'; value: string }
  | {
      kind: 'FRACTION';
      numerator: number;
      denominator: number;
      equivalence: 'VALUE' | 'EXACT_SIMPLEST';
    }
  | { kind: 'CHOICE'; optionId: string }
  | {
      kind: 'EXACT_TEXT';
      acceptedValues: string[];
      caseSensitive: false;
    };
```

### Grading rules

- INTEGER: trim; reject non-integer syntax; compare canonical integer value.
- DECIMAL: trim and normalize decimal representation; compare exact mathematical decimal value with no floating tolerance.
- FRACTION / `VALUE`: normalize sign and gcd; compare rational value.
- FRACTION / `EXACT_SIMPLEST`: require equal value and simplest form.
- CHOICE: exact option ID.
- EXACT_TEXT: trim/normalize whitespace; compare explicit accepted values under declared case policy.

No fuzzy semantic match may produce Evidence in Phase 4.

```ts
export interface AttemptGrade {
  outcome: 'CORRECT' | 'INCORRECT';
  normalizedAnswer: string;
}

export function gradeAnswer(
  answerText: string,
  answerSpec: AnswerSpec,
): AttemptGrade;
```

The grader is pure and has no repository, LLM, Mastery or Mistake access.

Malformed student input grades `INCORRECT`; malformed trusted AnswerSpec is a server/domain error.

Historical Attempts are not regraded when a later grading policy version appears.

---

## 10. PracticeItem

```ts
export interface PracticeItem {
  id: string;
  sessionId: string;
  studentId: string;
  objectiveId: string;
  sequence: number;
  difficultyBand: DifficultyBand;

  problemSpec: PracticeProblemSpec;
  prompt: string;
  answerSpec: AnswerSpec;
  hint?: string;
  solutionOutline: string[];

  generator: string;
  generatorVersion: string;
  createdAt: string;
}
```

### Invariants

- session/student/objective relationships match;
- sequence is unique within the session;
- difficulty matches the blueprint slot at that sequence;
- `problemSpec` and `answerSpec` are generated by trusted code;
- generator tests prove AnswerSpec from problemSpec;
- item is immutable after creation.

### Student-facing projection

`PracticeItem` is server/domain data. Before submission, student-facing output must exclude `answerSpec`, `problemSpec` details that reveal the answer, and `solutionOutline`.

```ts
export interface StudentPracticeItem {
  id: string;
  sessionId: string;
  objectiveId: string;
  sequence: number;
  difficultyBand: DifficultyBand;
  prompt: string;
}
```

The hint is also excluded until `revealHint` is called.

---

## 11. Deterministic generator registry

```ts
export interface PracticeItemGenerator {
  supports(objectiveId: string): boolean;
  generate(input: PracticeItemGenerationInput): PracticeItemDraft[];
}
```

Unsupported objectives fail closed. There is no unrestricted AI fallback.

The initial registry must cover the existing deep slices, including at minimum:

### P2 multiplication/division

- `P2-MD-001`
- `P2-MD-002`
- `P2-MD-003`
- `P2-MD-004`
- `P2-MD-005`
- `P2-MD-006`

### P3 fractions

- `P3-FRA-001`
- `P3-FRA-002`
- `P3-FRA-003`
- `P3-FRA-004`
- `P3-FRA-005`

### Bar-model / word-problem slice

- `P2-AS-002`
- `P2-MD-005`
- `P3-AS-002`
- `P3-MD-005`

Overlap is intentional.

### Generator rules

- trusted TypeScript creates mathematical parameters;
- code derives AnswerSpec from problemSpec;
- values stay inside curriculum limits;
- word-problem quantity relationships use deterministic templates in Phase 4;
- all generation/validation finishes before persistence;
- unsupported objective produces an explicit domain error;
- tests validate mathematical structure and answer derivation, not merely prompt snapshots.

---

## 12. Optional AI content boundary

```ts
export interface PracticeContentRenderer {
  render(input: LockedPracticeRenderInput): Promise<RenderedPracticeContent>;
}
```

This is deliberately weaker than “generate a math problem”.

For numeric/fraction items, final prompts are composed in code so locked mathematical tokens are inserted after optional prose rendering.

For word problems, where wording carries the mathematical relationship, Phase 4 uses deterministic templates. AI may generate post-answer explanation or hint prose but cannot rewrite the problem statement used for grading/Evidence.

Renderer failure before creation leaves no partially persisted session/items.

The deterministic core must work with no AI provider configured.

---

## 13. PracticeHintReveal

The brainstorming draft placed `hintUsed` directly on Attempt. Self-review found an authority leak: if the client can claim `hintUsed=false`, a hinted answer can be misclassified as independent Evidence.

Phase 4 therefore adds one narrow append-only fact:

```ts
export interface PracticeHintReveal {
  id: string;
  sessionId: string;
  itemId: string;
  studentId: string;
  revealedAt: string;
}
```

### Rules

- server records reveal when hint is actually requested;
- reveal ID is a deterministic function of `(studentId, itemId)` so repeated reveal requests are idempotent;
- V1 stores at most one reveal per `(studentId, itemId)`;
- no reveal exists for an item with no hint;
- reveal does not create Evidence;
- Attempt `hintUsed` is derived from reveal history at or before Attempt `submittedAt`, never accepted from the client.

---

## 14. Attempt

```ts
export type AttemptOutcome = 'CORRECT' | 'INCORRECT';

export interface Attempt {
  id: string;
  sessionId: string;
  itemId: string;
  studentId: string;
  objectiveId: string;

  answerText: string;
  outcome: AttemptOutcome;
  hintUsed: boolean;
  retryOfAttemptId?: string;

  gradingPolicyVersion: string;
  submittedAt: string;
  recordedAt: string;
}
```

### Submit command

```ts
export interface SubmitAttemptInput {
  attemptId: string;
  sessionId: string;
  itemId: string;
  answerText: string;
  retryOfAttemptId?: string;
}
```

The caller supplies only the idempotency key and student-entered submission coordinates/content.

The service derives:

- studentId;
- objectiveId;
- outcome;
- hintUsed;
- grading policy version;
- submittedAt/recordedAt from trusted server `now`;
- Evidence type.

Client-supplied timestamps, outcome, hint usage, objective, Evidence type, Mastery or Readiness are not accepted.

### Retry rules

When `retryOfAttemptId` is present:

1. prior Attempt exists;
2. same student/session/item/objective;
3. prior outcome is `INCORRECT`;
4. it is the latest existing Attempt for the item;
5. retry chains are linear;
6. correct Attempt cannot be retried.

If prior Attempts exist for an item, a new submission must explicitly retry the latest incorrect Attempt. A second “fresh” first attempt is rejected.

Attempt records are immutable. Successful retry never overwrites earlier failure.

### Causal time

- Attempt time must not predate session/item creation;
- retry time must not predate the parent Attempt;
- HintReveal only affects Attempt if revealed at or before submittedAt.

---

## 15. Attempt → Evidence projection

Projection is pure and versioned. Phase 4 does not add another mastery algorithm.

### Precedence

For `CORRECT` Attempt:

1. retry → `corrected`;
2. else prior hint reveal → `correct_with_hint`;
3. else item band APPLICATION/CHALLENGE → `application_correct`;
4. else → `independent_correct`.

For `INCORRECT`:

- → `incorrect`.

Phase 4 never automatically emits `explained_independently`.

| Attempt fact | Evidence type |
|---|---|
| incorrect | `incorrect` |
| correct retry | `corrected` |
| correct after hint reveal | `correct_with_hint` |
| correct, no hint, FOUNDATION/CORE | `independent_correct` |
| correct, no hint, APPLICATION/CHALLENGE | `application_correct` |

### Evidence construction

```ts
{
  id: evidenceIdForAttempt(attempt.id),
  studentId: attempt.studentId,
  objectiveId: attempt.objectiveId,
  type: projectedType,
  observedAt: attempt.submittedAt,
  recordedAt: attempt.recordedAt,
  origin: {
    kind: 'PRACTICE',
    refId: attempt.id,
  },
}
```

Evidence ID is a stable deterministic function of Attempt ID.

---

## 16. LearningStateRepository extension

Phase 4 adds one narrow read method:

```ts
getEvidence(evidenceId: string): Promise<EvidenceRecord | undefined>;
```

There is still no update/delete Evidence method and no `setMastery` path.

---

## 17. PracticeRepository

```ts
export interface PracticeRepository {
  createPracticeSession(
    session: PracticeSession,
    items: PracticeItem[],
  ): Promise<void>;

  getPracticeSession(sessionId: string): Promise<PracticeSession | undefined>;
  findPracticeSession(
    lessonId: string,
    objectiveId: string,
  ): Promise<PracticeSession | undefined>;

  getPracticeItem(itemId: string): Promise<PracticeItem | undefined>;
  listPracticeItems(sessionId: string): Promise<PracticeItem[]>;

  appendHintReveal(reveal: PracticeHintReveal): Promise<void>;
  listHintReveals(itemId: string): Promise<PracticeHintReveal[]>;

  getAttempt(attemptId: string): Promise<Attempt | undefined>;
  appendAttempt(attempt: Attempt): Promise<void>;
  listAttemptsForItem(itemId: string): Promise<Attempt[]>;
  listAttemptsForSession(sessionId: string): Promise<Attempt[]>;
}
```

### Guarantees

- session + items persist atomically;
- all HintReveal/Attempt operations are append/list/get only;
- duplicate IDs fail closed unless service handles an exact idempotent replay before append;
- items order by sequence then ID;
- HintReveal order by revealedAt then ID;
- Attempts order by submittedAt, recordedAt, then ID;
- no mutable score/status/summary API.

`MemoryPracticeRepository` is the reference contract-test adapter.

---

## 18. PracticeService

The brainstorming draft accepted `lessonId` alone. Self-review found that ambiguous because Phase 3 DailyLesson may contain more than one objective. V1 PracticeSession is one objective, so the service requires explicit objective membership.

```ts
export interface PracticeService {
  preparePractice(
    lessonId: string,
    objectiveId: string,
    now: string,
  ): Promise<PracticePreparationContext>;

  createPracticeSession(
    lessonId: string,
    objectiveId: string,
    now: string,
  ): Promise<PracticeSession>;

  revealHint(
    sessionId: string,
    itemId: string,
    now: string,
  ): Promise<string>;

  submitAttempt(
    input: SubmitAttemptInput,
    now: string,
  ): Promise<Attempt>;
}
```

`now` is injected for deterministic testing but is server-owned in production.

### createPracticeSession

```text
find existing session by lesson/objective
→ if found, return immutable existing session
→ load DailyLesson
→ validate student / lesson / objective membership
→ validate intent PRACTICE or REVIEW
→ build trusted PracticePreparationContext
→ reject BLOCKED objective
→ derive deterministic PracticeBlueprint
→ select supported generator
→ create problemSpec + AnswerSpec + prompt/hint/solution
→ optional locked renderer
→ validate all items
→ atomic persist session + items
```

No persistence occurs if generation/rendering/validation fails.

### revealHint

```text
load session + item
→ validate relationship
→ require item hint
→ get existing deterministic HintReveal
→ if missing append it
→ return hint
```

### submitAttempt

```text
load session + item
→ derive student/objective from trusted records
→ check Attempt idempotency key
→ if exact existing Attempt, repair Evidence if needed and return it
→ validate retry provenance
→ read prior HintReveal
→ deterministic grade
→ build immutable Attempt using server now
→ append Attempt
→ derive stable Evidence
→ ensure derived Evidence exists
→ return Attempt
```

The service never calls planner to select another objective during submission.

---

## 19. Idempotency and partial failure

Attempt and Evidence are separate append-only domain fact sets. Phase 4 does not add an outbox/worker only to connect them.

`SubmitAttemptInput.attemptId` is the idempotency key.

### Replay rules

1. If Attempt ID is new, grade and append normally.
2. If Attempt exists, `sessionId`, `itemId`, `answerText`, and `retryOfAttemptId` must exactly match the original request.
3. Mismatch is an idempotency conflict.
4. Replay `now` is ignored for an existing Attempt; historical timestamps remain immutable.
5. If matching Attempt exists but stable Evidence ID is missing, recreate the exact Evidence from stored Attempt/item and append it.
6. If both facts exist, return existing Attempt without another write.

Crash example:

```text
append Attempt ✓
process crash
append Evidence ✗
```

Replay repairs only the missing Evidence.

If a Neon implementation later optimizes this into one transaction, the public replay semantics remain unchanged.

---

## 20. Persistence extension

Phase 4 adds four durable fact tables:

```text
practice_sessions
practice_items
practice_hint_reveals
attempts
```

### practice_sessions

- `id` PK
- `student_id` FK → students
- `lesson_id` FK → daily_lessons
- `objective_id`
- `policy_version`
- `created_at`
- unique `(lesson_id, objective_id)`

### practice_items

- `id` PK
- `session_id` FK → practice_sessions
- `student_id` FK → students
- `objective_id`
- `sequence`
- `difficulty_band`
- `problem_spec` JSONB
- `prompt`
- `answer_spec` JSONB
- `hint` nullable
- `solution_outline` JSONB
- `generator`
- `generator_version`
- `created_at`
- unique `(session_id, sequence)`

### practice_hint_reveals

- `id` PK
- `session_id` FK → practice_sessions
- `item_id` FK → practice_items
- `student_id` FK → students
- `revealed_at`
- unique `(student_id, item_id)`

### attempts

- `id` PK
- `session_id` FK → practice_sessions
- `item_id` FK → practice_items
- `student_id` FK → students
- `objective_id`
- `answer_text`
- `outcome`
- `hint_used`
- `retry_of_attempt_id` nullable self-FK
- `grading_policy_version`
- `submitted_at`
- `recorded_at`
- unique `retry_of_attempt_id` for non-null values, preventing branching retry children
- index `(item_id, submitted_at, id)`
- index `(student_id, objective_id, submitted_at, id)`

PostgreSQL permits multiple NULL values in a unique index, so first Attempts remain unaffected while each parent Attempt can have at most one retry child.

### Deliberately absent

No Phase 4 migration adds:

- mastery/readiness columns or tables;
- mutable practice status;
- mistakes;
- practice-performance summary;
- ability score;
- copied curriculum objective truth.

---

## 21. Migration discipline

- update Drizzle schema in source control;
- generate incremental SQL with Drizzle Kit after Phase 3 `0000_old_bushwacker.sql`;
- commit SQL + Drizzle metadata;
- no startup migration;
- no Preview migration against Production;
- no real `db:migrate` during ordinary implementation;
- live repository contract tests require explicit non-production `TEST_DATABASE_URL`;
- Production migration remains a separate activation gate.

---

## 22. Validation / fail-closed behavior

Reject:

- unknown student/session/lesson/item/objective/attempt;
- objective not on lesson;
- P2 student targeting P3 objective;
- `BLOCKED` practice target;
- unsupported deterministic generator;
- malformed problemSpec/AnswerSpec/item;
- answer-key leakage through student projection;
- duplicate conflicting IDs;
- hint reveal for item without hint;
- retry of correct Attempt;
- retry across different student/session/item/objective;
- stale/branching retry provenance;
- causal timestamp violations;
- renderer output that violates locked render contract.

Unsupported practice is an explicit product limitation, not a reason to fall back to unrestricted AI.

---

## 23. Acceptance scenarios

### A. P2 independent correct

Supported FOUNDATION/CORE item, no hint, first deterministic correct submission → `independent_correct` Evidence.

### B. Correct with hint

Server records HintReveal before correct submission → Attempt snapshots `hintUsed=true` → `correct_with_hint`.

### C. Incorrect

Wrong answer → immutable `INCORRECT` Attempt → `incorrect` Evidence.

### D. Incorrect → retry → correct

Original Attempt/Evidence remain; retry references latest incorrect Attempt; final correct retry → `corrected`, never `independent_correct`.

### E. P3 application correct

Independent correct APPLICATION/CHALLENGE item → `application_correct`.

### F. Submission replay / repair

Same Attempt ID and same command → no duplicate Attempt/Evidence; simulated missing Evidence is repaired.

### G. Unsupported objective

Explicit rejection; no AI fallback; no partial session/items.

### H. Renderer failure

Generator succeeds but optional renderer fails → no persisted session/items.

### I. Authority isolation

Client cannot submit outcome, hintUsed, objective, timestamps, Evidence type, Mastery or Readiness.

### J. Answer confidentiality

Student projection exposes no AnswerSpec, solution outline, or hidden hint before reveal.

### K. Session idempotency

Repeated create for same lesson/objective returns immutable existing session and does not regenerate under a new policy/generator version.

### L. Retry branching blocked

After a retry child exists, a second child of the same parent is rejected by service and durable uniqueness.

---

## 24. Testing strategy

### Unit

- all domain validation;
- blueprint policy table;
- problemSpec → AnswerSpec correctness for each supported generator family;
- each AnswerSpec grader;
- HintReveal derivation;
- retry rules;
- Attempt → Evidence precedence;
- student projection strips answer key;
- unsupported generator fail-closed behavior.

### Repository contracts

Same contract suite against:

- `MemoryPracticeRepository` always;
- `NeonPracticeRepository` only with explicit `TEST_DATABASE_URL`.

`LearningStateRepository.getEvidence` contract is added to both memory and Neon adapters.

### Integration / E2E

Use real P1 objectives, P2 learning-state projection, and P3 DailyLesson contracts. E2E must not mutate Mastery directly.

---

## 25. Implementation slices after spec approval

1. **P4-0 — Phase 3 status cleanup + core practice contracts**
2. **P4-1 — PracticePreparationContext**
3. **P4-2 — deterministic blueprint policy**
4. **P4-3 — structured deep-slice item generators**
5. **P4-4 — deterministic grader + HintReveal + retry provenance**
6. **P4-5 — Attempt → Evidence + idempotent repair**
7. **P4-6 — PracticeRepository + memory adapter**
8. **P4-7 — Neon/Drizzle schema + generated migration + adapter**
9. **P4-8 — PracticeService orchestration**
10. **P4-9 — optional safe renderer/explanation boundary**
11. **P4-10 — P2/P3 E2E, boundary audit and closeout**

P4-0 also corrects the stale `.agent/CURRENT.md` top-line `Completed (PR pending)` left by Phase 3 closeout. It does not deserve a separate PR.

---

## 26. Final design checklist

1. Attempt is immutable.
2. Wrong Attempt is never overwritten by later success.
3. Hint use is server-observed, not client-declared.
4. Retry provenance is linear and validated.
5. Grading is deterministic for Evidence-producing items.
6. Every Evidence-producing item has durable structured problem truth plus code-derived AnswerSpec.
7. AI cannot own objective, math structure, answer key, grade or Evidence.
8. `explained_independently` is not auto-produced by AI semantic grading.
9. Evidence ID is stable per Attempt and replay-safe.
10. Mastery/Readiness remain Phase 2 derived projections.
11. PracticeSession is one objective only and creation is idempotent.
12. Unsupported objectives fail closed.
13. Initial generator coverage is deliberately limited to deep slices.
14. Answer keys/hints are hidden before their allowed disclosure point.
15. Practice persistence stores immutable facts, not mutable learning summaries.
16. Mistake stays Phase 6.
17. Homework OCR stays Phase 5.
18. Adaptive scoring stays Phase 7.
19. Real database migration remains an explicit activation gate.

---

## 27. Decision summary

> **Structured practice owns mathematical truth; PracticeItem records the trusted problem; Attempt records what happened; deterministic code grades it; a pure projection turns immutable history into Evidence; AI may improve explanation but never owns learning-state facts.**

This preserves the Phase 1–3 authority model while adding the first real student-practice loop without creating a second source of truth for Mastery or prematurely implementing Mistake/adaptive-learning infrastructure.
