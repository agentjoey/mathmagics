# MathMagics Phase 4 Practice / Attempt Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a trustworthy student-practice loop where code-owned structured math is deterministically graded into immutable Attempts and replay-safe Phase 2 Evidence without giving AI authority over correctness, curriculum, Mastery, or Readiness.

**Architecture:** Add a focused `lib/practice` domain package consuming Phase 1 curriculum, Phase 2 learning-state queries, and Phase 3 `DailyLesson` snapshots. `PracticeItem` persists typed mathematical truth and a code-derived `AnswerSpec`; hint use is server-observed; Attempt history is append-only; Evidence is a pure projection of stored Attempt/item facts. Persistence extends the existing Drizzle/Neon monolith with four fact tables and no derived-state tables.

**Tech Stack:** TypeScript 5, Next.js 16, Vitest, Drizzle ORM/Kit, Neon serverless PostgreSQL, existing curriculum/learning/planning modules.

**Spec:** `docs/superpowers/specs/2026-08-25-mathmagics-phase4-practice-attempt-design.md`

## Global Constraints

- AI cannot choose/change objective IDs, structured math, answer keys, grades, Evidence, Mastery, or Readiness.
- `PracticeSession` targets exactly one `DailyLesson × LearningObjective`, and only `PRACTICE` or `REVIEW` lessons.
- `Attempt` is immutable; retries never overwrite prior wrong Attempts.
- Hint usage is derived from append-only `PracticeHintReveal`, never client input.
- Only deterministically gradable items automatically produce Evidence.
- `Attempt → EvidenceRecord` is pure, versioned, and replay-safe via stable Evidence ID.
- Unsupported objectives fail closed. No unrestricted AI fallback.
- No persistent Mistake, OCR/homework, adaptive ability score, practice-status summary, queue, worker, Redis, object storage, vector DB, or new npm dependency.
- Drizzle SQL is generated and committed; no startup/Preview migration and no incidental production migration.
- Live Neon tests require explicit non-production `TEST_DATABASE_URL` and never fall back to `DATABASE_URL`.
- Every production behavior follows RED → minimal GREEN → regression suite → commit.

---

## File Structure

```text
lib/practice/
├── types.ts
├── validation.ts
├── preparation.ts
├── blueprint.ts
├── grading.ts
├── hints.ts
├── evidence.ts
├── repository.ts
├── memory-repository.ts
├── service.ts
├── student-view.ts
├── renderer.ts
├── generators/
│   ├── registry.ts
│   ├── multiplication.ts
│   ├── fractions.ts
│   └── word-problems.ts
└── index.ts

lib/persistence/neon-practice-repository.ts
lib/persistence/schema.ts
migrations/0001_*.sql
migrations/meta/*

tests/practice-contracts.test.ts
tests/practice-preparation.test.ts
tests/practice-blueprint.test.ts
tests/practice-generators.test.ts
tests/practice-grading.test.ts
tests/practice-student-view.test.ts
tests/practice-hints-retry.test.ts
tests/practice-evidence.test.ts
tests/practice-repository.test.ts
tests/practice-service.test.ts
tests/practice-renderer-boundary.test.ts
tests/practice-e2e.test.ts
tests/persistence-practice-schema.test.ts
tests/persistence-neon-practice-contract.test.ts
```

Existing files modified where required:

```text
lib/learning/repository.ts
lib/learning/memory-repository.ts
lib/persistence/neon-learning-state-repository.ts
.agent/CURRENT.md
.agent/BACKLOG.md
CLAUDE.md
docs/architecture.md
```

---

### Task 0: Core practice contracts + Phase 3 status cleanup

**Files:**
- Create: `lib/practice/types.ts`
- Create: `lib/practice/validation.ts`
- Create: `lib/practice/index.ts`
- Test: `tests/practice-contracts.test.ts`
- Modify: `.agent/CURRENT.md`

**Produces these exact contracts:**

