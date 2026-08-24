# MathMagics Phase 2 Student & Mastery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the storage-agnostic Student + Evidence + deterministic Mastery + prerequisite Readiness core that later MathMagics planning, practice, homework, correction, and progress features will consume.

**Architecture:** Add a new `lib/learning` domain package. Curriculum facts continue to come from `lib/curriculum`; learning state stores stable IDs only. Evidence is append-only application history, mastery and review status are pure deterministic projections, and the only Phase 2 persistence adapter is an asynchronous in-memory repository.

**Tech Stack:** TypeScript 5, Vitest 4, existing Next.js 16 project/tooling. No new runtime dependency and no production database.

**Spec:** `docs/superpowers/specs/2026-08-24-mathmagics-phase2-student-mastery-design.md`

## Global Constraints

- V1 supports one active student at product level, but every domain record uses stable `studentId`.
- Active levels are exactly `P2 | P3`.
- Evidence is append-only; Phase 2 exposes no evidence update/delete operation.
- Mastery states are exactly `NOT_STARTED | INTRODUCED | DEVELOPING | MASTERED`.
- Mastery is derived from ordered evidence. There is no `setMastery` API and no mutable persisted mastery fact.
- Once any ordered evidence prefix first satisfies the mastery rule, the objective remains `MASTERED`; later incorrect evidence only affects `reviewDue`.
- Phase 2 readiness evaluates direct prerequisites only.
- P2 students may record evidence only for P2 objectives. P3 students may record P2 or P3 evidence.
- Phase 2 introduces no production database, `PracticeSession`, `Attempt`, or `Mistake` model.
- Existing curriculum APIs and provenance validation remain authoritative and green.
- No new npm dependency is permitted for Phase 2.

---

## File Structure

Create the following focused module:

```text
lib/learning/
├── types.ts               # domain contracts only
├── validation.ts          # profile / position / evidence validation against curriculum
├── mastery-policy.ts      # pure evidence ordering + mastery/review projection
├── readiness.ts           # pure prerequisite-status classification
├── repository.ts          # storage interface only
├── memory-repository.ts   # Phase 2 in-memory adapter
├── queries.ts             # repository + curriculum orchestration
└── index.ts               # public exports
```

Create tests by responsibility:

```text
tests/learning-validation.test.ts
tests/learning-mastery-policy.test.ts
tests/learning-memory-repository.test.ts
tests/learning-queries.test.ts
```

No app routes, React components, auth files, or legacy Q05/Q18 fixtures are part of this phase.

---

### Task 1: Define Learning Domain Contracts

**Files:**
- Create: `lib/learning/types.ts`
- Create: `lib/learning/index.ts`
- Test: `tests/learning-validation.test.ts`

**Interfaces:**
- Consumes: `LearningObjective.levelId` and stable IDs from `@/lib/curriculum`.
- Produces: `StudentLevel`, `LearningMode`, `StudentProfile`, `CurrentPositionAssumption`, `EvidenceType`, `EvidenceOriginKind`, `EvidenceOrigin`, `EvidenceRecord`, `MasteryState`, `MasterySnapshot`, `ReadinessState`, `PrerequisiteStatus`, `ObjectiveReadiness`.

- [ ] **Step 1: Write the initial contract-shape test**

Create `tests/learning-validation.test.ts` with compile/runtime fixtures that exercise every public union without introducing implementation behavior yet:

```ts
import { describe, expect, it } from 'vitest';
import type {
  CurrentPositionAssumption,
  EvidenceRecord,
  MasterySnapshot,
  ObjectiveReadiness,
  StudentProfile,
} from '@/lib/learning';

describe('learning domain contracts', () => {
  it('represent the approved Phase 2 domain values', () => {
    const student: StudentProfile = {
      id: 'student-1',
      displayName: 'Alex',
      levelId: 'P3',
      learningMode: 'STRUCTURED_HOME_LEARNING',
      sessionsPerWeek: 4,
      minutesPerSession: 30,
      createdAt: '2026-08-24T09:00:00.000Z',
      updatedAt: '2026-08-24T09:00:00.000Z',
    };
    const position: CurrentPositionAssumption = {
      studentId: student.id,
      levelId: 'P3',
      objectiveId: 'P3-FRA-001',
      recordedAt: '2026-08-24T09:00:00.000Z',
      source: 'MANUAL_SETUP',
    };
    const evidence: EvidenceRecord = {
      id: 'e-1',
      studentId: student.id,
      objectiveId: 'P3-FRA-001',
      type: 'independent_correct',
      observedAt: '2026-08-24T09:01:00.000Z',
      recordedAt: '2026-08-24T09:01:00.000Z',
      origin: { kind: 'LESSON', refId: 'lesson-1' },
    };
    const mastery: MasterySnapshot = {
      studentId: student.id,
      objectiveId: evidence.objectiveId,
      state: 'DEVELOPING',
      reviewDue: false,
      evidenceCount: 1,
      lastEvidenceAt: evidence.observedAt,
    };
    const readiness: ObjectiveReadiness = {
      studentId: student.id,
      objectiveId: 'P3-FRA-003',
      state: 'NEEDS_SUPPORT',
      ready: false,
      prerequisites: [],
      blockingPrerequisites: [],
    };

    expect([student.levelId, position.source, evidence.type, mastery.state, readiness.state]).toEqual([
      'P3',
      'MANUAL_SETUP',
      'independent_correct',
      'DEVELOPING',
      'NEEDS_SUPPORT',
    ]);
  });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
npx vitest run tests/learning-validation.test.ts
```

Expected: FAIL because `@/lib/learning` does not exist.

- [ ] **Step 3: Create exact Phase 2 domain types**

Implement `lib/learning/types.ts` with the unions and interfaces from the approved spec. Do not add scoring fields, mutable mastery fields, `Attempt`, or `Mistake`.

The core declarations must include:

```ts
export type StudentLevel = 'P2' | 'P3';
export type LearningMode = 'FOLLOW_SCHOOL' | 'STRUCTURED_HOME_LEARNING';
export type EvidenceType =
  | 'introduced'
  | 'incorrect'
  | 'correct_with_hint'
  | 'independent_correct'
  | 'corrected'
  | 'explained_independently'
  | 'application_correct';
export type EvidenceOriginKind = 'SETUP' | 'LESSON' | 'PRACTICE' | 'HOMEWORK' | 'CORRECTION';
export type MasteryState = 'NOT_STARTED' | 'INTRODUCED' | 'DEVELOPING' | 'MASTERED';
export type ReadinessState = 'READY' | 'NEEDS_SUPPORT' | 'BLOCKED';
```

Use the exact fields from Sections 4-6 of the spec for all interfaces.

- [ ] **Step 4: Export types from `lib/learning/index.ts`**

Create:

```ts
export type {
  CurrentPositionAssumption,
  EvidenceOrigin,
  EvidenceOriginKind,
  EvidenceRecord,
  EvidenceType,
  LearningMode,
  MasterySnapshot,
  MasteryState,
  ObjectiveReadiness,
  PrerequisiteStatus,
  ReadinessState,
  StudentLevel,
  StudentProfile,
} from './types';
```

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```bash
npx vitest run tests/learning-validation.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add lib/learning/types.ts lib/learning/index.ts tests/learning-validation.test.ts
git commit -m "feat: define learning state contracts"
```

---

### Task 2: Validate Student Profile, Current Position, and Evidence

**Files:**
- Create: `lib/learning/validation.ts`
- Modify: `lib/learning/index.ts`
- Modify: `tests/learning-validation.test.ts`

**Interfaces:**
- Consumes: `StudentProfile`, `CurrentPositionAssumption`, `EvidenceRecord`; `loadCurriculumDataset`, `getLearningObjective` from `@/lib/curriculum`.
- Produces: `assertValidStudentProfile`, `assertValidCurrentPosition`, `assertValidEvidenceRecord`.

- [ ] **Step 1: Add failing validation tests**

Add tests for these exact behaviors:

```ts
it('rejects invalid profile schedule fields and timestamp order', () => {
  expect(() => assertValidStudentProfile({ ...validP3Student, sessionsPerWeek: 0 })).toThrow(
    'sessionsPerWeek must be an integer from 1 through 7',
  );
  expect(() => assertValidStudentProfile({ ...validP3Student, minutesPerSession: 0 })).toThrow(
    'minutesPerSession must be a positive integer',
  );
  expect(() =>
    assertValidStudentProfile({
      ...validP3Student,
      createdAt: '2026-08-24T10:00:00.000Z',
      updatedAt: '2026-08-24T09:00:00.000Z',
    }),
  ).toThrow('updatedAt must not precede createdAt');
});

it('validates current position against the student active level and topic', () => {
  expect(() =>
    assertValidCurrentPosition(validP3Student, {
      studentId: validP3Student.id,
      levelId: 'P3',
      topicId: 'P3-FRACTIONS',
      objectiveId: 'P3-FRA-001',
      recordedAt: '2026-08-24T09:00:00.000Z',
      source: 'MANUAL_SETUP',
    }),
  ).not.toThrow();
});

it('allows P3 remediation evidence for P2 but rejects P3 evidence for a P2 student', () => {
  expect(() => assertValidEvidenceRecord(validP3Student, evidenceFor('P2-FRA-003'))).not.toThrow();
  expect(() => assertValidEvidenceRecord(validP2Student, evidenceFor('P3-FRA-001', validP2Student.id))).toThrow(
    'cannot record P3 evidence for P2 student',
  );
});

it('rejects recordedAt before observedAt and empty origin refId', () => {
  expect(() =>
    assertValidEvidenceRecord(validP3Student, {
      ...evidenceFor('P3-FRA-001'),
      observedAt: '2026-08-24T10:00:00.000Z',
      recordedAt: '2026-08-24T09:00:00.000Z',
    }),
  ).toThrow('recordedAt must not precede observedAt');
  expect(() =>
    assertValidEvidenceRecord(validP3Student, {
      ...evidenceFor('P3-FRA-001'),
      origin: { kind: 'LESSON', refId: '' },
    }),
  ).toThrow('origin.refId must be non-empty when provided');
});
```

Use small local fixtures `validP2Student`, `validP3Student`, and `evidenceFor()` in the test file so the test remains readable.

- [ ] **Step 2: Run the focused test and confirm red**

```bash
npx vitest run tests/learning-validation.test.ts
```

Expected: FAIL because validation exports do not exist.

- [ ] **Step 3: Implement timestamp and profile validation**

In `validation.ts`, use a helper that validates ISO date-time strings by round-trippable `Date.parse` semantics without introducing a library:

```ts
function parseTimestamp(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (!value || Number.isNaN(parsed)) throw new Error(`${field} must be a valid ISO date-time string`);
  return parsed;
}
```

Implement `assertValidStudentProfile(student)` with the exact spec invariants and clear error messages.

- [ ] **Step 4: Implement current-position validation against curriculum**

`assertValidCurrentPosition(student, position, dataset?)` must:

1. require matching `studentId` and `levelId`;
2. require topic and/or objective;
3. resolve the supplied curriculum IDs;
4. verify the topic is a real `topic` node at the student's level;
5. verify an objective belongs to the student's active level;
6. if both are present, verify `objective.topicId === topicId`.

Do not create evidence from current position.

- [ ] **Step 5: Implement evidence validation against curriculum**

`assertValidEvidenceRecord(student, record, dataset?)` must:

1. require non-empty IDs;
2. require matching `studentId`;
3. resolve `objectiveId` through `getLearningObjective`;
4. enforce P2/P3 level rules;
5. validate both timestamps and `recordedAt >= observedAt`;
6. reject empty `origin.refId` when supplied.

- [ ] **Step 6: Export validators and run focused tests**

Update `lib/learning/index.ts`, then run:

```bash
npx vitest run tests/learning-validation.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add lib/learning/validation.ts lib/learning/index.ts tests/learning-validation.test.ts
git commit -m "feat: validate learning state records"
```

---

### Task 3: Implement the Pure Deterministic Mastery Policy

**Files:**
- Create: `lib/learning/mastery-policy.ts`
- Modify: `lib/learning/index.ts`
- Create: `tests/learning-mastery-policy.test.ts`

**Interfaces:**
- Consumes: `EvidenceRecord`, `MasterySnapshot`.
- Produces: `orderEvidence(records)`, `deriveMastery(studentId, objectiveId, records)`.

- [ ] **Step 1: Write failing tests for every state and exact threshold**

Create helpers that generate evidence with deterministic timestamps. Cover:

```ts
expect(deriveMastery('s1', 'P2-MD-005', [])).toMatchObject({
  state: 'NOT_STARTED',
  reviewDue: false,
  evidenceCount: 0,
  lastEvidenceAt: null,
});
```

