# MathMagics Phase 6 — Correction + Mistake Book Design

**Status:** Approved design, pending written-spec review  
**Date:** 2026-08-25  
**Phase:** 6  
**Product scope:** Singapore Math home-education AI learning system, P2/P3 V1

## 1. Goal

Phase 6 completes the `Correct` stage of the MathMagics loop:

`Incorrect Attempt → Mistake episode → diagnosis → correction → independent reasoning → isomorphic transfer → resolved`

A `Mistake` is a durable learning-problem episode layered on top of the canonical immutable `Attempt` and append-only `EvidenceRecord` ledgers. It is not a screenshot collection, not a second Attempt ledger, and not mutable mastery state.

Phase 6 must make it possible to answer, from auditable facts:

- what the student got wrong;
- what learning problem the error belongs to;
- how the diagnosis became authoritative;
- what correction work occurred;
- whether the original error was corrected;
- whether the student independently demonstrated the reasoning;
- whether the student transferred the same method to a new isomorphic problem;
- whether the episode is resolved;
- whether the same problem later recurs.

AI may explain, ask Socratic questions, and propose a diagnosis from an allowed taxonomy when deterministic rules cannot uniquely decide. AI never owns grades, diagnosis truth, Evidence types, Mistake state, transfer assessment truth, Mastery, or Readiness.

## 2. Architectural Principles

1. Curriculum truth remains version-controlled Phase 1 data.
2. Learning history remains append-only `EvidenceRecord` data.
3. Mastery/readiness remain deterministic projections.
4. Mathematical truth remains code-owned `PracticeProblemSpec + AnswerSpec`.
5. There is one canonical `Attempt` ledger. Phase 6 adds `CORRECTION` as a third source.
6. `Mistake` tracks a learning-problem episode, not a single wrong Attempt.
7. Mistake lifecycle is projected from immutable facts/events; no mutable `mistake.state` is authoritative.
8. Every definite canonical `INCORRECT` Attempt triggers Mistake observation.
9. Deterministic diagnosis auto-confirms only when exactly one supported target is proven.
10. Uncertain AI diagnosis is a constrained candidate only and requires Student/Parent confirmation.
11. AI cannot invent misconception IDs or arbitrary diagnosis labels.
12. Correction grading, reasoning checks, and transfer grading are deterministic and code-owned.
13. `RESOLVED` requires all three: corrected original problem, independent reasoning, successful unassisted isomorphic transfer.
14. Unsupported reasoning/transfer structures fail closed and remain `CORRECTING`.
15. Phase 6 exposes correction backlog and misconception history but does not change automatic weekly planning. Adaptation remains Phase 7.
16. Phase 6 implementation may generate a migration but must not run production migrations.

## 3. Scope

### In scope

- Practice and Homework `INCORRECT` Attempt observation.
- `OBSERVED → CONFIRMED → CORRECTING → RESOLVED` Mistake lifecycle.
- Curriculum misconception taxonomy reuse.
- Small code-owned generic diagnosis taxonomy.
- Deterministic diagnosis plus constrained AI candidates.
- Student/Parent diagnosis confirmation when rules are not decisive.
- Guided Socratic correction.
- Original-problem retry through canonical `CORRECTION` Attempts and existing `gradeAnswer()`.
- Code-owned structured reasoning checks.
- Deterministic isomorphic transfer generation.
- Existing `corrected`, `explained_independently`, and `application_correct` Evidence types.
- Mistake recurrence and misconception aggregation projections.
- Memory + Neon persistence and replay repair.
- P2/P3 Practice/Homework end-to-end correction flows.

### Out of scope

- Automatic insertion of `CORRECTION` lessons into weekly plans.
- Next Best Lesson, adaptive difficulty, ability scores, misconception probability scores, or spaced repetition.
- Broad dashboard redesign.
- Multi-household identity.
- Homework PDF/multi-image expansion or durable image storage.
- AI grading, AI free-form explanation scoring, or arbitrary AI transfer questions.
- Free-form AI-created diagnosis taxonomy.
- Queue/worker, Redis, vector DB, object storage, push notifications, teacher messaging.
- Production migration/deployment.

