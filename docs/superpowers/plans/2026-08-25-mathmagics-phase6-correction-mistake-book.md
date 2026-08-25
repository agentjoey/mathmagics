# MathMagics Phase 6 — Correction + Mistake Book Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the trusted Phase 6 correction loop from canonical incorrect Practice/Homework Attempts through Mistake diagnosis, original correction, structured independent reasoning, deterministic isomorphic transfer, and replay-safe resolution.

**Architecture:** Add a storage-agnostic `lib/correction` domain layered on the existing canonical `Attempt` and append-only `EvidenceRecord` ledgers. Mistake lifecycle remains a deterministic projection over immutable Mistake identity, append-only events, correction items, reasoning submissions, canonical Attempts, and CORRECTION Evidence; AI is constrained to diagnosis candidates and teaching wording only. Extend the single `attempts` table with `CORRECTION` coordinates and add five Phase 6 fact tables; do not add mutable Mistake state, a second correction-attempt ledger, or Phase 7 adaptation.

**Tech Stack:** TypeScript 5, Next.js 16.2.6, React 19.2.4, Vitest 4.1.6, Drizzle ORM 0.45.2 / drizzle-kit 0.31.10, Neon PostgreSQL, MiniMax M2.7-highspeed through the existing Anthropic-compatible provider path.

**Spec:** `docs/superpowers/specs/2026-08-25-mathmagics-phase6-correction-mistake-book-design.md`

## Global Constraints

- Curriculum truth remains version-controlled Phase 1 data; correction code may read objective misconception/strategy/representation metadata but may not persist a competing curriculum taxonomy.
- Learning history remains append-only `EvidenceRecord`; no Evidence update/delete and no mutable Mastery/Readiness writes.
- Mathematical truth remains code-owned `PracticeProblemSpec + AnswerSpec`; every correction/transfer grade uses existing `gradeAnswer()`.
- There is exactly one canonical `Attempt` ledger. Phase 6 adds `CORRECTION(mistakeId, correctionItemId)` as the third source and must not create `CorrectionAttempt`.
- A Mistake is a learning-problem episode. Related wrong Attempts may attach to the same unresolved `student × objective × confirmed diagnosisTarget`; a resolved episode is never reopened.
- Every canonical `INCORRECT` Practice/Homework Attempt must be eligible for automatic Mistake observation; a correct Attempt cannot create an observation.
- Deterministic diagnosis auto-confirms only exactly one proven allowed target. Zero/multiple targets remain `OBSERVED`.
- AI diagnosis may choose only from the current objective's `misconceptionIds` plus `FACT_ERROR | PROCEDURE_ERROR | REPRESENTATION_ERROR | UNKNOWN`, and cannot self-confirm.
- Student/Parent human confirmation selects only a server-validated target/candidate; arbitrary misconception IDs/free-text labels are rejected.
- AI may generate diagnosis explanation/Socratic wording only; it cannot set objective, diagnosis truth, ProblemSpec, AnswerSpec, grade, Evidence, Mistake state, resolution, Mastery, or Readiness.
- Failed CORRECTION Attempts remain canonical Attempts/Mistake links but emit no additional `incorrect` Evidence.
- `RESOLVED` requires all three: qualifying `corrected` Evidence, qualifying `explained_independently` Evidence, and a first-attempt/no-hint deterministic transfer success producing `application_correct`.
- Structured reasoning is code-owned. AI may render prompts but cannot evaluate PASS/FAIL.
- Transfer is deterministic/isomorphic and fail-closed. Unsupported structures remain `CORRECTING`; there is no AI transfer fallback.
- A transfer item whose first Attempt is wrong is consumed forever for resolution. A later qualifying attempt requires a new server-generated deterministic transfer round.
- `application_correct` is reused for transfer; do not add `transfer_correct`.
- Phase 6 does not auto-insert `CORRECTION` into weekly plans. Next Best Lesson/adaptation stays Phase 7.
- No queue, worker, Redis, vector DB, object storage, multi-household work, dashboard redesign, PDF/multi-image expansion, or new npm dependency.
- Generate and commit `migrations/0003_*.sql`; never run `npm run db:migrate` against production during implementation.
- Live Neon tests require explicit `TEST_DATABASE_URL` and must never fall back to production `DATABASE_URL`.
- Final implementation HEAD must pass `npm test`, `npm run typecheck`, `npm run validate:curriculum`, `npm run lint`, and `npm run build`, with an exact-HEAD Host run when sandbox network/tsx/esbuild limits block equivalent commands.
- Fresh GrandeGPT worktrees may lack `node_modules`. If `vitest/eslint/tsc` is missing, treat this as the known GrandeGPT dependency-bootstrap infrastructure gap; bootstrap dependencies on Host without committing dependency artifacts before continuing TDD.

## File Structure

Create these focused Phase 6 domain files:

```text
lib/correction/
  types.ts               # immutable contracts and public projections
  validation.ts          # contract/taxonomy/source validation
  diagnosis.ts           # deterministic diagnosis and allowed-target rules
  projection.ts          # Mistake lifecycle + recurrence/misconception summaries
  problem-resolver.ts    # trusted PRACTICE/HOMEWORK source reconstruction
  evidence.ts            # stable CORRECTION Evidence identities/projection
  reasoning.ts           # code-owned reasoning policies and deterministic grading
  transfer.ts            # deterministic isomorphic transfer registry/generation
  repository.ts          # append/read-only Mistake repository interface
  memory-repository.ts   # test/in-memory fact store
  service.ts             # orchestration, idempotency, replay repair
  student-view.ts        # student-safe correction backlog projection
  parent-view.ts         # parent/tutor Active/Resolved/Recurring projection
  index.ts               # public exports

lib/providers/
  correction.ts          # narrow AI provider contracts
  minimax-correction.ts  # constrained MiniMax adapter + output validation

lib/persistence/
  neon-correction-repository.ts
```

Modify only the existing files whose authority must expand:

```text
lib/practice/types.ts
lib/practice/validation.ts
lib/practice/repository.ts
lib/practice/memory-repository.ts
lib/practice/service.ts
lib/practice/index.ts
lib/homework/service.ts
lib/persistence/neon-practice-repository.ts
lib/persistence/schema.ts
.agent/BACKLOG.md
.agent/CURRENT.md
```

Add focused tests rather than one giant Phase 6 file:

```text
tests/correction-contracts.test.ts
tests/correction-diagnosis.test.ts
tests/correction-projection.test.ts
tests/correction-problem-resolver.test.ts
tests/correction-provider.test.ts
tests/correction-reasoning.test.ts
tests/correction-transfer.test.ts
tests/correction-repository.test.ts
tests/correction-service.test.ts
tests/correction-e2e.test.ts
tests/correction-views.test.ts
tests/persistence-correction-schema.test.ts
tests/persistence-neon-correction-contract.test.ts
```

---

### Task 1: Correction Contracts, Taxonomy, Diagnosis and Lifecycle Projection

**Files:**
- Create: `lib/correction/types.ts`
- Create: `lib/correction/validation.ts`
- Create: `lib/correction/diagnosis.ts`
- Create: `lib/correction/projection.ts`
- Create: `lib/correction/index.ts`
- Test: `tests/correction-contracts.test.ts`
- Test: `tests/correction-diagnosis.test.ts`
- Test: `tests/correction-projection.test.ts`

**Interfaces:**
- Consumes: `Attempt`, `PracticeProblemSpec`, `AnswerSpec`, `EvidenceRecord` from existing domains; `getLearningObjective()` / `getMisconceptions()` from `lib/curriculum`.
- Produces:

```ts
export type MistakeState = 'OBSERVED' | 'CONFIRMED' | 'CORRECTING' | 'RESOLVED';
export type GenericDiagnosisCode = 'FACT_ERROR' | 'PROCEDURE_ERROR' | 'REPRESENTATION_ERROR' | 'UNKNOWN';
export type DiagnosisTarget =
  | { kind: 'MISCONCEPTION'; misconceptionId: string }
  | { kind: 'GENERIC'; code: GenericDiagnosisCode };

export interface Mistake {
  id: string;
  studentId: string;
  objectiveId: string;
  initialAttemptId: string;
  initialDiagnosisTarget: DiagnosisTarget;
  diagnosisPolicyVersion: 'mistake-diagnosis-v1';
  firstObservedAt: string;
  createdAt: string;
}

export type MistakeAttemptRole = 'OBSERVATION' | 'CORRECTION_RETRY' | 'TRANSFER';
export interface MistakeAttemptLink {
  mistakeId: string;
  attemptId: string;
  role: MistakeAttemptRole;
  linkedAt: string;
}

export type MistakeEventType =
  | 'MISTAKE_OBSERVED'
  | 'ATTEMPT_LINKED'
  | 'DIAGNOSIS_CANDIDATE_RECORDED'
  | 'DIAGNOSIS_CONFIRMED'
  | 'CORRECTION_STARTED'
  | 'GUIDANCE_PREPARED'
  | 'REASONING_ASSISTANCE_REVEALED'
  | 'MISTAKE_CONSOLIDATED'
  | 'MISTAKE_RESOLVED';

export interface MistakeEvent {
  id: string;
  mistakeId: string;
  type: MistakeEventType;
  payload: Record<string, unknown>;
  actorKind: 'SYSTEM' | 'STUDENT' | 'PARENT' | 'AI_PROVIDER';
  policyVersion: string;
  occurredAt: string;
}

export interface TrustedAttemptProblem {
  attempt: Attempt;
  problemSpec: PracticeProblemSpec;
  answerSpec: AnswerSpec;
  prompt: string;
  hint?: string;
  solutionOutline: string[];
  classification: 'FOUNDATION' | 'CORE' | 'APPLICATION' | 'CHALLENGE';
}

export interface DeterministicDiagnosisResult {
  allowedTargets: DiagnosisTarget[];
  provenTargets: DiagnosisTarget[];
  observations: string[];
}

export interface MistakeProjectionInput {
  mistake: Mistake;
  events: MistakeEvent[];
  links: MistakeAttemptLink[];
  attempts: Attempt[];
  evidence: EvidenceRecord[];
  correctionItems: CorrectionItem[];
  reasoningChecks: CorrectionReasoningCheck[];
}

export function allowedDiagnosisTargets(objectiveId: string): DiagnosisTarget[];
export function diagnoseDeterministically(problem: TrustedAttemptProblem): DeterministicDiagnosisResult;
export function confirmedDiagnosisTarget(events: MistakeEvent[]): DiagnosisTarget | null;
export function projectMistakeState(input: MistakeProjectionInput): MistakeState;
```

The `CorrectionItem` / `CorrectionReasoningCheck` names are declared in `types.ts` now even though mechanics arrive in Task 3, so later tasks use one stable contract.

- [ ] **Step 1: Write contract tests that reject mutable/invalid shapes**

Add `tests/correction-contracts.test.ts` covering valid target/event/item/check shapes and failures for blank IDs, malformed timestamps, out-of-taxonomy misconception IDs, invalid generic codes, cross-student/objective coordinates, invalid transfer round, and unexpected mutable `state` authority.

Representative assertion:

```ts
expect(() => assertValidDiagnosisTarget('P3-FRA-003', {
  kind: 'MISCONCEPTION',
  misconceptionId: 'MIS-NOT-IN-OBJECTIVE',
})).toThrow('diagnosis target is not allowed for objective P3-FRA-003');
```

- [ ] **Step 2: Run the contract test and confirm RED**

Run:

```bash
npm test -- tests/correction-contracts.test.ts
```

Expected: FAIL because `lib/correction` contracts/validators do not exist.

- [ ] **Step 3: Implement minimal immutable contracts and validation**

In `types.ts`, define the unions/interfaces above plus:

```ts
export type CorrectionItemKind = 'ORIGINAL_RETRY' | 'TRANSFER';

export interface CorrectionItem {
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

export type ReasoningCheckSpec =
  | {
      id: string;
      kind: 'CHOICE';
      prompt: string;
      options: Array<{ id: string; label: string }>;
      expectedOptionId: string;
    }
  | {
      id: string;
      kind: 'FIELDS';
      prompt: string;
      fields: string[];
      expected: Record<string, string>;
    };

export interface CorrectionReasoningCheck {
  id: string;
  mistakeId: string;
  studentId: string;
  objectiveId: string;
  checkSpec: ReasoningCheckSpec;
  response: Record<string, string>;
  outcome: 'PASS' | 'FAIL';
  assisted: boolean;
  policyVersion: 'correction-reasoning-v1';
  submittedAt: string;
  recordedAt: string;
}
```

`validation.ts` must call `getLearningObjective(objectiveId)` and allow only that objective's `misconceptionIds` plus the four generic codes.

- [ ] **Step 4: Run contract tests and confirm GREEN**

Run:

```bash
npm test -- tests/correction-contracts.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write deterministic diagnosis tests**

`tests/correction-diagnosis.test.ts` must include exact code-owned cases:

```ts
// P3 fraction compare: student claims 1/8 > 1/4.
expect(diagnoseDeterministically(problem).provenTargets).toEqual([
  { kind: 'MISCONCEPTION', misconceptionId: 'MIS-FRA-DENOMINATOR-SIZE' },
]);