```ts
import type { DifficultyBand } from '@/lib/curriculum';

export interface PracticeSession {
  id: string;
  studentId: string;
  lessonId: string;
  objectiveId: string;
  policyVersion: string;
  createdAt: string;
}

export type ArithmeticProblemSpec = {
  kind: 'ARITHMETIC';
  operation: 'MULTIPLY' | 'DIVIDE';
  left: number;
  right: number;
};

export type EquationChoiceProblemSpec = {
  kind: 'EQUATION_CHOICE';
  scenario: 'SHARING' | 'GROUPING' | 'FACT_FAMILY';
  total: number;
  groupSize: number;
  groups: number;
  options: Array<{ id: string; expression: string }>;
  correctOptionId: string;
};

export type FractionProblemSpec =
  | {
      kind: 'FRACTION_COMPARE';
      leftNumerator: number;
      leftDenominator: number;
      rightNumerator: number;
      rightDenominator: number;
    }
  | {
      kind: 'FRACTION_EQUIVALENT';
      numerator: number;
      denominator: number;
      scaleFactor: number;
      missing: 'NUMERATOR' | 'DENOMINATOR';
    }
  | {
      kind: 'FRACTION_SIMPLIFY';
      numerator: number;
      denominator: number;
    }
  | {
      kind: 'FRACTION_OPERATION';
      operation: 'ADD' | 'SUBTRACT';
      leftNumerator: number;
      leftDenominator: number;
      rightNumerator: number;
      rightDenominator: number;
    };

export interface WordProblemStep {
  operation: 'ADD' | 'SUBTRACT' | 'MULTIPLY' | 'DIVIDE';
  operands: number[];
  result: number;
}

export type WordProblemSpec = {
  kind: 'WORD_PROBLEM';
  structure: 'EQUAL_GROUPS' | 'SHARING' | 'GROUPING' | 'PART_WHOLE' | 'COMPARISON';
  quantities: Record<string, number>;
  steps: WordProblemStep[];
  answer: number;
  templateId: string;
};

export type PracticeProblemSpec =
  | ArithmeticProblemSpec
  | EquationChoiceProblemSpec
  | FractionProblemSpec
  | WordProblemSpec;

export type AnswerSpec =
  | { kind: 'INTEGER'; value: string }
  | { kind: 'DECIMAL'; value: string }
  | { kind: 'FRACTION'; numerator: number; denominator: number; equivalence: 'VALUE' | 'EXACT_SIMPLEST' }
  | { kind: 'CHOICE'; optionId: string }
  | { kind: 'EXACT_TEXT'; acceptedValues: string[]; caseSensitive: false };

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

export interface PracticeHintReveal {
  id: string;
  sessionId: string;
  itemId: string;
  studentId: string;
  revealedAt: string;
}

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

export interface SubmitAttemptInput {
  attemptId: string;
  sessionId: string;
  itemId: string;
  answerText: string;
  retryOfAttemptId?: string;
}
```

- [ ] **Step 1: Write failing validation tests**

Include these concrete cases:

```ts
it('rejects empty practice objective id', () => {
  expect(() => assertValidPracticeSession({
    id: 'ps-1', studentId: 's1', lessonId: 'l1', objectiveId: '',
    policyVersion: 'practice-v1', createdAt: '2026-08-25T00:00:00.000Z',
  })).toThrow('practice session objectiveId must be non-empty');
});

it('rejects attempt recorded before submission', () => {
  expect(() => assertValidAttempt({
    id: 'a1', sessionId: 'ps1', itemId: 'pi1', studentId: 's1', objectiveId: 'P2-MD-001',
    answerText: '6', outcome: 'CORRECT', hintUsed: false, gradingPolicyVersion: 'grading-v1',
    submittedAt: '2026-08-25T00:01:00.000Z', recordedAt: '2026-08-25T00:00:59.000Z',
  })).toThrow('attempt recordedAt must not precede submittedAt');
});
```

Also test positive item sequence, finite numeric parameters, positive fraction denominators, non-empty solution outline/generator/version, unique equation-choice option IDs, `correctOptionId` membership, non-empty word-problem steps, each step's result matching its operation/operands, final `answer === lastStep.result`, valid timestamps, and `retryOfAttemptId !== id`.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/practice-contracts.test.ts`

Expected: new practice contracts/validators are absent, so the focused test does not pass.

- [ ] **Step 3: Implement minimal contracts + pure validators**

Export exactly:

```ts
assertValidPracticeSession(session: PracticeSession): void
assertValidPracticeItem(item: PracticeItem): void
assertValidPracticeHintReveal(reveal: PracticeHintReveal): void
assertValidAttempt(attempt: Attempt): void
```

Validators do no repository/AI/network work.

- [ ] **Step 4: Correct stale Phase 3 status**

Change `.agent/CURRENT.md` from `Completed (PR pending)` to `Completed / Merged`, and mark Phase 4 as current without marking any P4 item complete.

- [ ] **Step 5: Verify GREEN + regression**

```bash
npx vitest run tests/practice-contracts.test.ts
npm test
npm run lint
```

- [ ] **Step 6: Commit**

`feat: define phase 4 practice contracts`

---

### Task 1: Trusted PracticePreparationContext

**Files:**
- Create: `lib/practice/preparation.ts`
- Test: `tests/practice-preparation.test.ts`
- Modify: `lib/practice/index.ts`