## 4. Mistake Episode Semantics

### 4.1 Tracking unit

The logical episode key is:

`student × objective × confirmed diagnosis target × occurrence episode`

Related wrong Attempts can link to the same unresolved episode. Once an episode is `RESOLVED`, a later matching error creates a new episode; the old episode is never reopened.

### 4.2 Observation

`observeIncorrectAttempt(attemptId)`:

1. loads the canonical Attempt;
2. requires `outcome = INCORRECT`;
3. resolves the trusted source problem;
4. runs deterministic diagnosis;
5. finds a compatible unresolved episode when one can be identified safely;
6. otherwise creates an `OBSERVED` episode;
7. links the Attempt and appends observation history idempotently;
8. auto-confirms only an exactly-one deterministic diagnosis.

The client does not supply authoritative student ID, objective ID, outcome, diagnosis target, Evidence type, or Mistake state.

### 4.3 Public lifecycle

```ts
export type MistakeState =
  | 'OBSERVED'
  | 'CONFIRMED'
  | 'CORRECTING'
  | 'RESOLVED';
```

Projection rules:

- `OBSERVED`: wrong Attempt exists, authoritative diagnosis does not.
- `CONFIRMED`: exactly one diagnosis target is authoritative.
- `CORRECTING`: correction has started but the hard resolution gate is incomplete.
- `RESOLVED`: all resolution requirements are satisfied.

`MISTAKE_RESOLVED` is a deterministic receipt appended after projection succeeds. It cannot force resolution.

### 4.4 Provisional diagnosis consolidation

An uncertain observation may initially belong to a provisional `UNKNOWN` episode. If later human confirmation resolves that observation to a target that already has an unresolved canonical episode, confirmation must not leave two active canonical episodes for the same key.

The service transaction must:

1. link the relevant observation Attempt(s) to the existing canonical episode idempotently;
2. append `MISTAKE_CONSOLIDATED` to the provisional episode with `canonicalMistakeId`;
3. canonicalize query results so the provisional episode is an audit alias, not a second active learning problem.

`MISTAKE_CONSOLIDATED` is internal audit plumbing, not a fifth public lifecycle state.

## 5. Diagnosis Taxonomy

### 5.1 Curriculum targets

Primary targets are the existing Phase 1 misconception IDs referenced by each objective's `misconceptionIds`, such as:

- `MIS-MD-GROUP-SIZE`
- `MIS-MD-SHARING-ONLY`
- `MIS-MD-INVERSE`
- `MIS-MD-FACT-RETRIEVAL`
- `MIS-FRA-DENOMINATOR-SIZE`
- `MIS-FRA-NUMERATOR-ONLY`
- `MIS-FRA-EQUIVALENCE-ONE-SIDE`
- `MIS-FRA-PART-SIZE-COUNT`

Phase 6 does not create a second misconception catalog.

### 5.2 Generic targets

```ts
type GenericDiagnosisCode =
  | 'FACT_ERROR'
  | 'PROCEDURE_ERROR'
  | 'REPRESENTATION_ERROR'
  | 'UNKNOWN';

export type DiagnosisTarget =
  | { kind: 'MISCONCEPTION'; misconceptionId: string }
  | { kind: 'GENERIC'; code: GenericDiagnosisCode };
```

Allowed targets for an objective are:

`objective.misconceptionIds + supported generic targets`

Neither AI nor client input may create targets outside that set.

## 6. Diagnosis Authority

### 6.1 Deterministic diagnosis

`lib/correction/diagnosis.ts` receives trusted objective/problem/answer/student-answer/grading/curriculum facts.

- zero supported targets → remain `OBSERVED`;
- exactly one proven target → append authoritative `DIAGNOSIS_CONFIRMED` automatically;
- multiple targets → remain `OBSERVED`.