Then assert:

- `introduced` or only `incorrect` => `INTRODUCED`;
- first `correct_with_hint` => `DEVELOPING`;
- two independent successes including higher-order evidence => still `DEVELOPING`;
- three independent successes including higher-order evidence => `MASTERED` when recovery condition is satisfied.

Add the pre-mastery incorrect boundary:

```ts
const history = [
  e('independent_correct', 1),
  e('application_correct', 2),
  e('incorrect', 3),
  e('independent_correct', 4),
];
expect(deriveMastery('s1', objectiveId, history).state).toBe('DEVELOPING');
history.push(e('explained_independently', 5));
expect(deriveMastery('s1', objectiveId, history).state).toBe('MASTERED');
```

- [ ] **Step 2: Add failing tests for sticky mastery and reviewDue**

Use the exact Scenario A suffix:

```ts
expect(afterMasteryIncorrect.state).toBe('MASTERED');
expect(afterMasteryIncorrect.reviewDue).toBe(true);
expect(afterOneRecovery.reviewDue).toBe(true);
expect(afterTwoRecoveries.reviewDue).toBe(false);
```

Also add a second post-mastery incorrect after review was cleared and prove the latest incorrect restarts the two-success review recovery count.

- [ ] **Step 3: Add deterministic ordering test**

Create three records sharing `observedAt`, with different `recordedAt`, then two sharing both timestamps with different IDs. Assert `orderEvidence()` sorts by `observedAt`, then `recordedAt`, then `id` and does not mutate the input array.

- [ ] **Step 4: Run focused tests and confirm red**

```bash
npx vitest run tests/learning-mastery-policy.test.ts
```

Expected: FAIL because policy functions do not exist.

- [ ] **Step 5: Implement evidence category sets and ordering**

Use module-private sets exactly matching the spec:

```ts
const SUCCESSFUL = new Set<EvidenceType>([
  'correct_with_hint',
  'independent_correct',
  'corrected',
  'explained_independently',
  'application_correct',
]);
const INDEPENDENT = new Set<EvidenceType>([
  'independent_correct',
  'explained_independently',
  'application_correct',
]);
const HIGHER_ORDER = new Set<EvidenceType>(['explained_independently', 'application_correct']);
```

`orderEvidence()` returns a sorted copy.

- [ ] **Step 6: Implement earliest mastery-attainment prefix detection**

Scan ordered history from oldest to newest. For each prefix track:

- total independent count;
- whether higher-order evidence has occurred;
- index of most recent `incorrect`;
- independent count since that incorrect.

The first prefix satisfying all three mastery conditions becomes `masteryAttainmentIndex`. Never recalculate current state solely from the latest suffix because that would violate sticky mastery.

- [ ] **Step 7: Implement state and reviewDue projection**

Rules:

```text
no evidence                         -> NOT_STARTED
no successful evidence             -> INTRODUCED
successful evidence, no attainment -> DEVELOPING
attainment index exists            -> MASTERED
```

For a mastered objective, find the most recent `incorrect` after `masteryAttainmentIndex`; `reviewDue` is true until two independent successes occur after that incorrect.

Return `evidenceCount` and the latest ordered record's `observedAt` as `lastEvidenceAt`.

- [ ] **Step 8: Run mastery tests, full tests, and typecheck**

```bash
npx vitest run tests/learning-mastery-policy.test.ts
npm test
npm run typecheck
```

Expected: all green.

- [ ] **Step 9: Commit Task 3**

```bash
git add lib/learning/mastery-policy.ts lib/learning/index.ts tests/learning-mastery-policy.test.ts
git commit -m "feat: derive deterministic mastery from evidence"
```

---

### Task 4: Add Repository Boundary and In-Memory Adapter

**Files:**
- Create: `lib/learning/repository.ts`
- Create: `lib/learning/memory-repository.ts`
- Modify: `lib/learning/index.ts`
- Create: `tests/learning-memory-repository.test.ts`

**Interfaces:**
- Consumes: Phase 2 domain records and validators.
- Produces: `LearningStateRepository`, `MemoryLearningStateRepository`.

- [ ] **Step 1: Write repository contract tests first**

Create tests for:

1. save/get student;
2. replace same-ID student profile;
3. set/get current position after validation;
4. append/list evidence;
5. duplicate evidence ID rejection even when objective differs;
6. cross-level evidence validation;
7. returned student/position/evidence values cannot mutate stored history.

The immutability assertion must mutate a returned nested `origin.refId` and prove a second read remains unchanged:

```ts
const returned = await repository.listEvidenceForStudent('s1');
returned[0]!.origin.refId = 'tampered';
const reread = await repository.listEvidenceForStudent('s1');
expect(reread[0]!.origin.refId).toBe('lesson-1');
```

- [ ] **Step 2: Run repository tests and confirm red**

```bash
npx vitest run tests/learning-memory-repository.test.ts
```

Expected: FAIL because repository modules do not exist.

- [ ] **Step 3: Define the async repository interface**

Create `repository.ts` with the exact approved interface:

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

- [ ] **Step 4: Implement defensive cloning in the memory adapter**

`MemoryLearningStateRepository` stores maps/arrays privately and clones records on write/read. A local explicit clone is sufficient because records are simple data:

```ts
function cloneEvidence(record: EvidenceRecord): EvidenceRecord {
  return { ...record, origin: { ...record.origin } };
}
```

Do not add JSON serialization tricks or a dependency.

- [ ] **Step 5: Enforce repository invariants**

`saveStudent` calls `assertValidStudentProfile`.

`setCurrentPosition`:

- requires the student to exist;
- validates the position against that student.

`appendEvidence`:

- rejects any reused evidence ID globally;
- requires the student to exist;
- calls `assertValidEvidenceRecord` before append.

Repository methods do not call `deriveMastery`.

- [ ] **Step 6: Export repository types/classes and run tests**

```bash
npx vitest run tests/learning-memory-repository.test.ts tests/learning-validation.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add lib/learning/repository.ts lib/learning/memory-repository.ts lib/learning/index.ts tests/learning-memory-repository.test.ts
git commit -m "feat: add learning state repository boundary"
```

---

### Task 5: Implement Pure Prerequisite Readiness Classification

**Files:**
- Create: `lib/learning/readiness.ts`
- Modify: `lib/learning/index.ts`
- Modify: `tests/learning-mastery-policy.test.ts`

**Interfaces:**
- Consumes: `PrerequisiteStatus[]`.
- Produces: `classifyReadiness(studentId, objectiveId, prerequisites)`.

- [ ] **Step 1: Add failing readiness unit tests**

Test all four boundaries:

```ts
expect(classifyReadiness('s1', 'target', [])).toMatchObject({ state: 'READY', ready: true });
expect(classifyReadiness('s1', 'target', [p('MASTERED')])).toMatchObject({ state: 'READY', ready: true });
expect(classifyReadiness('s1', 'target', [p('DEVELOPING')])).toMatchObject({
  state: 'NEEDS_SUPPORT',
  ready: false,
});
expect(classifyReadiness('s1', 'target', [p('NOT_STARTED')])).toMatchObject({
  state: 'BLOCKED',
  ready: false,
});
```

Also prove:

- `INTRODUCED` => `NEEDS_SUPPORT` when none are `NOT_STARTED`;
- `reviewDue: true` on a `MASTERED` prerequisite remains `READY`;
- `blockingPrerequisites` contains every non-mastered prerequisite, not only `NOT_STARTED` ones.

- [ ] **Step 2: Run focused tests and confirm red**

```bash
npx vitest run tests/learning-mastery-policy.test.ts
```

- [ ] **Step 3: Implement `classifyReadiness` as a pure function**

Use this precedence:

```text
no prerequisites                  -> READY
any NOT_STARTED                   -> BLOCKED
otherwise any non-MASTERED        -> NEEDS_SUPPORT
all MASTERED                      -> READY
```

Return copied prerequisite arrays so callers cannot mutate inputs through the result.

- [ ] **Step 4: Run focused tests and typecheck**

```bash
npx vitest run tests/learning-mastery-policy.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add lib/learning/readiness.ts lib/learning/index.ts tests/learning-mastery-policy.test.ts
git commit -m "feat: classify prerequisite readiness"
```

---

### Task 6: Add Learning-State Query API

**Files:**
- Create: `lib/learning/queries.ts`
- Modify: `lib/learning/index.ts`
- Create: `tests/learning-queries.test.ts`

