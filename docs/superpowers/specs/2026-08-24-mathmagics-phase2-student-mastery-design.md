# MathMagics Phase 2 Student & Mastery Design

Status: Scheme A approved by Human Owner; written spec pending final review.

## 1. Goal

Phase 2 establishes the durable learning-state core that later planning, practice, homework, correction, and progress features depend on.

The central relationship is:

`Student × LearningObjective → derived Mastery`

Phase 2 must make that relationship trustworthy without introducing a production database or allowing AI to become a state authority.

The governing rule is:

> Evidence is immutable learning history. Mastery is a deterministic projection of that history.

## 2. Scope

Phase 2 includes:

- one active `StudentProfile` for the V1 household;
- a manual current-position assumption for initial setup;
- an append-only `EvidenceRecord` ledger;
- deterministic mastery calculation;
- deterministic `reviewDue` calculation for mastered objectives;
- prerequisite readiness queries using Phase 1 curriculum links;
- a storage-agnostic `LearningStateRepository` boundary;
- an in-memory repository implementation for tests and fixtures; and
- query APIs consumed by Phase 3 and later phases.

Phase 2 does not include:

- production persistence or database selection;
- authentication or multi-student UI;
- weekly/daily planning;
- lesson execution;
- `PracticeSession` or `Attempt` domain models;
- `Mistake` lifecycle management;
- homework image extraction or grading;
- AI-generated mastery decisions;
- progress dashboards; or
- adaptive lesson recommendations.

`Attempt` belongs to Phase 4. `Mistake` belongs to Phase 6. Phase 2 only preserves an evidence-origin contract that those later objects can reference without changing the mastery core.

## 3. Dependencies and Boundary with Phase 1

Phase 2 consumes the deterministic curriculum API created in Phase 1.

Existing curriculum interfaces remain authoritative for curriculum facts:

```ts
getLearningObjective(id: string): LearningObjective
listObjectivesForTopic(topicId: string): LearningObjective[]
getPrerequisites(objectiveId: string): LearningObjective[]
```

Phase 2 must not copy curriculum objective titles, prerequisite graphs, level membership, or teaching metadata into student state.

Student state stores objective IDs only. Curriculum facts continue to come from `lib/curriculum`.

Unknown curriculum IDs fail closed through the Phase 1 query boundary.

## 4. Domain Model

### 4.1 Student profile

```ts
export type StudentLevel = 'P2' | 'P3';
export type LearningMode = 'FOLLOW_SCHOOL' | 'STRUCTURED_HOME_LEARNING';

export interface StudentProfile {
  id: string;
  displayName: string;
  levelId: StudentLevel;
  learningMode: LearningMode;
  sessionsPerWeek: number;
  minutesPerSession: number;
  createdAt: string;
  updatedAt: string;
}
```

V1 supports one active student at the product level, but the domain uses a stable `studentId` so the core does not need redesign when multi-student support arrives.

Validation rules:

- `id` and `displayName` must be non-empty;
- `levelId` must be `P2` or `P3`;
- `sessionsPerWeek` must be an integer from 1 through 7;
- `minutesPerSession` must be a positive integer;
- timestamps must be valid ISO date-time strings; and
- `updatedAt` must not precede `createdAt`.

### 4.2 Current-position assumption

Manual setup position is an assumption, not learning evidence.

```ts
export interface CurrentPositionAssumption {
  studentId: string;
  levelId: StudentLevel;
  topicId?: string;
  objectiveId?: string;
  recordedAt: string;
  source: 'MANUAL_SETUP';
}
```

Rules:

- at least one of `topicId` or `objectiveId` is required;
- the referenced topic/objective must exist;
- the position must belong to the student's active level;
- when both fields exist, the objective must belong to the specified topic; and
- current position does not create mastery evidence by itself.

Later planning may combine this assumption with observed evidence. Observed evidence is more authoritative than setup assumptions when the two conflict.

### 4.3 Evidence

```ts
export type EvidenceType =
  | 'introduced'
  | 'incorrect'
  | 'correct_with_hint'
  | 'independent_correct'
  | 'corrected'
  | 'explained_independently'
  | 'application_correct';

export type EvidenceOriginKind =
  | 'SETUP'
  | 'LESSON'
  | 'PRACTICE'
  | 'HOMEWORK'
  | 'CORRECTION';

export interface EvidenceOrigin {
  kind: EvidenceOriginKind;
  refId?: string;
}

export interface EvidenceRecord {
  id: string;
  studentId: string;
  objectiveId: string;
  type: EvidenceType;
  observedAt: string;
  recordedAt: string;
  origin: EvidenceOrigin;
}
```

Evidence invariants:

1. Evidence is append-only. Phase 2 exposes no update or delete operation.
2. Evidence IDs are globally unique inside a repository.
3. The student must exist before evidence is appended.
4. The objective must exist in the Phase 1 curriculum dataset.
5. A P2 student may receive P2 evidence only.
6. A P3 student may receive P2 or P3 evidence so prerequisite remediation can be represented without changing the student's active level.
7. `observedAt` and `recordedAt` must be valid ISO date-time strings.
8. `recordedAt` must not precede `observedAt`; historical evidence import is represented by an earlier `observedAt` and a later recording time.
9. `origin.refId`, when present, must be non-empty.
10. AI may help interpret an interaction into an evidence type in later phases, but the stored evidence record is application data and AI has no separate mastery-write path.

### 4.4 Deterministic evidence ordering

Mastery calculation sorts evidence by:

1. `observedAt` ascending;
2. `recordedAt` ascending; and
3. `id` ascending.

This makes recomputation deterministic even when historical evidence is recorded later.

## 5. Mastery Model

### 5.1 States

```ts
export type MasteryState =
  | 'NOT_STARTED'
  | 'INTRODUCED'
  | 'DEVELOPING'
  | 'MASTERED';

export interface MasterySnapshot {
  studentId: string;
  objectiveId: string;
  state: MasteryState;
  reviewDue: boolean;
  evidenceCount: number;
  lastEvidenceAt: string | null;
}
```

`MasterySnapshot` is derived output. It is not persisted as an independent fact in Phase 2.

### 5.2 Evidence categories

For policy purposes:

```ts
const successfulEvidence = new Set([
  'correct_with_hint',
  'independent_correct',
  'corrected',
  'explained_independently',
  'application_correct',
]);

const independentEvidence = new Set([
  'independent_correct',
  'explained_independently',
  'application_correct',
]);

const higherOrderEvidence = new Set([
  'explained_independently',
  'application_correct',
]);
```

`introduced` and `incorrect` demonstrate exposure but not successful understanding.

### 5.3 State calculation

The policy is deliberately rule-based rather than score-based.

Evidence is evaluated in the deterministic order from Section 4.4. Mastery attainment is determined from ordered history prefixes, which makes mastery sticky without storing a mutable mastery field.

#### NOT_STARTED

No evidence exists for the student/objective pair.

#### INTRODUCED

Evidence exists, but there is no successful evidence yet.

Examples:

- one `introduced` record;
- one or more `incorrect` records; or
- `introduced` followed by `incorrect`.

#### DEVELOPING

At least one successful evidence record exists, but no ordered prefix has yet satisfied the `MASTERED` conditions.

A correct answer with a hint or a completed correction therefore demonstrates progress without being treated as independent mastery.

#### MASTERED

Scan the ordered evidence from oldest to newest. An objective first reaches mastery at the earliest history prefix where all of the following are true inside that prefix:

1. at least three `independentEvidence` records exist;
2. at least one of those records is `explained_independently` or `application_correct`; and
3. since the most recent `incorrect` record in that prefix, at least two `independentEvidence` records have occurred.

If the prefix contains no `incorrect` record, condition 3 is evaluated against the entire prefix.

Once any history prefix satisfies these three conditions, the objective's state is `MASTERED` for all later history. Later evidence cannot make that already-observed mastery event disappear.

This rule prevents a single lucky answer from producing mastery, requires at least one transfer/explanation signal, requires recovery after a pre-mastery incorrect response, and preserves attained mastery without a mutable state write.

The policy does not use percentages or hidden numeric scores.

### 5.4 Mastery is sticky; review is separate

The index of the earliest evidence prefix that first satisfies Section 5.3 is the mastery-attainment point.

After that point, `reviewDue` is derived independently.

`reviewDue = true` when:

- the objective has reached `MASTERED`;
- an `incorrect` record occurs after the mastery-attainment point; and
- fewer than two `independentEvidence` records occur after the most recent post-mastery incorrect record.

`reviewDue` returns to `false` after two independent evidence records following the latest post-mastery incorrect record.

A later incorrect record therefore never changes `state` back to `DEVELOPING`; it only creates a review signal until the student demonstrates two subsequent independent successes.

This separates long-term attainment from a signal that review is currently advisable.

### 5.5 Why mastery is not stored

Persisting a mutable mastery field would create competing authorities:

- the evidence ledger;
- a stored mastery value; and
- potentially AI or UI writes.

Phase 2 avoids that ambiguity. Given the same curriculum version and the same ordered evidence, the mastery result must always be identical.

A future persistence layer may cache snapshots for performance, but such a cache must remain disposable and recomputable from evidence.