No heuristic “best guess” becomes authoritative automatically.

### 6.2 Constrained AI candidate

When deterministic rules cannot uniquely decide, a narrow provider may receive:

```ts
interface MistakeDiagnosisContext {
  objectiveId: string;
  allowedTargets: DiagnosisTarget[];
  problemDescription: string;
  studentAnswer: string;
  deterministicObservations: string[];
}

interface DiagnosisCandidate {
  target: DiagnosisTarget;
  rationale: string;
}
```

The adapter rejects targets outside `allowedTargets`.

AI candidate output may be stored for audit/display, but it cannot:

- change Mistake state;
- create curriculum taxonomy;
- create Evidence;
- select Mastery/Readiness;
- start correction.

Student/Parent confirmation is required for an AI-proposed target.

### 6.3 Human confirmation

`confirmDiagnosis(...)` accepts only a server-validated allowed target/candidate for an `OBSERVED` Mistake. Arbitrary misconception IDs/free text are rejected. Confirmation is append-only history; original observation facts are never overwritten.

## 7. Trusted Attempt Problem Resolver

Phase 6 starts from Attempts, which do not contain full problem truth. Add:

```ts
interface AttemptProblemResolver {
  resolve(attempt: Attempt): Promise<TrustedAttemptProblem>;
}
```

### Practice

`PRACTICE(sessionId,itemId)` resolves the immutable `PracticeItem` and validates student/objective/source coordinates.

### Homework

`HOMEWORK(submissionId,problemId)` resolves immutable extraction plus confirmations, then reruns Phase 5 deterministic conversion/objective mapping to reconstruct trusted `PracticeProblemSpec + AnswerSpec`.

The resolver never trusts a provider answer key, infers the problem from `Attempt.answerText`, re-invokes AI for math truth, or requires the original image.

If trusted source truth cannot be uniquely reconstructed, correction fails closed.

## 8. Canonical Attempt Extension

```ts
type AttemptSource =
  | { kind: 'PRACTICE'; sessionId: string; itemId: string }
  | { kind: 'HOMEWORK'; submissionId: string; problemId: string }
  | { kind: 'CORRECTION'; mistakeId: string; correctionItemId: string };
```

There remains one `Attempt` type/table.

For the first original correction retry:

`retryOfAttemptId = original incorrect Attempt id`

If retry is wrong, the next retry points to the immediately previous Correction Attempt. The existing one-child-per-parent constraint therefore remains a linear chain.

`hintUsed` remains server-observed.

## 9. Correction Items

```ts
type CorrectionItemKind = 'ORIGINAL_RETRY' | 'TRANSFER';

interface CorrectionItem {
  id: string;
  mistakeId: string;
  studentId: string;
  objectiveId: string;
  kind: CorrectionItemKind;
  sourceAttemptId: string;
  transferRound?: number;
  problemSpec: PracticeProblemSpec;
  answerSpec: AnswerSpec;
  prompt: string;
  hint?: string;
  solutionOutline: string[];
  generator: string;
  generatorVersion: string;
  createdAt: string;
}
```

### Original retry

One canonical `ORIGINAL_RETRY` item exists per Mistake. Its math truth comes from `AttemptProblemResolver`. Repeated wrong correction Attempts may form a linear retry chain on that item.

### Transfer

`TRANSFER` items come only from deterministic isomorphic generation. They preserve:

- objective ID;
- `PracticeProblemSpec.kind`;
- semantic structure;
- operation semantics;
- code-owned answer derivation.

Only safe parameters/surface wording change.

A client cannot refresh until it gets a favorable question or choose random seeds. There is at most one active transfer item at a time.

If the first Attempt on a transfer item is wrong, that item is consumed and can never satisfy the transfer gate through later guessing. After further correction/reasoning, the server may create the next deterministic transfer round with new safe parameters. Only the first Attempt on a transfer item can qualify as independent transfer success.