**Produces:**

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
  policyVersion: 'practice-v1';
  preparedAt: string;
}

export async function buildPracticePreparationContext(
  learningRepository: LearningStateRepository,
  planningRepository: PlanningRepository,
  lessonId: string,
  objectiveId: string,
  now: string,
): Promise<PracticePreparationContext>;
```

- [ ] **Step 1: RED tests**

Assert unknown lesson, objective not on lesson, lesson/student mismatch, non-`PRACTICE|REVIEW` intent, and `BLOCKED` readiness all reject. Verify a valid P3 fraction lesson returns real objective, mastery/readiness, representations, strategies, misconceptions, policyVersion=`practice-v1`, and `preparedAt=now`.

Example:

```ts
await expect(buildPracticePreparationContext(learningRepo, planningRepo, 'lesson-1', 'P3-FRA-999', NOW))
  .rejects.toThrow('practice objective must belong to daily lesson');
```

- [ ] **Step 2: Run RED**

`npx vitest run tests/practice-preparation.test.ts`

- [ ] **Step 3: Implement with existing trusted APIs**

Use `planningRepository.getDailyLesson`, `learningRepository.getStudent`, `getLearningObjective`, `getObjectiveMastery`, `getObjectiveReadiness`, `getRepresentations`, `getStrategies`, `getMisconceptions`. No infrastructure imports.

- [ ] **Step 4: Verify**

```bash
npx vitest run tests/practice-preparation.test.ts
npm test
npm run lint
```

- [ ] **Step 5: Commit**

`feat: build trusted practice preparation context`

---

### Task 2: Deterministic `practice-v1` blueprint

**Files:**
- Create: `lib/practice/blueprint.ts`
- Test: `tests/practice-blueprint.test.ts`
- Modify: `lib/practice/types.ts`, `lib/practice/index.ts`

**Produces:**

```ts
export interface PracticeBlueprint {
  objectiveId: string;
  policyVersion: 'practice-v1';
  slots: DifficultyBand[];
}

export function derivePracticeBlueprint(
  objectiveId: string,
  mastery: MasterySnapshot,
): PracticeBlueprint;
```

- [ ] **Step 1: RED policy-table test**

```ts
it.each([
  ['NOT_STARTED', false, ['FOUNDATION','FOUNDATION','CORE','CORE']],
  ['INTRODUCED', false, ['FOUNDATION','FOUNDATION','CORE','CORE']],
  ['DEVELOPING', false, ['FOUNDATION','CORE','CORE','APPLICATION']],
  ['MASTERED', true, ['CORE','CORE','APPLICATION','APPLICATION']],
  ['MASTERED', false, ['CORE','APPLICATION','APPLICATION','CHALLENGE']],
] as const)('maps %s review=%s', (state, reviewDue, slots) => {
  expect(derivePracticeBlueprint('P3-FRA-003', {
    studentId: 's1', objectiveId: 'P3-FRA-003', state, reviewDue,
    evidenceCount: 0, lastEvidenceAt: null,
  }).slots).toEqual(slots);
});
```

Also reject mastery/objective mismatch.

- [ ] **Step 2: Run RED**

`npx vitest run tests/practice-blueprint.test.ts`

- [ ] **Step 3: Implement pure table mapping**

No repository, RNG, time, or AI access.

- [ ] **Step 4: Verify + commit**

```bash
npx vitest run tests/practice-blueprint.test.ts
npm test
npm run lint
```

Commit: `feat: add deterministic practice blueprint policy`

---

### Task 3: Structured deep-slice generators

**Files:**
- Create: `lib/practice/generators/registry.ts`
- Create: `lib/practice/generators/multiplication.ts`
- Create: `lib/practice/generators/fractions.ts`
- Create: `lib/practice/generators/word-problems.ts`
- Test: `tests/practice-generators.test.ts`
- Modify: `lib/practice/index.ts`

**Produces:**

```ts
export interface PracticeItemGenerationInput {
  session: PracticeSession;
  context: PracticePreparationContext;
  blueprint: PracticeBlueprint;
  itemIds: string[];
}

export interface PracticeItemGenerator {
  supports(objectiveId: string): boolean;
  generate(input: PracticeItemGenerationInput): PracticeItem[];
}

export function getPracticeItemGenerator(objectiveId: string): PracticeItemGenerator;
```

Supported objectives exactly:

```text
P2-MD-001..006
P3-FRA-001..005
P2-AS-002
P3-AS-002
P3-MD-005
```

`P2-MD-005` routes to the word-problem generator only.

- [ ] **Step 1: RED mathematical-truth tests**

For `P2-MD-001`, prove every `ARITHMETIC` answer from `problemSpec`:

```ts
const expected = spec.operation === 'MULTIPLY'
  ? spec.left * spec.right
  : spec.left / spec.right;