// P2 multiplication arithmetic with a wrong numeric product but correct operation shape.
expect(diagnoseDeterministically(factError).provenTargets).toEqual([
  { kind: 'MISCONCEPTION', misconceptionId: 'MIS-MD-FACT-RETRIEVAL' },
]);
```

Also cover zero proven target and an intentionally ambiguous shape that yields more than one candidate but no auto-confirm.

- [ ] **Step 6: Run diagnosis tests and confirm RED**

Run:

```bash
npm test -- tests/correction-diagnosis.test.ts
```

Expected: FAIL because diagnosis policy is absent.

- [ ] **Step 7: Implement `mistake-diagnosis-v1` conservatively**

Implement explicit predicates only. Do not infer from prose when the typed problem/answer/student answer cannot prove the misconception. The function may return observations for AI context, but only `provenTargets.length === 1` is eligible for automatic `DIAGNOSIS_CONFIRMED` later.

- [ ] **Step 8: Write lifecycle projection tests**

Cover:

```text
observation only -> OBSERVED
unique DIAGNOSIS_CONFIRMED -> CONFIRMED
CORRECTION_STARTED -> CORRECTING
corrected only -> CORRECTING
corrected + explained -> CORRECTING
corrected + explained + qualifying transfer -> RESOLVED
MISTAKE_RESOLVED event without hard facts -> still CORRECTING
MISTAKE_CONSOLIDATED -> alias/non-active projection, never a second active episode
```

- [ ] **Step 9: Implement pure lifecycle and summary projection**

`projectMistakeState()` must never trust an event name alone for resolution. Add helpers for deterministic event ordering `(occurredAt,id)` and a `deriveMisconceptionSummary()` projection that can later aggregate active/resolved/recurrence counts without a mutable analytics table.

- [ ] **Step 10: Run Task 1 tests and existing curriculum tests**

Run:

```bash
npm test -- tests/correction-contracts.test.ts tests/correction-diagnosis.test.ts tests/correction-projection.test.ts tests/curriculum-queries.test.ts tests/curriculum-validation.test.ts
npm run typecheck
```

Expected: all PASS.

- [ ] **Step 11: Commit Task 1**

```bash
git add lib/correction tests/correction-contracts.test.ts tests/correction-diagnosis.test.ts tests/correction-projection.test.ts
git commit -m "feat: add correction domain and mistake projection"
```

---

### Task 2: Trusted Attempt Problem Resolver and Constrained Correction AI Provider

**Files:**
- Create: `lib/correction/problem-resolver.ts`
- Create: `lib/providers/correction.ts`
- Create: `lib/providers/minimax-correction.ts`
- Modify: `lib/correction/index.ts`
- Test: `tests/correction-problem-resolver.test.ts`
- Test: `tests/correction-provider.test.ts`

**Interfaces:**
- Consumes: `PracticeRepository.getPracticeItem()`, `HomeworkRepository`, `deriveEffectiveHomeworkObservation()`, `convertHomeworkProblem()`, `mapHomeworkObjective()`, `LearningStateRepository.getStudent()`, curriculum strategies/representations, Task 1 diagnosis types.
- Produces:

```ts
export interface AttemptProblemResolver {
  resolve(attempt: Attempt): Promise<TrustedAttemptProblem>;
}

export class RepositoryAttemptProblemResolver implements AttemptProblemResolver {
  constructor(
    practiceRepository: PracticeRepository,
    homeworkRepository: HomeworkRepository,
    learningRepository: LearningStateRepository,
  );
  resolve(attempt: Attempt): Promise<TrustedAttemptProblem>;
}

export interface MistakeDiagnosisContext {
  objectiveId: string;
  allowedTargets: DiagnosisTarget[];
  problemDescription: string;
  studentAnswer: string;
  deterministicObservations: string[];
}

export interface DiagnosisCandidate {
  target: DiagnosisTarget;
  rationale: string;
}

export interface TrustedCorrectionContext {
  mistakeId: string;
  objectiveId: string;
  diagnosisTarget: DiagnosisTarget;
  problem: Omit<TrustedAttemptProblem, 'answerSpec'>;
  strategies: Array<{ id: string; name: string; description: string }>;
  representations: Array<{ id: string; name: string; description: string }>;
  reasoningChecks: ReasoningCheckSpec[];
}

export interface CorrectionGuidance {
  diagnosisExplanation: string;
  socraticPrompts: string[];
  workedExplanation?: string;
}

export interface CorrectionAIProvider {
  proposeDiagnosis(context: MistakeDiagnosisContext): Promise<DiagnosisCandidate>;
  prepareGuidance(context: TrustedCorrectionContext): Promise<CorrectionGuidance>;
}
```

- [ ] **Step 1: Write resolver tests for PRACTICE and HOMEWORK**

Practice test must prove source/session/item/student/objective coordinates are validated and trusted truth comes from immutable `PracticeItem`.

Homework test must prove reconstruction does this exact chain:

```text
HomeworkProblem + confirmations
→ deriveEffectiveHomeworkObservation
→ convertHomeworkProblem
→ mapHomeworkObjective(student.levelId,...)
→ exactly one objective matching Attempt.objectiveId
→ TrustedAttemptProblem
```

A provider-supplied answer/objective is never consulted. A low-confidence/unconfirmed or unsupported Homework problem must reject correction resolution.

- [ ] **Step 2: Run resolver test and confirm RED**

```bash
npm test -- tests/correction-problem-resolver.test.ts
```

Expected: FAIL because resolver does not exist.

- [ ] **Step 3: Implement resolver with strict source branching**

Use an exhaustive switch:

```ts
switch (attempt.source.kind) {
  case 'PRACTICE':
    return resolvePractice(attempt);
  case 'HOMEWORK':
    return resolveHomework(attempt);
  case 'CORRECTION':
    throw new Error('correction attempts are not valid root mistake observations');
}
```

Do not infer a problem from `attempt.answerText`, invoke Vision again, or require raw image bytes.

- [ ] **Step 4: Run resolver tests and confirm GREEN**

```bash
npm test -- tests/correction-problem-resolver.test.ts tests/homework-conversion.test.ts tests/homework-objective-mapping.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write provider authority tests**

Use injected fake LLM calls as existing provider tests do. Assert:

1. allowed target returns a candidate but no confirmation/event/evidence;
2. an out-of-taxonomy target is rejected;
3. malformed JSON is rejected;
4. extra fields such as `grade`, `objectiveId`, `evidenceType`, `studentUnderstands`, `resolved` are ignored/rejected and never become trusted output;
5. guidance output is strings only and cannot return ProblemSpec/AnswerSpec/grade.

- [ ] **Step 6: Implement `MiniMaxCorrectionProvider`**

Use existing `minimaxChat()` and JSON-only prompts. For diagnosis, send the exact `allowedTargets` values and instruct the model to choose one target verbatim. After parsing, call `assertValidDiagnosisTarget(context.objectiveId, candidate.target)` and also require exact membership in `context.allowedTargets`.

For guidance, omit `answerSpec` from model input. The system prompt must state that the model writes teaching language only and cannot assert grade, evidence, state, or resolution.

- [ ] **Step 7: Run Task 2 tests + typecheck**

```bash
npm test -- tests/correction-problem-resolver.test.ts tests/correction-provider.test.ts tests/homework-provider.test.ts tests/lesson-brief-generator.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit Task 2**

```bash
git add lib/correction/problem-resolver.ts lib/correction/index.ts lib/providers/correction.ts lib/providers/minimax-correction.ts tests/correction-problem-resolver.test.ts tests/correction-provider.test.ts
git commit -m "feat: add trusted correction resolver and AI boundary"
```

---

### Task 3: CORRECTION Attempt Source, Evidence, Reasoning Policies and Isomorphic Transfer

**Files:**
- Modify: `lib/practice/types.ts`
- Modify: `lib/practice/validation.ts`
- Modify: `lib/practice/repository.ts`
- Modify: `lib/practice/memory-repository.ts`
- Modify: `lib/practice/index.ts`
- Create: `lib/correction/evidence.ts`
- Create: `lib/correction/reasoning.ts`
- Create: `lib/correction/transfer.ts`
- Modify: `lib/correction/index.ts`
- Test: `tests/practice-attempt-source.test.ts`
- Test: `tests/correction-reasoning.test.ts`
- Test: `tests/correction-transfer.test.ts`

**Interfaces:**
- Consumes: Task 1 `CorrectionItem`, `CorrectionReasoningCheck`, `ReasoningCheckSpec`; existing `gradeAnswer()` / `AnswerSpec` and Evidence types.
- Produces:

```ts
export type AttemptSource =
  | { kind: 'PRACTICE'; sessionId: string; itemId: string }
  | { kind: 'HOMEWORK'; submissionId: string; problemId: string }
  | { kind: 'CORRECTION'; mistakeId: string; correctionItemId: string };

export function correctionEvidenceIdForAttempt(attemptId: string, type: 'corrected' | 'application_correct'): string;
export function reasoningEvidenceId(mistakeId: string, policyVersion: string): string;
export function projectCorrectedEvidence(attempt: Attempt, item: CorrectionItem): EvidenceRecord | null;
export function projectTransferEvidence(attempt: Attempt, item: CorrectionItem, priorAttempts: Attempt[]): EvidenceRecord | null;

export function buildReasoningChecks(problem: TrustedAttemptProblem, target: DiagnosisTarget): ReasoningCheckSpec[];
export function gradeReasoningResponse(spec: ReasoningCheckSpec, response: Record<string,string>): 'PASS' | 'FAIL';

export interface TrustedTransferContext {
  mistakeId: string;
  studentId: string;
  objectiveId: string;
  sourceAttemptId: string;
  original: TrustedAttemptProblem;
  round: number;
  itemId: string;
  now: string;
}

export function generateCorrectionTransfer(context: TrustedTransferContext): CorrectionItem;
```

Also add repository read support:

```ts
listAttemptsForCorrectionItem(correctionItemId: string): Promise<Attempt[]>;
```

- [ ] **Step 1: Extend Attempt source tests first**

Add valid CORRECTION coordinates and reject mixed coordinates. Preserve existing PRACTICE/HOMEWORK tests unchanged.

Representative domain assertion:

```ts
const attempt: Attempt = {
  id: 'attempt-c1',
  source: { kind: 'CORRECTION', mistakeId: 'mistake-1', correctionItemId: 'correction-1' },
  studentId: 'student-1',
  objectiveId: 'P3-FRA-003',
  answerText: '1/4',
  outcome: 'CORRECT',
  hintUsed: true,
  retryOfAttemptId: 'attempt-original',
  gradingPolicyVersion: 'grading-v1',
  submittedAt: '2026-08-25T12:00:00.000Z',
  recordedAt: '2026-08-25T12:00:00.000Z',
};
expect(() => assertValidAttempt(attempt)).not.toThrow();
```

- [ ] **Step 2: Run source tests and confirm RED**

```bash
npm test -- tests/practice-attempt-source.test.ts
```

Expected: FAIL because CORRECTION is not accepted.

- [ ] **Step 3: Implement source union + memory repository query**

Update validation exhaustively. Do not weaken retry provenance: original correction retry points to root incorrect Attempt; subsequent original retries form a linear chain. Add `listAttemptsForCorrectionItem()` sorted by `(submittedAt,id)`.

- [ ] **Step 4: Write reasoning policy tests**

Required representative policies:

```text
P2 equal groups: identify total, group count, group size
P2 inverse multiplication/division: choose the matching inverse relation
P3 fraction denominator/part-size: larger denominator means smaller equal part for the same whole
P3 equivalent fraction: numerator and denominator change by the same scale factor
```

Test exact PASS/FAIL for CHOICE/FIELDS response forms. Unsupported target/problem combinations return no policy and therefore fail closed at service level.

- [ ] **Step 5: Implement `correction-reasoning-v1`**

All expected values derive from `PracticeProblemSpec`; no expected answer comes from AI. Keep check IDs deterministic from Mistake/policy/check ordinal when the service instantiates them.

- [ ] **Step 6: Write transfer generator tests**

Cover current typed families with explicit invariants:

- ARITHMETIC: same operation; multiplication keeps one factor in tables `[2,3,4,5,10]`; division remains exact.
- EQUATION_CHOICE: same scenario; new total/groups/groupSize stay internally consistent; correct option remains code-derived.
- FRACTION_COMPARE: same kind; positive denominators; changed safe fractions; answer derived by cross multiplication.
- FRACTION_EQUIVALENT: same missing side and scale semantics; changed base fraction/scale.
- FRACTION_SIMPLIFY: changed reducible fraction; exact simplest AnswerSpec.
- FRACTION_OPERATION: same ADD/SUBTRACT; positive denominators; changed safe values with deterministic result.
- WORD_PROBLEM: preserve `structure`, step operation sequence, and template family; change quantities only when every step/result can be recomputed deterministically. If a template cannot be safely regenerated, `generateCorrectionTransfer()` throws `UnsupportedCorrectionTransferError`.

Assert a different round deterministically produces a different safe parameter set, while a repeated identical context reproduces exactly the same item.

- [ ] **Step 7: Implement deterministic transfer registry**

Do not call ordinary Practice slot sequencing and do not use randomness/client seeds. Derive parameters from `(objectiveId, original problem spec, round)` with code-owned bounded transforms. Never use AI fallback.

- [ ] **Step 8: Implement source-aware CORRECTION Evidence projectors**

Rules:

```text
ORIGINAL_RETRY + deterministic CORRECT -> corrected
ORIGINAL_RETRY + INCORRECT -> no Evidence
TRANSFER + first attempt + CORRECT + hintUsed=false -> application_correct
TRANSFER + first attempt wrong -> no successful Evidence; item consumed
TRANSFER + second/later correct -> no application_correct
```

`explained_independently` is handled from reasoning facts, not an Attempt.

- [ ] **Step 9: Run Task 3 tests and regress Phase 4/5 Attempt/Evidence tests**

```bash
npm test -- tests/practice-attempt-source.test.ts tests/practice-evidence.test.ts tests/homework-e2e.test.ts tests/correction-reasoning.test.ts tests/correction-transfer.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 10: Commit Task 3**