Unsupported transfer families fail closed; no AI fallback.

## 10. Guided Correction AI Boundary

A narrow interface may prepare teaching language:

```ts
interface CorrectionTeachingProvider {
  prepareGuidance(context: TrustedCorrectionContext): Promise<CorrectionGuidance>;
}
```

Trusted context is code-built from confirmed diagnosis, trusted original problem, original student answer, curriculum strategies/representations, and reasoning checkpoints.

AI output may contain diagnosis explanation, Socratic prompts, and worked explanation wording.

AI cannot return authoritative objective ID, diagnosis target, ProblemSpec, AnswerSpec, correct answer, grade, Evidence type, Mistake state, resolution result, or transfer structure. A field equivalent to `studentUnderstands: true` has no trusted-domain role.

## 11. Original Correction Retry

`startCorrection(mistakeId)` requires `CONFIRMED`, appends `CORRECTION_STARTED`, creates/returns the stable original-retry item, and may prepare guidance.

`submitCorrectionRetry(...)`:

1. loads trusted Mistake/CorrectionItem;
2. validates student/objective/source coordinates;
3. calls existing deterministic `gradeAnswer()`;
4. appends one canonical `CORRECTION` Attempt;
5. links it to the Mistake;
6. if correct, appends/repairs deterministic `corrected` Evidence;
7. if wrong, leaves the Mistake `CORRECTING` and allows the next linear retry.

AI never grades.

`corrected` may follow earlier Socratic guidance. It means the concrete observed error was corrected, not that independent understanding is proven.

## 12. Structured Independent Reasoning

`explained_independently` must not depend on AI scoring free-form prose.

Code-owned `ReasoningCheckSpec` checkpoints may verify, for example:

- total / group count / group size;
- inverse multiplication/division relation;
- common whole in fraction comparison;
- denominator / part-size relationship;
- equivalent-fraction component relationships.

Responses use deterministic forms such as choice, structured fill-in, ordering, or exact numeric/fraction relations.

AI may render prompts naturally but cannot alter expected structure/pass rules.

A reasoning submission is immutable. `assisted` is server-observed for the reasoning check itself; earlier correction teaching does not automatically disqualify a later independent check. If check-specific help is revealed, that submission is assisted.

`explained_independently` is emitted only when all required checks for the policy version have qualifying `PASS` submissions with `assisted = false` for the same Mistake/objective.

Failed/assisted submissions remain historical facts. If no safe structured reasoning policy exists, remain `CORRECTING`.

## 13. Isomorphic Transfer

```ts
interface CorrectionTransferGenerator {
  supports(objectiveId: string, problemSpec: PracticeProblemSpec): boolean;
  generate(context: TrustedTransferContext): CorrectionItem;
}
```

It is separate from ordinary Practice sequencing because ordinary slots do not guarantee isomorphism with the original error.

Transfer preparation requires both:

- `corrected` Evidence;
- `explained_independently` Evidence.

A transfer success qualifies only when:

- source is `CORRECTION`;
- item kind is `TRANSFER`;
- Mistake/objective coordinates match;
- this is the item's first Attempt;
- outcome is `CORRECT` by `gradeAnswer()`;
- `hintUsed = false`.

Qualifying success emits existing `application_correct` Evidence with `origin.kind = CORRECTION`. Phase 6 adds no `transfer_correct` Evidence type.

## 14. Evidence Policy

Phase 6 activates the already-reserved origin:

```ts
origin: { kind: 'CORRECTION', refId: ... }
```

Use stable source-aware identities:

- `corrected`: bound to the qualifying ORIGINAL_RETRY Attempt;
- `explained_independently`: bound to Mistake + reasoning policy/version;
- `application_correct`: bound to the qualifying TRANSFER Attempt.

Exact ID strings may follow existing repository conventions, but must be deterministic and replay-safe.