expect(item.answerSpec).toEqual({ kind: 'INTEGER', value: String(expected) });
```

For `P2-MD-002`, require `EQUATION_CHOICE`; option IDs are unique; `correctOptionId` identifies the code-generated equation representing the sharing/grouping relationship; AnswerSpec is exactly `{kind:'CHOICE', optionId: correctOptionId}`.

For `P3-FRA-003`, denominators are `<=12`; comparison uses integer cross multiplication and yields EXACT_TEXT `<`, `>`, or `=`.

For word problems, recompute every `WordProblemStep` result, assert the final step equals `answer`, and assert `AnswerSpec` equals the final answer. Include one two-step `P2-AS-002` or `P3-MD-005` fixture to prove the structured spec can audit two-step work.

- [ ] **Step 2: Run RED**

`npx vitest run tests/practice-generators.test.ts`

- [ ] **Step 3: Implement multiplication/division generator**

Use no RNG. Select deterministic parameters from `(objectiveId, sequence, difficultyBand)`. Factors are from `{2,3,4,5,10}` with companion `1..10`; division comes from exact multiplication facts. `P2-MD-002` tests division-symbol representation through equation choices, not merely quotient calculation.

- [ ] **Step 4: Implement fraction generator**

Denominator max 12; simplify uses reducible pairs; scale factor `2..4`; comparison uses cross multiplication; related add/subtract stays within one whole and uses related denominators.

- [ ] **Step 5: Implement deterministic word-problem templates**

Support `EQUAL_GROUPS`, `SHARING`, `GROUPING`, `PART_WHOLE`, `COMPARISON`. `steps` carries one or two exact operations; prompt comes from fixed `templateId` after the math structure is complete.

- [ ] **Step 6: Implement fail-closed registry**

`getPracticeItemGenerator('P3-MONEY-001')` throws `Unsupported practice objective: P3-MONEY-001`.

- [ ] **Step 7: Verify + commit**

```bash
npx vitest run tests/practice-generators.test.ts
npm test
npm run lint
```

Commit: `feat: generate structured deep slice practice items`

---

### Task 4: Deterministic grading + student-safe projection

**Files:**
- Create: `lib/practice/grading.ts`
- Create: `lib/practice/student-view.ts`
- Test: `tests/practice-grading.test.ts`, `tests/practice-student-view.test.ts`
- Modify: `lib/practice/index.ts`

**Produces:**

```ts
export interface AttemptGrade {
  outcome: 'CORRECT' | 'INCORRECT';
  normalizedAnswer: string;
}

export function gradeAnswer(answerText: string, answerSpec: AnswerSpec): AttemptGrade;

export interface StudentPracticeItem {
  id: string;
  sessionId: string;
  objectiveId: string;
  sequence: number;
  difficultyBand: DifficultyBand;
  prompt: string;
}

export function toStudentPracticeItem(item: PracticeItem): StudentPracticeItem;
```

- [ ] **Step 1: RED grader table**

Test:
- INTEGER: `" 06 "` equals `6`; `6.0` is invalid integer input.
- DECIMAL: `1.20` equals `1.2` using coefficient/scale normalization, not float tolerance.
- FRACTION VALUE: `2/4` equals `1/2`.
- FRACTION EXACT_SIMPLEST: `2/4` fails when canonical simplest is `1/2`.
- CHOICE: exact option ID.
- EXACT_TEXT: trim + whitespace collapse + lowercase because `caseSensitive:false`.
- malformed student syntax yields `INCORRECT`; malformed trusted AnswerSpec is rejected by validation.

- [ ] **Step 2: RED confidentiality test**

```ts
expect(Object.keys(toStudentPracticeItem(fullItem)).sort()).toEqual([
  'difficultyBand','id','objectiveId','prompt','sequence','sessionId',
]);
```

- [ ] **Step 3: Implement pure graders + explicit projection**

Use integer string arithmetic for decimals and gcd normalization for fractions. Construct `StudentPracticeItem` field-by-field; never spread the server item.

- [ ] **Step 4: Verify + commit**

```bash
npx vitest run tests/practice-grading.test.ts tests/practice-student-view.test.ts
npm test
npm run lint
```

Commit: `feat: grade deterministic practice answers`

---

### Task 5: Hint facts, retry rules, and Attempt → Evidence

**Files:**
- Create: `lib/practice/hints.ts`
- Create: `lib/practice/evidence.ts`
- Test: `tests/practice-hints-retry.test.ts`, `tests/practice-evidence.test.ts`
- Modify: `lib/learning/repository.ts`
- Modify: `lib/learning/memory-repository.ts`
- Modify: `lib/persistence/neon-learning-state-repository.ts`
- Modify: `lib/practice/index.ts`

**Produces:**

```ts
export function hintRevealId(studentId: string, itemId: string): string;
export function evidenceIdForAttempt(attemptId: string): string;