```bash
git add lib/practice lib/correction/evidence.ts lib/correction/reasoning.ts lib/correction/transfer.ts lib/correction/index.ts tests/practice-attempt-source.test.ts tests/correction-reasoning.test.ts tests/correction-transfer.test.ts
git commit -m "feat: add deterministic correction mechanics"
```

---

### Task 4: Append-Only Repository, Drizzle Schema, Neon Adapter and Migration

**Files:**
- Create: `lib/correction/repository.ts`
- Create: `lib/correction/memory-repository.ts`
- Create: `lib/persistence/neon-correction-repository.ts`
- Modify: `lib/persistence/neon-practice-repository.ts`
- Modify: `lib/persistence/schema.ts`
- Modify: `lib/correction/index.ts`
- Test: `tests/correction-repository.test.ts`
- Test: `tests/persistence-correction-schema.test.ts`
- Test: `tests/persistence-neon-correction-contract.test.ts`
- Create: `migrations/0003_*.sql` plus drizzle metadata generated by `npm run db:generate`

**Interfaces:**
- Consumes: Task 1/3 contracts and canonical Attempt repository.
- Produces append/read-only persistence:

```ts
export interface MistakeRepository {
  appendMistake(mistake: Mistake): Promise<void>;
  findMistake(id: string): Promise<Mistake | undefined>;
  listMistakesForStudentObjective(studentId: string, objectiveId: string): Promise<Mistake[]>;

  appendAttemptLink(link: MistakeAttemptLink): Promise<void>;
  listAttemptLinks(mistakeId: string): Promise<MistakeAttemptLink[]>;

  appendEvent(event: MistakeEvent): Promise<void>;
  getEvent(id: string): Promise<MistakeEvent | undefined>;
  listEvents(mistakeId: string): Promise<MistakeEvent[]>;

  appendCorrectionItem(item: CorrectionItem): Promise<void>;
  getCorrectionItem(id: string): Promise<CorrectionItem | undefined>;
  listCorrectionItems(mistakeId: string): Promise<CorrectionItem[]>;

  appendReasoningCheck(check: CorrectionReasoningCheck): Promise<void>;
  getReasoningCheck(id: string): Promise<CorrectionReasoningCheck | undefined>;
  listReasoningChecks(mistakeId: string): Promise<CorrectionReasoningCheck[]>;
}
```

Do not add `setMistakeState`, `markResolved`, `updateDiagnosis`, delete methods, or mutable mastery methods.

- [ ] **Step 1: Write memory repository append-only/idempotency tests**

Verify same ID + exact same payload is replay-safe where service expects it, conflicting reuse is rejected, ordering is stable, and returned objects are cloned so callers cannot mutate stored facts.

- [ ] **Step 2: Run repository tests and confirm RED**

```bash
npm test -- tests/correction-repository.test.ts
```

Expected: FAIL because repository files do not exist.

- [ ] **Step 3: Implement memory repository**

Keep maps/arrays private; validate every append with Task 1 validators. `listMistakesForStudentObjective()` returns facts only; open/canonical episode resolution stays in service/projection code.

- [ ] **Step 4: Write schema tests before changing Drizzle**

`tests/persistence-correction-schema.test.ts` must assert all five tables and fields, including:

```text
mistakes: no state column
mistake_attempt_links: composite unique mistake_id + attempt_id
mistake_events: append-only event fields
correction_items: original/transfer facts + transfer_round
correction_reasoning_checks: response/outcome/assisted facts
attempts: correction_mistake_id + correction_item_id
```

Also inspect generated SQL after generation for the exclusive three-source CHECK and absence of raw image/base64/object URL/mutable mistake-state columns.

- [ ] **Step 5: Modify Drizzle schema with safe FK order**

Use `AnyPgColumn` where needed for the existing Attempts/Mistake cycle:

```text
mistakes.initial_attempt_id -> attempts.id
correction_items.source_attempt_id -> attempts.id
attempts.correction_mistake_id -> mistakes.id
attempts.correction_item_id -> correction_items.id
```

Update `attempt_source_coordinates_ck` so exactly one of PRACTICE, HOMEWORK, CORRECTION coordinate pairs is populated.

- [ ] **Step 6: Extend NeonPracticeRepository for CORRECTION source**

`rowToAttempt()` and `appendAttempt()` must round-trip all three source variants and reject impossible mixed rows. Add `listAttemptsForCorrectionItem()`.

- [ ] **Step 7: Implement NeonMistakeRepository**

Follow existing Neon repository patterns: exact inserts, stable ordering, JSON typed columns, no updates/deletes. Live contract test must skip unless `TEST_DATABASE_URL` exists and must never read `DATABASE_URL` as a fallback.

- [ ] **Step 8: Run schema/repository tests before migration generation**

```bash
npm test -- tests/correction-repository.test.ts tests/persistence-correction-schema.test.ts tests/persistence-practice-schema.test.ts tests/persistence-homework-schema.test.ts
npm run typecheck
```

Expected: PASS at TypeScript/schema-definition level.

- [ ] **Step 9: Generate migration, never migrate**

Run only:

```bash
npm run db:generate
```

Expected: a new `migrations/0003_*.sql` and matching `migrations/meta` update. Do **not** run `npm run db:migrate`.