**Locked V1 rule:** unsuccessful `CORRECTION` Attempts do **not** emit additional `incorrect` Evidence. They remain fully durable canonical Attempts and MistakeAttemptLinks. The original Practice/Homework error already produced `incorrect` Evidence; emitting more `incorrect` Evidence for repeated correction failures would inflate the mastery ledger with repeated observations from one correction episode.

This does not hide failures. Phase 7 can inspect the canonical correction Attempt history and Mistake recurrence/progress facts separately from the Evidence ledger.

## 15. Resolution Projection

Hard rule:

```text
CORRECTION corrected Evidence
AND
CORRECTION explained_independently Evidence
AND
qualifying first-attempt, no-hint transfer success
→ RESOLVED
```

Conceptually:

```ts
isResolved(mistake) =
  hasCorrectionEvidence(mistake, 'corrected') &&
  hasCorrectionEvidence(mistake, 'explained_independently') &&
  hasQualifyingTransferSuccess(mistake);
```

All facts must belong to the same Mistake/objective.

Never sufficient by itself:

- AI rationale;
- a user “resolved” click;
- original retry correct without reasoning;
- reasoning pass without original correction;
- transfer correct with hint;
- later correct retry on a transfer item whose first Attempt was wrong;
- unsupported transfer family.

A deterministic resolution projector appends/repairs `MISTAKE_RESOLVED` after the hard gate passes.

## 16. Lifecycle Events

Core append-only events:

- `MISTAKE_OBSERVED`
- `ATTEMPT_LINKED`
- `DIAGNOSIS_CANDIDATE_RECORDED`
- `DIAGNOSIS_CONFIRMED`
- `CORRECTION_STARTED`
- `GUIDANCE_PREPARED`
- `MISTAKE_CONSOLIDATED` (internal canonicalization only)
- `MISTAKE_RESOLVED`

Reasoning submissions and CorrectionItems are already durable facts and need not be duplicated as events.

## 17. Persistence

Phase 6 adds five tables and extends `attempts`.

### `mistakes`

- `id` PK
- `student_id` FK
- `objective_id`
- `initial_attempt_id` FK → attempts
- `initial_diagnosis_target` JSON
- `diagnosis_policy_version`
- `first_observed_at`
- `created_at`

No mutable state column. Initial target may be deterministic or provisional `UNKNOWN`; authoritative confirmation comes from events.

### `mistake_attempt_links`

- `mistake_id` FK
- `attempt_id` FK
- `role`: `OBSERVATION | CORRECTION_RETRY | TRANSFER`
- `linked_at`
- unique `(mistake_id, attempt_id)`

### `mistake_events`

- `id` PK
- `mistake_id` FK
- `type`
- structured `payload` JSON
- `actor_kind`
- `policy_version`
- `occurred_at`

### `correction_items`

- `id` PK
- `mistake_id` FK
- `student_id` FK
- `objective_id`
- `kind`: `ORIGINAL_RETRY | TRANSFER`
- `source_attempt_id` FK
- optional `transfer_round`
- `problem_spec` JSON
- `answer_spec` JSON
- `prompt`
- optional `hint`
- `solution_outline` JSON
- `generator`
- `generator_version`
- `created_at`

One original item per Mistake. At most one active transfer item per Mistake/round.

### `correction_reasoning_checks`

Each row is one immutable submitted reasoning fact:

- `id` PK
- `mistake_id` FK
- `student_id` FK
- `objective_id`
- `check_spec` JSON
- `response` JSON
- `outcome`: `PASS | FAIL`
- `assisted` boolean (server-observed)
- `policy_version`
- `submitted_at`
- `recorded_at`

### `attempts` extension

Add nullable:

- `correction_mistake_id` FK → mistakes
- `correction_item_id` FK → correction_items

Update the DB CHECK to require exactly one source coordinate shape:

- `PRACTICE`: Practice coordinates non-null; Homework/Correction null.
- `HOMEWORK`: Homework coordinates non-null; Practice/Correction null.
- `CORRECTION`: Correction coordinates non-null; Practice/Homework null.