## 6. Prerequisite Readiness

Readiness uses direct prerequisite links from Phase 1.

```ts
export type ReadinessState = 'READY' | 'NEEDS_SUPPORT' | 'BLOCKED';

export interface PrerequisiteStatus {
  objectiveId: string;
  mastery: MasteryState;
  reviewDue: boolean;
}

export interface ObjectiveReadiness {
  studentId: string;
  objectiveId: string;
  state: ReadinessState;
  ready: boolean;
  prerequisites: PrerequisiteStatus[];
  blockingPrerequisites: PrerequisiteStatus[];
}
```

Rules:

- an objective with no direct prerequisites is `READY`;
- all direct prerequisites `MASTERED` => `READY`;
- no prerequisite is `NOT_STARTED`, but one or more are `INTRODUCED` or `DEVELOPING` => `NEEDS_SUPPORT`;
- any prerequisite `NOT_STARTED` => `BLOCKED`;
- `ready` is `true` only for `READY`;
- `blockingPrerequisites` contains every direct prerequisite that is not `MASTERED`;
- `reviewDue` on an otherwise mastered prerequisite does not block readiness, but it remains visible to the caller.

Phase 2 readiness evaluates direct prerequisites only. Recursive prerequisite traversal is deferred until a planner demonstrates that it needs a transitive explanation path.

## 7. Repository Boundary

The domain is storage-agnostic from the beginning.

```ts
export interface LearningStateRepository {
  getStudent(studentId: string): Promise<StudentProfile | undefined>;
  saveStudent(student: StudentProfile): Promise<void>;

  getCurrentPosition(studentId: string): Promise<CurrentPositionAssumption | undefined>;
  setCurrentPosition(position: CurrentPositionAssumption): Promise<void>;

  appendEvidence(record: EvidenceRecord): Promise<void>;
  listEvidenceForStudent(studentId: string): Promise<EvidenceRecord[]>;
  listEvidenceForObjective(studentId: string, objectiveId: string): Promise<EvidenceRecord[]>;
}
```

Phase 2 provides `MemoryLearningStateRepository` only.

The interface is asynchronous even for the in-memory implementation so a later SQLite/Postgres/hosted persistence adapter does not force query API redesign.

Repository rules:

- `saveStudent` may replace profile configuration for the same student ID after validation;
- evidence append rejects duplicate evidence IDs;
- evidence values returned by the memory repository must not permit callers to mutate repository history accidentally;
- no evidence update/delete method exists; and
- repository code does not calculate mastery.

Production database selection is a separate decision after Phase 2 exposes real access patterns.

## 8. Learning-State Services and Query API

Phase 2 should keep pure policy separate from repository orchestration.

Proposed module boundary:

```text
lib/learning/
├── types.ts
├── validation.ts
├── mastery-policy.ts
├── readiness.ts
├── repository.ts
├── memory-repository.ts
├── queries.ts
└── index.ts
```

Responsibilities:

- `types.ts`: stable domain contracts;
- `validation.ts`: student, position, evidence validation against curriculum;
- `mastery-policy.ts`: pure ordered-evidence → `MasterySnapshot` calculation;
- `readiness.ts`: pure prerequisite statuses → readiness classification;
- `repository.ts`: persistence interface only;
- `memory-repository.ts`: Phase 2 adapter;
- `queries.ts`: repository + curriculum orchestration;
- `index.ts`: supported public exports.

Public queries:

```ts
getStudent(
  repository: LearningStateRepository,
  studentId: string,
): Promise<StudentProfile>;

getObjectiveMastery(
  repository: LearningStateRepository,
  studentId: string,
  objectiveId: string,
): Promise<MasterySnapshot>;

listTopicMastery(
  repository: LearningStateRepository,
  studentId: string,
  topicId: string,
): Promise<MasterySnapshot[]>;

getObjectiveReadiness(
  repository: LearningStateRepository,
  studentId: string,
  objectiveId: string,
): Promise<ObjectiveReadiness>;

getStudentLearningSummary(
  repository: LearningStateRepository,
  studentId: string,
): Promise<{
  levelId: StudentLevel;
  counts: Record<MasteryState, number>;
  reviewDueCount: number;
}>;
```

`getStudentLearningSummary` summarizes objectives in the student's active level only. Lower-level remediation evidence remains queryable but does not inflate or reduce active-level curriculum counts.

## 9. Error Handling

Phase 2 fails closed for invalid learning-state references.

Required explicit errors include:

- unknown student ID;
- unknown learning objective ID;
- unknown curriculum topic ID;
- evidence for an objective above the student's active level;
- invalid current-position level/topic/objective relationship;
- duplicate evidence ID;
- malformed timestamps;
- `recordedAt` preceding `observedAt`;
- invalid profile numeric fields; and
- inconsistent current-position student ID.