If GrandeGPT sandbox fails at drizzle/esbuild spawn with the known `EPERM`, run this exact `db:generate` command once on Host in the task worktree, then return to controlled tests. This is an infrastructure gate, not permission to apply any database migration.

- [ ] **Step 10: Audit generated SQL explicitly**

Confirm the migration:

1. creates all five Phase 6 tables;
2. adds correction coordinates to `attempts`;
3. replaces the two-source CHECK with exactly three exclusive source shapes;
4. preserves existing PRACTICE/HOMEWORK semantics/defaults;
5. adds required FKs/indexes/uniques;
6. does not rebuild/drop the Attempts ledger unnecessarily;
7. contains no `mistake_state`, raw homework bytes/base64, object-store URL, mutable mastery/readiness table.

- [ ] **Step 11: Run persistence suite**

```bash
npm test -- tests/persistence-schema.test.ts tests/persistence-practice-schema.test.ts tests/persistence-homework-schema.test.ts tests/persistence-correction-schema.test.ts tests/persistence-neon-practice-contract.test.ts tests/persistence-neon-homework-contract.test.ts tests/persistence-neon-correction-contract.test.ts
npm run typecheck
```

Expected: local schema tests PASS; live Neon tests intentionally SKIP without explicit `TEST_DATABASE_URL`.

- [ ] **Step 12: Commit Task 4**

```bash
git add lib/correction/repository.ts lib/correction/memory-repository.ts lib/correction/index.ts lib/persistence lib/practice migrations tests/correction-repository.test.ts tests/persistence-correction-schema.test.ts tests/persistence-neon-correction-contract.test.ts
git commit -m "feat: persist correction and mistake facts"
```

---

### Task 5: Correction Service, Idempotency, Human Confirmation and Replay Repair

**Files:**
- Create: `lib/correction/service.ts`
- Modify: `lib/correction/index.ts`
- Test: `tests/correction-service.test.ts`

**Interfaces:**
- Consumes: Task 1 projection/diagnosis, Task 2 resolver/provider, Task 3 mechanics, Task 4 repositories, `LearningStateRepository`, canonical `PracticeRepository`.
- Produces:

```ts
export interface CorrectionIdFactory {
  mistakeId(attemptId: string): string;
  eventId(mistakeId: string, kind: string, discriminator: string): string;
  correctionItemId(mistakeId: string, kind: 'ORIGINAL_RETRY' | 'TRANSFER', round?: number): string;
  reasoningCheckId(mistakeId: string, policyVersion: string, ordinal: number): string;
  attemptId(correctionItemId: string, sequence: number): string;
}

export interface ObserveIncorrectAttemptInput { attemptId: string; }
export interface ConfirmDiagnosisInput {
  mistakeId: string;
  target: DiagnosisTarget;
  confirmerRole: 'STUDENT' | 'PARENT';
}
export interface SubmitCorrectionRetryInput {
  mistakeId: string;
  correctionItemId: string;
  attemptId: string;
  answerText: string;
}
export interface SubmitReasoningCheckInput {
  mistakeId: string;
  checkId: string;
  submissionId: string;
  response: Record<string,string>;
}
export interface SubmitTransferAttemptInput {
  mistakeId: string;
  correctionItemId: string;
  attemptId: string;
  answerText: string;
}

export class CorrectionServiceImpl {
  observeIncorrectAttempt(input: ObserveIncorrectAttemptInput, now: string): Promise<Mistake>;
  proposeDiagnosis(mistakeId: string, now: string): Promise<DiagnosisCandidate>;
  confirmDiagnosis(input: ConfirmDiagnosisInput, now: string): Promise<MistakeProjection>;
  startCorrection(mistakeId: string, now: string): Promise<CorrectionStartProjection>;
  revealReasoningHelp(mistakeId: string, checkId: string, now: string): Promise<void>;
  submitCorrectionRetry(input: SubmitCorrectionRetryInput, now: string): Promise<Attempt>;
  submitReasoningCheck(input: SubmitReasoningCheckInput, now: string): Promise<CorrectionReasoningCheck>;
  prepareTransfer(mistakeId: string, now: string): Promise<CorrectionItem>;
  submitTransferAttempt(input: SubmitTransferAttemptInput, now: string): Promise<Attempt>;
  getMistake(mistakeId: string): Promise<MistakeProjection>;
  listOpenMistakes(studentId: string): Promise<MistakeProjection[]>;
  getMisconceptionSummary(studentId: string): Promise<MisconceptionSummary[]>;
}
```

`revealReasoningHelp()` is the concrete server-observed mechanism required by the approved `assisted` rule. It appends `REASONING_ASSISTANCE_REVEALED` keyed to a check. `submitReasoningCheck()` derives `assisted` from that durable event; the client never supplies the boolean.

- [ ] **Step 1: Write observation/idempotency tests**

Cover:

- correct Attempt rejected;
- missing Attempt rejected;
- root source must be PRACTICE/HOMEWORK, never CORRECTION;
- unique deterministic diagnosis creates Mistake + observation link + `MISTAKE_OBSERVED` + `DIAGNOSIS_CONFIRMED` exactly once;
- zero/multiple diagnosis remains OBSERVED;
- repeated same command returns same episode/link/events;
- matching confirmed unresolved episode absorbs a later related incorrect Attempt;
- after resolution, the same target creates a new episode;
- provisional UNKNOWN confirmed into an already-open target episode consolidates via `MISTAKE_CONSOLIDATED` and query canonicalization.

- [ ] **Step 2: Run observation tests and confirm RED**

```bash
npm test -- tests/correction-service.test.ts
```

Expected: FAIL because service does not exist.

- [ ] **Step 3: Implement observation + diagnosis confirmation**

Open-episode search must use loaded Mistake/events and `projectMistakeState()`; do not add a mutable state column or repository setter.

`proposeDiagnosis()` calls AI only when there is no exactly-one deterministic confirmation. It appends a candidate audit event but returns state `OBSERVED` until `confirmDiagnosis()` appends human confirmation.

- [ ] **Step 4: Add correction-start and original-retry tests**

Assert start requires CONFIRMED, returns stable ORIGINAL_RETRY item, and guidance is optional teaching content. Original retry:

```text
trusted CorrectionItem
→ gradeAnswer
→ canonical CORRECTION Attempt
→ linear retry provenance
→ MistakeAttemptLink(role=CORRECTION_RETRY)
→ correct => exactly one corrected Evidence
→ wrong => no extra incorrect Evidence
```

Replay case: existing Attempt but missing link/Evidence is repaired without another Attempt.