Existing PRACTICE/HOMEWORK rows remain semantically unchanged.

## 18. Repository and Module Boundaries

New storage-agnostic domain:

```text
lib/correction/
  types.ts
  validation.ts
  diagnosis.ts
  projection.ts
  evidence.ts
  reasoning.ts
  transfer.ts
  problem-resolver.ts
  service.ts
  repository.ts
  memory-repository.ts
  index.ts
```

`lib/correction` must not import Drizzle/Neon, Next.js request objects, or provider SDKs. Provider adapters stay under `lib/providers`; Neon adapters stay under `lib/persistence`.

Repository operations append/read facts. It must not expose `setMistakeState`, imperative `markResolved`, `updateDiagnosis`, Evidence update/delete, or mutable Mastery/Readiness setters.

Representative repository surface:

```ts
interface MistakeRepository {
  appendMistake(mistake: Mistake): Promise<void>;
  findMistake(id: string): Promise<Mistake | null>;
  findOpenEpisode(studentId: string, objectiveId: string, target: DiagnosisTarget): Promise<Mistake | null>;
  appendAttemptLink(link: MistakeAttemptLink): Promise<void>;
  listAttemptLinks(mistakeId: string): Promise<MistakeAttemptLink[]>;
  appendEvent(event: MistakeEvent): Promise<void>;
  listEvents(mistakeId: string): Promise<MistakeEvent[]>;
  appendCorrectionItem(item: CorrectionItem): Promise<void>;
  listCorrectionItems(mistakeId: string): Promise<CorrectionItem[]>;
  appendReasoningCheck(check: CorrectionReasoningCheck): Promise<void>;
  listReasoningChecks(mistakeId: string): Promise<CorrectionReasoningCheck[]>;
}
```

## 19. Service Flow

Recommended V1 actions:

```ts
observeIncorrectAttempt(...)
confirmDiagnosis(...)
startCorrection(...)
submitCorrectionRetry(...)
submitReasoningCheck(...)
prepareTransfer(...)
submitTransferAttempt(...)
getMistake(...)
listOpenMistakes(...)
getMisconceptionSummary(...)
```

Key authority rules:

- observation takes canonical `attemptId`, not client-supplied learning facts;
- confirmation selects from server-validated targets only;
- start correction requires `CONFIRMED`;
- correction/transfer grading always calls `gradeAnswer()`;
- reasoning validation is code-owned;
- transfer generation is deterministic/fail-closed;
- every write path is replay-safe.

## 20. State and Misconception Projections

`projectMistakeState(...)` is pure deterministic code over Mistake identity, events, linked Attempts, CorrectionItems, reasoning facts, and CORRECTION Evidence.

Misconception summary is also derived, not a mutable analytics table. For each student/confirmed target derive:

- active episode count;
- resolved episode count;
- recurrence count;
- linked incorrect observation count;
- first/last observed timestamps.

One wrong answer is a real observation but is not proof of a stable misconception probability.

## 21. Student / Parent Experience

Student-facing actions use learning language rather than internal enum names. The fixed V1 flow is:

1. review error;
2. receive Socratic guidance;
3. retry original problem;
4. complete structured independent reasoning;
5. complete deterministic isomorphic transfer;
6. finish only after all hard gates pass.

Homework correction displays trusted structured reconstruction, not a source image that Phase 5 did not retain.

Parent/Tutor projections group learning problems into Active, Resolved, and Recurring, with curriculum/generic diagnosis context and episode counts. This is automatic projection, not manual screenshot collection.

## 22. Recurrence

- New matching incorrect Attempt while a confirmed episode is unresolved → link to that episode.
- Matching incorrect Attempt after prior episode is `RESOLVED` → create a new episode.
- Old resolved episode is never reopened.

This makes recurrence mean: “the problem met the Phase 6 resolution gate and later reappeared.”