**Interfaces:**
- Consumes: `LearningStateRepository`; curriculum `getLearningObjective`, `getPrerequisites`, `listObjectivesForTopic`, `loadCurriculumDataset`; `deriveMastery`; `classifyReadiness`.
- Produces: `getStudent`, `getObjectiveMastery`, `listTopicMastery`, `getObjectiveReadiness`, `getStudentLearningSummary`.

- [ ] **Step 1: Write failing tests for unknown IDs and empty evidence**

Assert:

```ts
await expect(getStudent(repository, 'missing')).rejects.toThrow('Unknown student id: missing');
await expect(getObjectiveMastery(repository, 's1', 'NOPE')).rejects.toThrow(
  'Unknown learning objective id: NOPE',
);
```

For a real known objective with no evidence, assert `NOT_STARTED`, not an error.

- [ ] **Step 2: Write failing tests for topic order and active-level summary**

For `P3-FRACTIONS`, assert `listTopicMastery()` returns snapshots in `listObjectivesForTopic()` sequence order.

For a P3 student with P2 remediation evidence, assert `getStudentLearningSummary()` counts exactly the 36 P3 objectives in `NOT_STARTED/INTRODUCED/DEVELOPING/MASTERED`, never the P2 objective used for remediation.

Do not hard-code 36 if the curriculum test helper can derive the active-level objective count from `loadCurriculumDataset()`; assert the sum equals the dataset count.

- [ ] **Step 3: Write failing tests for real prerequisite readiness**

Use target `P3-FRA-003` and verify its real direct prerequisites are resolved through Phase 1, not copied into the test.

Start with no prerequisite evidence and expect `BLOCKED`.

- [ ] **Step 4: Run query tests and confirm red**

```bash
npx vitest run tests/learning-queries.test.ts
```

Expected: FAIL because query functions do not exist.

- [ ] **Step 5: Implement `getStudent` and `getObjectiveMastery`**

`getStudent` converts repository `undefined` into `Error('Unknown student id: <id>')`.

`getObjectiveMastery` must:

1. confirm the student exists;
2. resolve the curriculum objective so unknown IDs fail closed;
3. fetch objective evidence;
4. pass that evidence to `deriveMastery`.

- [ ] **Step 6: Implement ordered topic mastery**

`listTopicMastery`:

1. confirms student exists;
2. resolves curriculum objectives using `listObjectivesForTopic`;
3. rejects a topic above the student's active level rather than silently exposing future-level mastery;
4. computes snapshots in curriculum sequence order.

P3 callers may still query P2 remediation objectives individually through `getObjectiveMastery`; the active-level topic list remains level-scoped.

- [ ] **Step 7: Implement prerequisite readiness orchestration**

`getObjectiveReadiness` must call the real Phase 1 `getPrerequisites(objectiveId)` and compute each prerequisite's mastery through `getObjectiveMastery`, then pass statuses into `classifyReadiness`.

No recursive traversal.

- [ ] **Step 8: Implement active-level learning summary**

Load the curriculum dataset, select objectives where `objective.levelId === student.levelId`, derive every snapshot, initialize all four `MasteryState` counts to zero, increment them, and count `reviewDue` separately.

- [ ] **Step 9: Export queries and run focused/full tests**

```bash
npx vitest run tests/learning-queries.test.ts
npm test
npm run typecheck
```

Expected: PASS.

- [ ] **Step 10: Commit Task 6**

```bash
git add lib/learning/queries.ts lib/learning/index.ts tests/learning-queries.test.ts
git commit -m "feat: expose learning state query API"
```

---

### Task 7: Prove the Two End-to-End Phase 2 Acceptance Scenarios

**Files:**
- Modify: `tests/learning-queries.test.ts`
- Modify: `.agent/CURRENT.md`
- Modify: `.agent/BACKLOG.md`

**Interfaces:**
- Consumes: all Phase 2 public APIs plus real Phase 1 curriculum data.
- Produces: acceptance evidence that `Curriculum → Evidence → Mastery → Readiness` works end to end.

- [ ] **Step 1: Add Scenario A exactly as approved**

Using a real P2 Multiplication & Division objective such as `P2-MD-005`, append in order:

```text
introduced
correct_with_hint
independent_correct
explained_independently
application_correct
incorrect
independent_correct
independent_correct
```