- [ ] **Step 5: Implement correction-start/retry with replay repair**

Use deterministic IDs for item/evidence/events. Before appending, compare existing same-ID facts exactly; conflicting reuse fails closed.

- [ ] **Step 6: Add reasoning assistance + independent Evidence tests**

Cover:

1. PASS with no help event qualifies;
2. FAIL never qualifies;
3. help revealed for check makes that submission `assisted=true` even if response is correct;
4. a later fresh unassisted PASS for the same required check may qualify;
5. all required checks must have qualifying PASS before exactly-one `explained_independently` Evidence is appended;
6. unsupported reasoning policy leaves CORRECTING.

- [ ] **Step 7: Implement reasoning service actions**

`check_spec` is reconstructed code-side and persisted with each immutable submission. The response cannot alter expected values. `explained_independently` uses stable ID `correction-reasoning:${mistakeId}:correction-reasoning-v1` or an equivalent deterministic convention fixed in `evidence.ts`.

- [ ] **Step 8: Add transfer/resolution tests**

Cover:

- prepareTransfer rejects until corrected + explained Evidence exist;
- unsupported family throws fail-closed error and leaves state CORRECTING;
- round 1 deterministic item is stable on replay;
- first correct/no-hint Attempt emits application_correct and hard gate resolves;
- first wrong Attempt consumes round 1; later correct retry on same item does not emit application_correct;
- after additional correction/reasoning, server creates deterministic round 2 with different parameters;
- `MISTAKE_RESOLVED` receipt is repaired if Evidence exists but receipt write was interrupted;
- a fake/early resolution event never forces state RESOLVED.

- [ ] **Step 9: Implement transfer submit + resolution repair**

Transfer items have no hint surface in V1, so qualifying transfer Attempts are server-recorded `hintUsed=false`. If a future hint is added, it must gain an explicit server-observed reveal fact before eligibility can change.

- [ ] **Step 10: Run Task 5 focused suite**

```bash
npm test -- tests/correction-service.test.ts tests/correction-projection.test.ts tests/correction-reasoning.test.ts tests/correction-transfer.test.ts tests/practice-hints-retry.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 11: Commit Task 5**

```bash
git add lib/correction/service.ts lib/correction/index.ts tests/correction-service.test.ts
git commit -m "feat: orchestrate trusted correction workflow"
```

---

### Task 6: Automatic Attempt Observation, Student/Parent Projections and Phase 6 End-to-End

**Files:**
- Modify: `lib/practice/service.ts`
- Modify: `lib/homework/service.ts`
- Create: `lib/correction/student-view.ts`
- Create: `lib/correction/parent-view.ts`
- Modify: `lib/correction/index.ts`
- Test: `tests/practice-service.test.ts`
- Test: `tests/homework-service.test.ts`
- Test: `tests/correction-views.test.ts`
- Test: `tests/correction-e2e.test.ts`

**Interfaces:**
- Introduce a narrow post-Attempt hook without making Practice/Homework own Mistake internals:

```ts
export interface AttemptRecordedObserver {
  onAttemptRecorded(attempt: Attempt, now: string): Promise<void>;
}

export class CorrectionAttemptObserver implements AttemptRecordedObserver {
  constructor(private readonly correctionService: CorrectionServiceImpl) {}
  async onAttemptRecorded(attempt: Attempt, now: string): Promise<void> {
    if (attempt.outcome === 'INCORRECT' && attempt.source.kind !== 'CORRECTION') {
      await this.correctionService.observeIncorrectAttempt({ attemptId: attempt.id }, now);
    }
  }
}
```

Practice/Homework services receive an optional observer defaulting to a no-op for backward-compatible unit composition, but production/test Phase 6 composition must inject `CorrectionAttemptObserver`. Observation runs after canonical Attempt/Evidence persistence and is replay-safe.

Student view output exposes learning language only:

```ts
export interface StudentMistakeView {
  mistakeId: string;
  objectiveId: string;
  status: 'NEEDS_REVIEW' | 'READY_TO_CORRECT' | 'IN_CORRECTION';
  problemPrompt: string;
  diagnosisLabel: string;
  nextStep: 'CONFIRM_DIAGNOSIS' | 'RETRY' | 'REASON' | 'TRANSFER';
  lastObservedAt: string;
}
```

Parent view groups derived Active/Resolved/Recurring summaries and never exposes hidden AnswerSpec.

- [ ] **Step 1: Add observer integration tests to Practice/Homework services**

Assert:

```text
correct Attempt -> observer not called
incorrect Practice Attempt -> observer called once after Attempt/Evidence durable
incorrect Homework Attempt -> observer called once after Attempt/Evidence durable
idempotent replay -> no duplicate Mistake because correction observer is replay-safe
CORRECTION Attempt -> not re-observed as a new root Mistake
```

- [ ] **Step 2: Implement narrow observer hook**

Keep existing Practice/Homework grading authority unchanged. The hook receives the already-created canonical Attempt and cannot alter grade/Evidence.

- [ ] **Step 3: Write student/parent projection tests**

Student projection must never expose `answerSpec`, `solutionOutline` before the relevant correction step, provider rationale as authority, or internal event payloads. Parent projection groups Active/Resolved/Recurring from deterministic episode history and curriculum diagnosis names.

- [ ] **Step 4: Implement projection files**

Use `projectMistakeState()` and confirmed diagnosis, not stored state. Homework prompt comes from trusted structured reconstruction, not a nonexistent source image.

- [ ] **Step 5: Write Phase 6 E2E scenarios**

Implement all ten approved acceptance paths with memory repositories and deterministic fake provider where AI is needed:

1. P3 fraction Practice wrong answer → `MIS-FRA-DENOMINATOR-SIZE` auto-confirm → correction → reasoning → transfer → RESOLVED.
2. Phase 5 Homework INCORRECT Attempt → trusted reconstruction → full correction → RESOLVED.
3. Uncertain diagnosis → constrained AI candidate → remains OBSERVED → Student/Parent confirmation → CONFIRMED.
4. Repeated matching errors before resolution → one active episode with multiple observation links.
5. Same error after resolution → new episode; old episode remains RESOLVED; recurrence summary increments.
6. Original correction retry wrong → immutable CORRECTION Attempt, no corrected, no extra incorrect Evidence.
7. Reasoning failure/assistance → remains CORRECTING until fresh unassisted PASS.
8. Transfer first Attempt wrong → item consumed; later correct same item cannot qualify; round 2 may qualify.
9. Unsupported reasoning/transfer family → fail closed, no AI assessment fallback.
10. Replay repair → missing link/Evidence/resolution receipt repaired exactly once.

- [ ] **Step 6: Run E2E plus Phase 4/5 regressions**

```bash
npm test -- tests/correction-e2e.test.ts tests/correction-views.test.ts tests/practice-e2e.test.ts tests/homework-e2e.test.ts tests/learning-mastery-policy.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit Task 6**