## 23. Idempotency and Replay Repair

Stable identities/constraints must cover at least:

- observation Attempt/Mistake link;
- one original-retry item per Mistake;
- one active transfer item per Mistake/round;
- idempotent Attempt submit command;
- `corrected` Evidence;
- `explained_independently` Evidence;
- `application_correct` transfer Evidence;
- `MISTAKE_RESOLVED` receipt.

Repeated identical commands return/reconstruct existing results; conflicting ID reuse fails closed.

Replay repair must handle:

- Attempt written but Mistake link missing;
- Attempt/link written but qualifying Evidence missing;
- qualifying transfer Evidence written but resolution receipt missing.

Use transactions where possible, deterministic IDs/reconciliation as the second line of defense.

## 24. Recommended Transaction Boundaries

### Observation

- Mistake creation when needed;
- initial Attempt link;
- `MISTAKE_OBSERVED`;
- deterministic auto-confirm when applicable.

### Successful original retry

- Correction Attempt;
- MistakeAttemptLink;
- `corrected` Evidence.

### Successful transfer

- Correction Attempt;
- MistakeAttemptLink;
- `application_correct` Evidence;
- possible `MISTAKE_RESOLVED` receipt.

Partial historical writes remain replay-repairable.

## 25. Migration

Generate and commit one new Drizzle migration, expected `migrations/0003_*.sql`.

It must:

- create the five Phase 6 tables;
- add Correction coordinates to `attempts`;
- replace the two-source Attempt CHECK with the three-source exclusive CHECK;
- preserve existing PRACTICE/HOMEWORK rows;
- add required FKs/indexes/uniqueness constraints;
- contain no mutable Mistake state column;
- contain no raw Homework image bytes/URLs;
- avoid destructive Attempt-ledger rebuilds where schema alteration suffices.

Do not run production migration during Phase 6 development. Live Neon contracts require explicit `TEST_DATABASE_URL` and never fall back to production `DATABASE_URL`.

## 26. Fail-Closed Matrix

| Condition | Required behavior |
| --- | --- |
| Attempt missing or not `INCORRECT` | reject observation |
| student/objective/source mismatch | reject |
| trusted source problem cannot be resolved | reject/fail closed |
| deterministic diagnosis yields multiple targets | remain `OBSERVED` |
| AI target outside allowed taxonomy | reject candidate |
| unconfirmed diagnosis starts correction | reject |
| CorrectionItem answer truth invalid/missing | reject |
| AI claims grade/understanding | no authority |
| reasoning policy unsupported | remain `CORRECTING` |
| reasoning submission fails | remain `CORRECTING` |
| reasoning submission assisted | cannot qualify for independent Evidence |
| transfer generator unsupported | remain `CORRECTING` |
| transfer first Attempt wrong | consume item; remain `CORRECTING` |
| transfer uses hint | cannot satisfy transfer gate |
| later retry on failed transfer becomes correct | does not qualify as independent transfer |
| only `corrected` exists | remain `CORRECTING` |
| corrected + explanation but no qualifying transfer | remain `CORRECTING` |
| client asks to mark resolved | no authority |

## 27. Acceptance Matrix

Implementation follows TDD.

### Contracts / persistence

Verify:

- DiagnosisTarget/taxonomy validation;
- event/CorrectionItem/reasoning contracts;
- three-source Attempt exclusivity;
- five new Phase 6 tables;
- append-only repository surface;
- no `mistake_state` column;
- no raw-image persistence;
- safe existing PRACTICE/HOMEWORK rows;
- idempotency constraints;
- explicit live-test DB gate.

### Diagnosis

Verify:

- unique deterministic misconception auto-confirms;
- zero/multiple deterministic targets remain `OBSERVED`;
- allowed AI candidate remains non-authoritative;
- out-of-taxonomy AI target rejected;
- human confirmation required for AI candidate;
- provisional UNKNOWN consolidation cannot create duplicate active canonical episodes.