export interface RetryCoordinates {
  studentId: string;
  sessionId: string;
  itemId: string;
  objectiveId: string;
}

export function validateRetryAttempt(
  previousAttempts: Attempt[],
  input: SubmitAttemptInput,
  coordinates: RetryCoordinates,
): Attempt | undefined;

export function projectAttemptToEvidence(
  attempt: Attempt,
  item: PracticeItem,
): EvidenceRecord;
```

Extend `LearningStateRepository` exactly:

```ts
getEvidence(evidenceId: string): Promise<EvidenceRecord | undefined>;
```

- [ ] **Step 1: RED ID + Evidence precedence tests**

```ts
expect(evidenceIdForAttempt('attempt-1')).toBe('practice-attempt:attempt-1');
expect(hintRevealId('student-1','item-1')).toBe('practice-hint:student-1:item-1');
expect(hintRevealId('student:a','item:b')).toBe('practice-hint:student%3Aa:item%3Ab');
```

Use `encodeURIComponent` per hint-ID component.

Evidence rules in precedence order:
1. INCORRECT → `incorrect`.
2. CORRECT retry → `corrected`.
3. CORRECT first attempt + hint → `correct_with_hint`.
4. CORRECT no hint FOUNDATION/CORE → `independent_correct`.
5. CORRECT no hint APPLICATION/CHALLENGE → `application_correct`.

Evidence origin is `{kind:'PRACTICE', refId: attempt.id}`; Evidence timestamps equal Attempt timestamps.

- [ ] **Step 2: RED retry tests**

Prove: first attempt needs no retry ID; retry points to latest wrong Attempt; retry of correct rejects; stale parent rejects; second fresh Attempt rejects; parent must match trusted `RetryCoordinates` for student/session/item/objective.

- [ ] **Step 3: Implement pure helpers/projector/retry validator**

No repository access in `projectAttemptToEvidence`.

- [ ] **Step 4: Add `getEvidence` to memory + Neon learning adapters**

Memory returns a clone by ID. Neon selects `evidenceRecords.id` and maps through existing row/domain validation.

- [ ] **Step 5: Verify + commit**

```bash
npx vitest run tests/learning-memory-repository.test.ts tests/practice-hints-retry.test.ts tests/practice-evidence.test.ts
npm test
npm run lint
```

Commit: `feat: project practice attempts into evidence`

---

### Task 6: PracticeRepository + memory adapter

**Files:**
- Create: `lib/practice/repository.ts`
- Create: `lib/practice/memory-repository.ts`
- Test: `tests/practice-repository.test.ts`
- Modify: `lib/practice/index.ts`

**Produces:**

```ts
export interface PracticeRepository {
  createPracticeSession(session: PracticeSession, items: PracticeItem[]): Promise<void>;
  getPracticeSession(sessionId: string): Promise<PracticeSession | undefined>;
  findPracticeSession(lessonId: string, objectiveId: string): Promise<PracticeSession | undefined>;
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

- [ ] **Step 1: RED repository contract**

Run the same factory-based suite against memory now and Neon in Task 7. Cases: atomic session+items validation, duplicate ID, duplicate `(lessonId,objectiveId)`, item coordinate mismatch, duplicate sequence, sorted item order, HintReveal known-item/coordinate checks, duplicate reveal, Attempt known-item/coordinate checks, duplicate Attempt, attempt order `submittedAt→recordedAt→id`, and defensive cloning.

- [ ] **Step 2: Run RED**

`npx vitest run tests/practice-repository.test.ts`

- [ ] **Step 3: Implement MemoryPracticeRepository**

Follow `MemoryPlanningRepository`: maps + explicit secondary indexes + `structuredClone`. Validate the entire session/item bundle before any map mutation.

- [ ] **Step 4: Verify + commit**

```bash
npx vitest run tests/practice-repository.test.ts
npm test
npm run lint
```

Commit: `feat: add practice repository boundary`

---

### Task 7: Drizzle schema + NeonPracticeRepository + generated migration

**Files:**
- Modify: `lib/persistence/schema.ts`
- Create: `lib/persistence/neon-practice-repository.ts`
- Test: `tests/persistence-practice-schema.test.ts`
- Test: `tests/persistence-neon-practice-contract.test.ts`
- Generated: `migrations/0001_*.sql`, `migrations/meta/*`

**Adds exactly four tables:** `practice_sessions`, `practice_items`, `practice_hint_reveals`, `attempts`.

- [ ] **Step 1: RED schema test without missing-export compile errors**

```ts
import * as schema from '@/lib/persistence/schema';

it('exports the four Phase 4 tables', () => {
  expect(Object.keys(schema)).toEqual(expect.arrayContaining([
    'practiceSessions','practiceItems','practiceHintReveals','attempts',
  ]));
});
```

Migration-content assertion reads all SQL and rejects `mastery_state`, `readiness_state`, `practice_status`, `ability_score`, and `mistakes`.

- [ ] **Step 2: Run RED**

`npx vitest run tests/persistence-practice-schema.test.ts`

Expected: assertion FAIL because Phase 4 exports are absent.

- [ ] **Step 3: Extend Drizzle schema**

Constraints:

```text
practice_sessions UNIQUE(lesson_id, objective_id)
practice_items UNIQUE(session_id, sequence)
practice_hint_reveals UNIQUE(student_id, item_id)
attempts UNIQUE(retry_of_attempt_id)  # PostgreSQL allows multiple NULL roots
attempts INDEX(item_id, submitted_at, id)
attempts INDEX(student_id, objective_id, submitted_at, id)
```

Use JSONB `$type<PracticeProblemSpec>()`, `$type<AnswerSpec>()`, `$type<string[]>()`.

- [ ] **Step 4: Implement NeonPracticeRepository**

Match Task 6 contract. Validate domain objects before writes; use `db.batch()` for atomic session+items; never upsert immutable facts; preserve timestamps; return deterministic ordering.

- [ ] **Step 5: Run pre-migration tests**

After schema code exists, table-export assertions pass while the migration assertion remains RED because `0001` is absent.

- [ ] **Step 6: Generate migration**

`npm run db:generate`

Expected: one Drizzle-generated migration after `0000_old_bushwacker.sql` and updated metadata. Do not hand-write SQL. Do not run `db:migrate`.

- [ ] **Step 7: Inspect SQL**

Verify four new tables, FKs, indexes, unique retry-parent constraint, and no derived-state persistence.

- [ ] **Step 8: Add optional live contract**

```ts
const describeLive = process.env.TEST_DATABASE_URL ? describe : describe.skip;
```

Never read `DATABASE_URL` in this test and never auto-migrate.

- [ ] **Step 9: Verify + commit**

```bash
npx vitest run tests/persistence-practice-schema.test.ts tests/practice-repository.test.ts
npm test
npm run lint
```

Commit: `feat: persist practice facts with neon drizzle`

---

### Task 8: PracticeService orchestration + idempotent recovery

**Files:**
- Create: `lib/practice/service.ts`
- Test: `tests/practice-service.test.ts`
- Modify: `lib/practice/index.ts`

**Produces exact service contract:**

```ts
export interface PracticeIdFactory {
  sessionId(lessonId: string, objectiveId: string): string;
  itemId(sessionId: string, sequence: number): string;
}

export interface PracticeService {
  preparePractice(lessonId: string, objectiveId: string, now: string): Promise<PracticePreparationContext>;
  createPracticeSession(lessonId: string, objectiveId: string, now: string): Promise<PracticeSession>;
  revealHint(sessionId: string, itemId: string, now: string): Promise<string>;
  submitAttempt(input: SubmitAttemptInput, now: string): Promise<Attempt>;
}

export class PracticeServiceImpl implements PracticeService {
  constructor(
    private readonly learningRepository: LearningStateRepository,
    private readonly planningRepository: PlanningRepository,
    private readonly practiceRepository: PracticeRepository,
    private readonly idFactory: PracticeIdFactory,
  ) {}
}
```

- [ ] **Step 1: RED create-session tests**

Prove same lesson/objective returns the exact existing immutable session; generator failure persists nothing; BLOCKED/invalid lesson/objective rejects; exactly four items follow blueprint order; unsupported objective fails closed.

- [ ] **Step 2: RED reveal-hint tests**

Prove first reveal appends one deterministic fact and returns hint; repeat is idempotent; item without hint rejects; session/item mismatch rejects; reveal cannot predate item creation.

- [ ] **Step 3: RED submit-attempt tests**

Prove independent correct, hinted correct, wrong→retry→correct, exact replay, conflicting idempotency key, stored Attempt + missing Evidence repair, latest-only retry, retry-of-correct rejection, and cross-coordinate rejection.

- [ ] **Step 4: Implement createPracticeSession**

Order:

```text
find existing session
→ return existing if found
→ build trusted context
→ derive blueprint
→ allocate deterministic IDs
→ select fail-closed generator
→ generate + validate all items
→ atomic repository create
→ return session
```

For concurrent create race: if repository create fails, re-read `(lessonId,objectiveId)` once; return it only if now present, otherwise rethrow original error.

- [ ] **Step 5: Implement race-safe revealHint**

Use stable `hintRevealId`. If append fails after an earlier read saw none, re-read reveal history once; if the exact stable reveal now exists, return the hint, otherwise rethrow.

- [ ] **Step 6: Implement submitAttempt + `ensureEvidence` helper**

Order:

```text
load session + item
→ derive trusted student/objective coordinates
→ get existing Attempt by input.attemptId
→ if existing: compare sessionId/itemId/answerText/retryOfAttemptId exactly
   → mismatch = idempotency conflict
   → ensure stable Evidence exists from stored Attempt + item
   → return existing Attempt
→ list item Attempts
→ validateRetryAttempt(previous, input, trusted coordinates)
→ derive hintUsed from reveals with revealedAt <= now
→ deterministic grade
→ construct Attempt with server now as submittedAt/recordedAt
→ append Attempt
→ ensure stable Evidence exists
→ return Attempt
```

`ensureEvidence` behavior:

```text
getEvidence(stableId)
→ if exact existing return
→ append projected Evidence
→ if append fails, re-read once
   → if exact projected Evidence now exists, accept concurrent winner
   → otherwise rethrow
```

Never delete an Attempt when Evidence append fails; replay is recovery.

- [ ] **Step 7: Verify + commit**

```bash
npx vitest run tests/practice-service.test.ts
npm test
npm run lint
```

Commit: `feat: orchestrate practice sessions and attempts`

---

### Task 9: Safe optional rendering boundary

**Files:**
- Create: `lib/practice/renderer.ts`
- Test: `tests/practice-renderer-boundary.test.ts`
- Modify: `lib/practice/index.ts`

**Produces:**

```ts
export interface LockedPracticeRenderInput {
  itemId: string;
  objectiveId: string;
  difficultyBand: DifficultyBand;
  promptFrame: string;
  lockedTokens: Record<string, string>;
  hintFrame?: string;
}

export interface RenderedPracticeContent {
  prose?: string;
  explanation?: string;
}

export interface PracticeContentRenderer {
  render(input: LockedPracticeRenderInput): Promise<RenderedPracticeContent>;
}

export class PassthroughPracticeContentRenderer implements PracticeContentRenderer {
  async render(): Promise<RenderedPracticeContent> { return {}; }
}
```

- [ ] **Step 1: RED boundary test**

Use a `satisfies LockedPracticeRenderInput` fixture with only allowed fields and runtime output-key assertions. The interface contains no `AnswerSpec`, `problemSpec`, outcome, Evidence, Mastery, or Readiness field.

- [ ] **Step 2: Run RED**

`npx vitest run tests/practice-renderer-boundary.test.ts`

- [ ] **Step 3: Implement interface/no-op renderer only**

Do not wire MiniMax or any provider into mathematical truth in Phase 4.

- [ ] **Step 4: Verify + commit**

```bash
npx vitest run tests/practice-renderer-boundary.test.ts
npm test
npm run lint
```

Commit: `feat: define safe practice rendering boundary`

---

### Task 10: P2/P3 E2E + closeout

**Files:**
- Create: `tests/practice-e2e.test.ts`
- Modify: `.agent/CURRENT.md`, `.agent/BACKLOG.md`, `CLAUDE.md`, `docs/architecture.md`

- [ ] **Step 1: E2E A — P2 independent correct**

Real supported P2 PRACTICE lesson → session/item → correct FOUNDATION/CORE answer. Assert CORRECT Attempt, `hintUsed=false`, `PRACTICE` Evidence origin, `independent_correct`, and mastery query sees the Evidence without `setMastery`.

- [ ] **Step 2: E2E B — hint then correct**

Reveal through service before submission; assert `correct_with_hint`, never `independent_correct` for that Attempt.

- [ ] **Step 3: E2E C — wrong → retry → correct**

Assert two immutable Attempts and two Evidence records; retry points to latest wrong Attempt; final type is `corrected`.

- [ ] **Step 4: E2E D — P3 application correct**

Use a supported P3 application item; independent APPLICATION/CHALLENGE correct → `application_correct`.

- [ ] **Step 5: E2E E — replay repair**

Seed an Attempt through repository API without its stable Evidence, replay the exact command, assert one Attempt and one repaired Evidence.

- [ ] **Step 6: E2E F — unsupported fail closed**

Use real `P3-MONEY-001`; assert explicit unsupported error, no AI fallback, no persisted session/items.

- [ ] **Step 7: Static boundary audit**

Verify searches show:

```text
no production setMastery
no PracticeSession.status
no mastery_state/readiness_state/practice_status/ability_score/mistakes in Phase 4 schema/migration
no drizzle/@neondatabase import under lib/practice
no @anthropic-ai/sdk/MiniMax import under lib/practice
no TEST_DATABASE_URL fallback to DATABASE_URL
no automatic db:migrate in startup/build
```

- [ ] **Step 8: Update status/backlog only after GREEN evidence**

Mark `MM-P4-001..007` complete only after acceptance passes. Record deterministic generator scope, HintReveal/Attempt/retry/Evidence authority, four new durable fact tables, and whether live Neon contract remains gated. Phase 5 Homework Vision is next; Mistake remains Phase 6.

- [ ] **Step 9: Fresh verification**

Controlled:

```bash
npm test
npm run lint
```

Exact-HEAD host:

```bash
git rev-parse HEAD
npm run typecheck
npm run validate:curriculum
npm run build
```

Only provider/explicit Neon live tests may be intentionally skipped. If GrandeGPT sandbox build is blocked solely by existing Google Fonts network restriction, exact-HEAD host build is the required proof.

- [ ] **Step 10: Commit closeout**

`test: prove phase 4 practice attempt scenarios`

- [ ] **Step 11: Push + open PR**

Use GrandeGPT push/open-PR. PR merge remains explicit Human Owner gate.

---

## Final Review Checklist

1. Base is merged Phase 3 `9660870a996b07b165353eaf53a8fd41a971b0b5`.
2. Stale Phase 3 `PR pending` header is corrected.
3. PracticeSession is one lesson/objective and idempotent by `(lessonId,objectiveId)`.
4. Only PRACTICE/REVIEW lesson intents can start practice; BLOCKED rejects.
5. PracticeItem stores typed code-owned `problemSpec` and derived `AnswerSpec`.
6. Equation-choice structured truth stores options and correct option; two-step word structured truth stores auditable `steps`.
7. Student projection leaks no answer/problem/solution/unrevealed hint.
8. Generator registry covers only approved deep slices and fails closed elsewhere.
9. P2 multiplication/division respects table/range limits and P2-MD-002 measures equation representation.
10. P3 fractions respect denominator/range/related-fraction limits.
11. Word-problem relationship is complete before prompt composition.
12. Grading is pure/deterministic; decimals/fractions use exact math, not float tolerance.
13. Hint use is server-observed append-only fact.
14. Attempt is immutable; client cannot submit outcome/hint/objective/timestamps/Evidence type.
15. Retry is latest-only, linear, same trusted student/session/item/objective, never after correct.
16. Evidence precedence is corrected → correct_with_hint → application/independent after incorrect handling.
17. Phase 4 never auto-produces `explained_independently` via AI grading.
18. Stable Evidence ID supports replay and partial-write repair, including benign concurrent replay.
19. LearningStateRepository only adds `getEvidence`; no Evidence update/delete or setMastery.
20. PracticeRepository has atomic session bundle + append/get/list facts, no mutable score/status API.
21. Memory and Neon adapters share behavior contract.
22. Drizzle adds only practice_sessions/practice_items/practice_hint_reveals/attempts.
23. Generated migration follows `0000_old_bushwacker.sql`; no hand-written SQL substitution.
24. No startup/Preview production migration.
25. Neon live test requires explicit TEST_DATABASE_URL only.
26. `lib/practice` has no infrastructure/provider SDK imports.
27. Optional renderer cannot alter math truth/grade/Evidence.
28. Mistake remains Phase 6; Homework Vision Phase 5; adaptive scoring Phase 7.
29. E2E proves independent, hinted, wrong/retry, application, replay-repair, unsupported cases.
30. Fresh test/lint/typecheck/curriculum/host-build evidence exists before PR.
31. PR merge is a Human Gate.

## Expected Commit Sequence

```text
feat: define phase 4 practice contracts
feat: build trusted practice preparation context
feat: add deterministic practice blueprint policy
feat: generate structured deep slice practice items
feat: grade deterministic practice answers
feat: project practice attempts into evidence
feat: add practice repository boundary
feat: persist practice facts with neon drizzle
feat: orchestrate practice sessions and attempts
feat: define safe practice rendering boundary
test: prove phase 4 practice attempt scenarios
```