```bash
git add lib/practice/service.ts lib/homework/service.ts lib/correction tests/practice-service.test.ts tests/homework-service.test.ts tests/correction-views.test.ts tests/correction-e2e.test.ts
git commit -m "feat: complete automatic mistake correction loop"
```

---

### Task 7: Authority Audit, Backlog/Current Closeout and Exact-HEAD Verification

**Files:**
- Modify: `.agent/BACKLOG.md`
- Modify: `.agent/CURRENT.md`
- Modify only if needed for test-discovered lint/type issues: Phase 6 files from Tasks 1–6

**Interfaces:**
- Consumes: complete Phase 6 implementation.
- Produces: Phase 6 closeout state, exact verification evidence, PR-ready HEAD. No feature scope is added in this task.

- [ ] **Step 1: Run full repo test suite**

```bash
npm test
```

Expected: all non-live tests PASS; provider/Neon tests without required environment remain intentionally skipped according to existing gating.

- [ ] **Step 2: Run typecheck, curriculum validation and lint**

```bash
npm run typecheck
npm run validate:curriculum
npm run lint
```

Expected: all PASS. If Grande sandbox hits the known `tsx` IPC limitation, record the sandbox failure and require the exact script on Host at final HEAD; do not replace curriculum validation with a weaker assertion.

- [ ] **Step 3: Run production build**

```bash
npm run build
```

Expected: PASS. If Grande sandbox is blocked only by Google Fonts network access, require exact-HEAD Host build as in Phase 5; do not change product fonts incidentally inside Phase 6.

- [ ] **Step 4: Run static authority audit**

Search production code and generated migration for forbidden authority paths. The audit must find no implementation equivalent to:

```text
setMistakeState
markMistakeResolved bypass
aiGradeCorrection
aiStudentUnderstands
AI-created misconception IDs
CorrectionAttempt table/type parallel ledger
mutable Mastery/Readiness setter
arbitrary AI transfer generation
mistake_state persistence column
raw homework image persistence
```

Also assert all CORRECTION grades flow through `gradeAnswer()` and all resolution paths flow through `projectMistakeState()` / hard-gate facts.

- [ ] **Step 5: Verify migration safety without applying production migration**

Inspect `migrations/0003_*.sql` and run schema tests. Do not invoke `npm run db:migrate` against any production database.

If a non-production Neon database is available with explicit `TEST_DATABASE_URL`, apply reviewed migrations there only through the project's normal explicit non-production procedure and run learning/planning + practice + homework + correction contracts. If not available, leave the activation gate documented and do not fake a live contract result.

- [ ] **Step 6: Update backlog/current truthfully**

`.agent/BACKLOG.md`:

- move Phase 6 to Completed only after Tasks 1–6 and verification pass;
- keep Phase 7 as next approved roadmap phase;
- update durable activation gate to include `0003` and correction Neon contracts.

`.agent/CURRENT.md`:

- mark Phase 6 implementation complete / PR handoff pending before merge;
- list the exact Mistake authority chain and 19 durable fact tables;
- record `0003_*` migration filename;
- record actual test/pass/skip counts from final run, never estimated counts;
- retain explicit statement that no production migration was applied;
- set Phase 7 Progress + Adaptive Learning Loop as next phase.

- [ ] **Step 7: Run exact final working-tree verification after docs changes**

```bash
npm test
npm run typecheck
npm run validate:curriculum
npm run lint
npm run build
git status --short
git rev-parse HEAD
```

If any environment-specific command must run on Host, run the entire exact-HEAD set on Host after the final closeout commit so evidence is not stale. Expected final `git status --short` is empty.

- [ ] **Step 8: Commit Phase 6 closeout**

```bash
git add .agent/BACKLOG.md .agent/CURRENT.md lib tests migrations
git commit -m "docs: close Phase 6 correction loop"
```

- [ ] **Step 9: Re-run exact-HEAD verification after the closeout commit**

Because Step 8 changes HEAD, verify the committed SHA itself. Required commands:

```bash
npm test
npm run typecheck
npm run validate:curriculum
npm run lint
npm run build
git status --short
git rev-parse HEAD
```

Do not open a PR until these are green on the exact final SHA (using Host only for documented sandbox limitations).

- [ ] **Step 10: Delivery handoff**

After exact-HEAD verification:

1. push `grande/phase6-correction-mistake-book-5001`;
2. open a ready PR titled `feat: complete Phase 6 correction and mistake book`;
3. inspect current-head PR mergeability/CI;
4. stop only at the Human Owner merge gate;
5. do not deploy or run production migrations as part of Phase 6 PR delivery.

---

## Plan Self-Review Checklist

Before execution, verify all of these against the approved spec:

- Spec coverage: observation, provisional consolidation, taxonomy, deterministic/AI/human diagnosis, trusted Practice/Homework resolver, canonical CORRECTION Attempt, original retry, no repeated incorrect Evidence, structured reasoning, server-observed reasoning assistance, deterministic transfer rounds, first-attempt/no-hint gate, resolution, recurrence, misconception summary, memory/Neon persistence, migration, replay repair, views, E2E, and authority audit each map to a task above.
- Placeholder scan: the plan contains no unresolved implementation placeholder; every new type/function used by later tasks is introduced in an earlier task or the same task.
- Type consistency: `DiagnosisTarget`, `Mistake`, `MistakeEvent`, `CorrectionItem`, `CorrectionReasoningCheck`, `TrustedAttemptProblem`, `AttemptProblemResolver`, `CorrectionAIProvider`, `CorrectionServiceImpl`, and `AttemptRecordedObserver` use one spelling/signature throughout.
- Scope check: no Phase 7 adaptive planner, mutable analytics score, infrastructure expansion, production migration, or broad UI redesign is included.
- Authority check: AI never owns diagnosis truth, math truth, grade, Evidence, state, or resolution; client input never supplies authoritative student/objective/outcome/state/Evidence facts already available server-side.
- Replay check: every multi-write business action has deterministic IDs and a repair path when a prior durable write exists without its derived companion fact.
- Transfer check: a failed first Attempt permanently consumes that transfer item for resolution; only a new deterministic server-controlled round can later qualify.
- Evidence check: failed CORRECTION retries produce no new `incorrect` Evidence, preventing one correction episode from inflating the mastery ledger.