### Original correction

Verify:

- Practice problem resolution;
- Homework reconstruction through Phase 5 deterministic path;
- deterministic grading;
- wrong correction retry remains canonical/immutable and emits no duplicate `incorrect` Evidence;
- linear retry provenance;
- correct retry emits exactly one `corrected` Evidence;
- replay repairs missing Evidence without a second Attempt.

### Reasoning

Cover representative P2/P3 structures including equal groups, inverse multiplication/division, fraction denominator/part-size, and fraction equivalence. Verify PASS/FAIL, server-observed assistance, unsupported fail-closed behavior, and exactly-once `explained_independently`.

### Transfer

Verify:

- same objective/kind/semantic structure/operation;
- safe parameter change;
- trusted AnswerSpec derivation;
- no AI fallback;
- unsupported fail closed;
- first-attempt correct/no-hint emits `application_correct`;
- first-attempt wrong consumes item;
- later correct retry on that item does not qualify;
- next round is deterministic/server-controlled.

### End-to-end

At minimum:

1. P3 fraction Practice error → deterministic misconception → auto-confirm → correction → reasoning → transfer → resolved.
2. Phase 5 Homework incorrect Attempt → trusted reconstruction → full correction → resolved.
3. Uncertain diagnosis → AI constrained candidate → human confirmation required.
4. Repeated matching errors before resolution → one active episode with multiple observation links.
5. Matching error after resolution → new episode; old episode stays resolved.
6. Correction retry wrong → immutable CORRECTION Attempt, no `corrected`, no extra `incorrect` Evidence.
7. Reasoning fail → remains `CORRECTING`.
8. Transfer fail → remains `CORRECTING`; failed item cannot later qualify through guessing.
9. Unsupported transfer → no AI fallback, no resolution.
10. Replay repair → missing Evidence/resolution receipt repaired exactly once.

### Static authority audit

No production path equivalent to:

- `setMistakeState`;
- imperative resolution bypass;
- `aiGradeCorrection`;
- `aiStudentUnderstands`;
- AI-created misconception IDs;
- parallel CorrectionAttempt ledger/table;
- mutable Mastery/Readiness setters;
- arbitrary AI transfer fallback.

## 28. Completion Criteria

Phase 6 is complete only when:

1. Supported wrong Practice/Homework Attempts enter Mistake observation.
2. Deterministic diagnosis auto-confirms only unique supported targets.
3. AI diagnosis is taxonomy-constrained and cannot self-confirm.
4. Non-deterministic diagnosis requires Student/Parent confirmation.
5. Mistake lifecycle is projection-based and append-only.
6. Correction uses canonical CORRECTION Attempts and `gradeAnswer()`.
7. Failed correction Attempts do not inflate the Evidence ledger with duplicate `incorrect` Evidence.
8. Structured reasoning deterministically emits `explained_independently` exactly once.
9. Isomorphic transfer is deterministic/fail-closed and only first-attempt/no-hint success qualifies.
10. `RESOLVED` requires corrected + independent reasoning + qualifying transfer.
11. Resolved episodes never reopen; recurrence creates a new episode.
12. Misconception aggregation is deterministic projection.
13. Memory + Neon repositories, migration/schema tests, E2E, and replay repair pass.
14. No Phase 7 adaptation, AI grading, new infrastructure, or production migration is introduced.
15. Final implementation HEAD passes repo-level tests, typecheck, curriculum validation, lint, and production build, subject only to documented environment-specific Host gates.

## 29. Boundary After Phase 6

After Phase 6, MathMagics has a trusted loop through `Correct`:

`Plan → Learn → Practice/Homework → Attempt → Evidence → Mistake → Correct → Explain → Transfer → Resolve`

Phase 7 consumes these durable facts for `Track → Adapt`, including progress views and prerequisite-aware adaptive planning. Phase 7 must not weaken Phase 6 authority or resolution rules.