The query API must not silently return `NOT_STARTED` for an unknown objective. `NOT_STARTED` is valid only when the objective exists and the student has no evidence for it.

## 10. Acceptance Scenarios

### Scenario A: P2 learning progression

Use a real P2 Multiplication & Division objective from the Phase 1 dataset.

The scenario records, in order:

1. `introduced` => `INTRODUCED`;
2. `correct_with_hint` => `DEVELOPING`;
3. `independent_correct` => remains `DEVELOPING`;
4. `explained_independently` => remains `DEVELOPING` because only two independent records exist;
5. `application_correct` => `MASTERED`, `reviewDue=false`;
6. later `incorrect` => remains `MASTERED`, `reviewDue=true`;
7. one later `independent_correct` => `reviewDue=true`;
8. second later `independent_correct` => `reviewDue=false`.

This proves mastery and review are separate deterministic projections of the same immutable history.

### Scenario B: P3 fractions readiness

Use real Phase 1 objectives:

- target: `P3-FRA-003`;
- direct prerequisites include `P2-FRA-003` and `P3-FRA-001`.

Expected progression:

1. both prerequisites `NOT_STARTED` => target readiness `BLOCKED`;
2. P2 prerequisite becomes `MASTERED`, P3 prerequisite remains `NOT_STARTED` => `BLOCKED`;
3. P3 prerequisite becomes `DEVELOPING` => `NEEDS_SUPPORT`;
4. P3 prerequisite becomes `MASTERED` => `READY`.

This proves cross-level prerequisite remediation works for a P3 student without changing the student's active level.

## 11. Testing Strategy

Phase 2 uses TDD at three layers.

### Pure policy tests

Cover:

- every mastery state;
- exact mastery threshold boundaries;
- incorrect-before-mastery recovery requirement;
- sticky mastery through ordered-prefix attainment;
- `reviewDue` activation and clearing;
- deterministic ordering with timestamp ties; and
- empty evidence.

### Repository/validation tests

Cover:

- valid P2 and P3 profiles;
- invalid profile fields;
- current-position consistency;
- duplicate evidence rejection;
- P2 student rejecting P3 evidence;
- P3 student accepting P2 remediation evidence;
- immutable evidence semantics;
- timestamp ordering validation; and
- unknown curriculum references.

### Query/acceptance tests

Cover:

- `getObjectiveMastery`;
- `listTopicMastery` deterministic curriculum order;
- readiness classification;
- active-level student summary; and
- both end-to-end scenarios in Section 10.

Existing curriculum tests remain green throughout Phase 2.

## 12. Data and AI Authority Rules

The authority hierarchy is explicit:

1. MOE-backed Phase 1 data owns curriculum truth.
2. Application-recorded evidence owns learning history.
3. Deterministic Phase 2 policy derives mastery/readiness.
4. AI may explain, suggest, classify, or generate content around those facts.

There is no API equivalent to `setMastery('MASTERED')`.

There is no AI-only mastery field.

There is no single numeric mastery percentage in Phase 2.

## 13. Phase 2 Completion Gate

Phase 2 is complete only when all of the following are true:

- Student profile and current-position validation are implemented;
- append-only evidence is implemented;
- mastery is derived exclusively from evidence;
- `MASTERED` and `reviewDue` behavior matches Section 5;
- direct prerequisite readiness is implemented;
- the memory repository satisfies the repository contract;
- public learning-state queries are implemented;
- both acceptance scenarios pass end to end;
- existing Phase 1 curriculum validation remains green;
- `npm test` passes;
- `npm run typecheck` passes;
- `npm run validate:curriculum` passes;
- `npm run lint` passes; and
- `npm run build` passes in the normal host environment.

A sandbox build failure caused only by blocked Google Fonts network access is not a product-code failure if the same commit passes the normal host build.

## 14. Handoff to Later Phases

Phase 3 consumes:

- `StudentProfile`;
- `CurrentPositionAssumption`;
- `MasterySnapshot`;
- `ObjectiveReadiness`; and
- curriculum ordering/prerequisites.

Phase 4 introduces `PracticeSession` and `Attempt`. Successful or unsuccessful attempts emit Phase 2 `EvidenceRecord`s through the existing origin contract.

Phase 5 homework processing emits evidence through the same contract after extraction/grading confidence gates.

Phase 6 introduces `Mistake` lifecycle records. Mistakes may reference one or more attempts/evidence records, but they do not replace the evidence ledger.

This keeps one mastery system across online learning, paper homework, and correction instead of creating separate progress silos.