After each relevant append, call `getObjectiveMastery()` and assert the exact progression:

```text
INTRODUCED
DEVELOPING
DEVELOPING
DEVELOPING
MASTERED / reviewDue=false
MASTERED / reviewDue=true
MASTERED / reviewDue=true
MASTERED / reviewDue=false
```

Do not call the pure policy directly in this acceptance test. The point is to exercise repository + validation + query orchestration.

- [ ] **Step 2: Add Scenario B with real P3 fraction prerequisites**

Use a P3 student and target `P3-FRA-003`.

Drive `P2-FRA-003` and `P3-FRA-001` through evidence histories that satisfy the actual mastery rule. Assert readiness transitions:

```text
both NOT_STARTED                      -> BLOCKED
P2 mastered, P3 NOT_STARTED          -> BLOCKED
P2 mastered, P3 DEVELOPING           -> NEEDS_SUPPORT
both mastered                        -> READY
```

Again, use only public repository/query APIs.

- [ ] **Step 3: Run the complete Phase 2 and regression suite**

Run:

```bash
npm test
npm run typecheck
npm run validate:curriculum
npm run lint
```

Expected:

- all learning tests pass;
- all legacy/curriculum tests remain green;
- curriculum validator reports the same valid P2/P3 dataset;
- lint/typecheck exit 0.

- [ ] **Step 4: Run production build in the normal host environment**

Run:

```bash
npm run build
```

Expected: PASS in normal host environment. The known Next.js `middleware` deprecation warning is non-blocking. If the GrandeGPT sandbox alone fails because `next/font` cannot reach Google Fonts, record that as environment evidence and require the same commit to pass this host build before Phase 2 closeout.

- [ ] **Step 5: Update project status only after verification is green**

Update `.agent/CURRENT.md` to state:

- Phase 2 Student & Mastery Core completed;
- Evidence-first deterministic mastery implemented;
- readiness query implemented;
- memory repository only, production persistence still intentionally undecided;
- next phase is Teaching Planner / Lesson Prep.

Update `.agent/BACKLOG.md`:

- mark `MM-P2-001`, `MM-P2-002`, `MM-P2-003`, `MM-P2-005`, `MM-P2-006` complete;
- replace old `MM-P2-004 Attempt vs Mistake` item with a note that Attempt is Phase 4 and Mistake is Phase 6, already represented through the extensible evidence-origin contract;
- keep production persistence as a decision before the first feature that needs durable household state, not as a Phase 2 blocker.

- [ ] **Step 6: Re-run tests after status-file edits**

Because the final commit must be bound to the current workspace state, run again:

```bash
npm test
npm run lint
```

Expected: PASS.

- [ ] **Step 7: Commit Task 7 / Phase 2 closeout**

```bash
git add tests/learning-queries.test.ts .agent/CURRENT.md .agent/BACKLOG.md
git commit -m "test: prove phase 2 learning state scenarios"
```

---

## Phase 2 Final Review Checklist

Before opening the Phase 2 PR, verify all of the following from the current HEAD:

1. `lib/learning` contains no database client/import.
2. Search for `setMastery` returns no Phase 2 API.
3. Search for `Attempt` and `Mistake` confirms they appear only in docs/comments describing future boundaries, not as new domain implementations.
4. Evidence repository exposes append/list only, with no update/delete.
5. `MASTERED` is detected from earliest qualifying ordered history prefix, not only from the latest suffix.
6. `reviewDue` is derived only after post-mastery incorrect evidence.
7. P3 cross-level remediation uses real P2 curriculum objectives.
8. `getObjectiveReadiness` uses direct `getPrerequisites()` links and does not invent a transitive graph.
9. `getStudentLearningSummary` counts active-level objectives only.
10. `npm test`, `npm run typecheck`, `npm run validate:curriculum`, `npm run lint`, and host `npm run build` are green for the current commit.

## Commit Sequence

Expected implementation history:

```text
feat: define learning state contracts
feat: validate learning state records
feat: derive deterministic mastery from evidence
feat: add learning state repository boundary
feat: classify prerequisite readiness
feat: expose learning state query API
test: prove phase 2 learning state scenarios
```

Small deviations in commit grouping are acceptable only when a change is inseparable from the immediately adjacent task. Do not squash all Phase 2 work into one implementation commit before review.
