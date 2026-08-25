# MathMagics Phase 5 — Homework Vision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a trusted P2/P3 paper-homework path: photographed worksheet → structured extraction → confidence/confirmation gate → deterministic mathematical conversion/objective mapping → shared canonical Attempt → HOMEWORK Evidence.

**Architecture:** `lib/homework` owns storage-agnostic extraction, confidence, confirmation, conversion, mapping, repository and service rules. Vision output is an untrusted observation. Phase 5 generalizes the existing Attempt source to `PRACTICE | HOMEWORK` rather than creating a second attempt ledger, reuses `gradeAnswer()`, and persists only structured provenance. Raw images are request-scoped and never durable in V1.

**Tech Stack:** Next.js 16, TypeScript, Vitest, Drizzle ORM/Kit, Neon PostgreSQL, existing Anthropic-compatible MiniMax adapter.

**Spec:** `docs/superpowers/specs/2026-08-25-mathmagics-phase5-homework-vision-design.md`

## Global Constraints

- P2/P3 only.
- JPEG/PNG/WebP only; maximum image bytes `10 * 1024 * 1024`.
- Raw image bytes are not written to Postgres, repo fixtures, base64 columns, object storage, or durable provider URLs.
- No S3/R2/Vercel Blob, queue, worker, Redis, vector DB, PDF/multi-page ingestion.
- Provider output may not directly set `objectiveId`, `AnswerSpec`, grade/outcome, Evidence type, Mastery, or Readiness.
- `homework-confidence-v1`: every grading-critical structural field and the student answer must have confidence `>= 0.98`, plus structural validation, exactly one supported conversion, and exactly one deterministic objective mapping.
- Low-confidence critical fields require append-only confirmation. Confirmation may correct observations but may not select grade/Evidence/Mastery.
- Unsupported/ambiguous work fails closed with no Attempt/Evidence side effect.
- One canonical `Attempt` type/table for PRACTICE and HOMEWORK.
- Homework grading calls existing `gradeAnswer()`; there is no AI grading fallback.
- Homework Evidence uses `origin.kind = 'HOMEWORK'`.
- `Mistake` remains Phase 6; adaptive scoring remains Phase 7.
- Live DB tests require explicit `TEST_DATABASE_URL`; never fall back to production `DATABASE_URL`.
- Generate migrations, but do not apply them to production during this task.

## Locked Phase 5 V1 objective map

The mapping registry is deliberately narrower than Phase 4 generator support. A photographed answer proves only observable work, not an unobservable strategy such as mental calculation.

```text
P2 ARITHMETIC MULTIPLY within tables 2/3/4/5/10      -> P2-MD-001
P2 ARITHMETIC DIVIDE within learned-table facts       -> P2-MD-004
P2 EQUATION_CHOICE SHARING/GROUPING                   -> P2-MD-002
P2 EQUATION_CHOICE FACT_FAMILY                         -> P2-MD-003
P2 WORD_PROBLEM EQUAL_GROUPS/SHARING one-step          -> P2-MD-005
P2 WORD_PROBLEM PART_WHOLE/COMPARISON add-sub          -> P2-AS-002
P3 FRACTION_EQUIVALENT missing numerator/denominator   -> P3-FRA-004
P3 FRACTION_SIMPLIFY                                   -> P3-FRA-002
P3 FRACTION_COMPARE                                    -> P3-FRA-003
P3 FRACTION_OPERATION ADD/SUBTRACT                     -> P3-FRA-005
P3 WORD_PROBLEM EQUAL_GROUPS with multiply + add       -> P3-MD-005
P3 WORD_PROBLEM PART_WHOLE/COMPARISON add-sub          -> P3-AS-002
```

`P2-MD-006` and `P3-MD-006` are intentionally not mapped because “mentally” performing a fact is not observable from paper. `P3-FRA-001` is not mapped from the Phase 4 missing-value equivalent-fraction shape because that shape assesses generation (`P3-FRA-004`), not mere recognition. Anything outside the table returns zero candidates. No lexical-ID, nearest-title, LLM, or priority fallback.

---

### Task 1: Domain contracts, validation, confidence and confirmation

**Files:**
- Create: `lib/homework/types.ts`
- Create: `lib/homework/validation.ts`
- Create: `lib/homework/confidence.ts`
- Create: `lib/homework/index.ts`
- Create: `tests/homework-contracts.test.ts`
- Create: `tests/homework-confidence.test.ts`

**Produces:**

```ts
export type HomeworkMimeType = 'image/jpeg' | 'image/png' | 'image/webp';
export type HomeworkTrustState = 'CONFIRMED' | 'NEEDS_CONFIRMATION' | 'UNSUPPORTED';
export interface SourceRegion { x: number; y: number; width: number; height: number }
export interface ExtractedField<T> { value: T; confidence: number; region: SourceRegion }
export interface ExtractedMathCandidate { family: string; fields: Record<string, ExtractedField<string>> }
export interface HomeworkSubmission {
  id: string; studentId: string; sourceSha256: string; mimeType: HomeworkMimeType;
  byteLength: number; provider: string; model: string; schemaVersion: 'homework-vision-v1'; createdAt: string;
}
export interface HomeworkProblemExtraction {
  id: string; submissionId: string; studentId: string; sequence: number;
  question: ExtractedField<string>; answer?: ExtractedField<string>; structured: ExtractedMathCandidate;
  provider: string; model: string; schemaVersion: 'homework-vision-v1'; createdAt: string;
}
export interface HomeworkConfirmation {
  id: string; problemId: string; studentId: string;
  corrections: Record<string, string>; confirmerRole: 'STUDENT' | 'PARENT';
  policyVersion: 'homework-confidence-v1'; confirmedAt: string;
}
```

- [ ] **Step 1: Write RED validation tests** for valid image metadata and rejection of unsupported MIME, zero/over-10-MiB size, non-64-hex SHA, confidence outside `[0,1]`, NaN/Infinity, negative region coordinates, region crossing the `[0,1]` image boundary, duplicate problem sequence and invalid timestamps.
- [ ] **Step 2: Run RED:** `npx vitest run tests/homework-contracts.test.ts`; expect missing `lib/homework` exports.
- [ ] **Step 3: Implement minimal types and pure validators.** `validateHomeworkImageMetadata()` requires allowed MIME, integer bytes `1..10485760`, lowercase 64-hex SHA. `validateHomeworkVisionResult()` validates all fields/regions and stable student/submission coordinates.
- [ ] **Step 4: Write RED confidence tests** proving all critical fields `>=0.98` can progress, a `0.9799` answer or structural field requires confirmation, high-confidence invalid/unsupported structure is `UNSUPPORTED`, and a valid confirmation can resolve only corrected observation fields.
- [ ] **Step 5: Implement `deriveEffectiveHomeworkObservation()` and `deriveHomeworkTrustState()`** using confirmations ordered by `(confirmedAt,id)`. Confirmation input has no authority fields (`objectiveId`, grade, Evidence, Mastery, Readiness).
- [ ] **Step 6: Run GREEN:** `npx vitest run tests/homework-contracts.test.ts tests/homework-confidence.test.ts && npm run typecheck`.
- [ ] **Step 7: Commit:** `git commit -am "feat: add homework extraction trust contracts"` after adding new files.

---

### Task 2: Deterministic mathematical conversion and objective mapping

**Files:**
- Create: `lib/homework/conversion.ts`
- Create: `lib/homework/objective-mapping.ts`
- Modify: `lib/homework/index.ts`
- Create: `tests/homework-conversion.test.ts`
- Create: `tests/homework-objective-mapping.test.ts`
- Authority: `lib/practice/types.ts`, P2/P3 `objectives.json`, `lib/curriculum/queries.ts`

**Produces:**

```ts
export interface TrustedHomeworkProblem {
  problemSpec: PracticeProblemSpec;
  answerSpec: AnswerSpec;
  classification: 'CORE' | 'APPLICATION';
}
export type HomeworkConversionResult =
  | { supported: true; trusted: TrustedHomeworkProblem }
  | { supported: false; reason: string };
export interface HomeworkObjectiveMappingResult { candidates: string[]; version: 'homework-objective-map-v1' }
export function convertHomeworkProblem(observation: EffectiveHomeworkObservation): HomeworkConversionResult;
export function mapHomeworkObjective(level: 'P2' | 'P3', trusted: TrustedHomeworkProblem): HomeworkObjectiveMappingResult;
```

- [ ] **Step 1: Write RED conversion tests** with exact expected trusted results: `7×8 -> ARITHMETIC/MULTIPLY + INTEGER 56`; `40÷5 -> ARITHMETIC/DIVIDE + INTEGER 8`; `6/8 simplify -> FRACTION_SIMPLIFY + FRACTION 3/4 EXACT_SIMPLEST`; `3/4 ? 2/4 -> FRACTION_COMPARE + EXACT_TEXT ['>']`; `1/4 + 1/2 -> FRACTION_OPERATION + FRACTION 3/4 VALUE`; explicit equal-groups word problem -> `WORD_PROBLEM`; open explanation, zero denominator, missing operand and unseen-key MCQ -> unsupported.
- [ ] **Step 2: Run RED:** `npx vitest run tests/homework-conversion.test.ts`.
- [ ] **Step 3: Implement small pure family converters** (`convertArithmetic`, `convertFractionEquivalent`, `convertFractionSimplify`, `convertFractionCompare`, `convertFractionOperation`, `convertWordProblem`). Trusted answer keys are derived from operands/steps, never copied from the provider’s extracted student answer.
- [ ] **Step 4: Write RED mapping tests** for every row in the locked V1 map. Explicitly assert `P2-MD-006`, `P3-MD-006`, and unsupported families yield no candidate. Assert every configured ID resolves with `getLearningObjective()` and matches the requested level.
- [ ] **Step 5: Implement `homework-objective-map-v1`** as explicit predicates. `mapHomeworkObjective()` returns every matching candidate; service later requires `length === 1`. Do not introduce tie-breaking.
- [ ] **Step 6: Run GREEN:** `npx vitest run tests/homework-conversion.test.ts tests/homework-objective-mapping.test.ts && npm run validate:curriculum && npm run typecheck`.
- [ ] **Step 7: Commit:** `git add lib/homework tests/homework-conversion.test.ts tests/homework-objective-mapping.test.ts && git commit -m "feat: add deterministic homework conversion and mapping"`.

---

### Task 3: One canonical Attempt source and source-aware Evidence

**Files:**
- Modify: `lib/practice/types.ts`
- Modify: `lib/practice/repository.ts`
- Modify: `lib/practice/memory-repository.ts`
- Modify: `lib/practice/service.ts`
- Modify: `lib/practice/evidence.ts`
- Create: `lib/homework/evidence.ts`
- Create: `tests/practice-attempt-source.test.ts`
- Modify: existing practice tests that construct `Attempt` fixtures

**Target Attempt shape:**

```ts
export type AttemptSource =
  | { kind: 'PRACTICE'; sessionId: string; itemId: string }
  | { kind: 'HOMEWORK'; submissionId: string; problemId: string };

export interface Attempt {
  id: string;
  source: AttemptSource;
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

- [ ] **Step 1: Write RED tests** proving `PracticeService.submitAttempt()` returns `source.kind='PRACTICE'`, practice source coordinates match trusted session/item, and HOMEWORK source cannot be treated as a practice-item attempt.
- [ ] **Step 2: Run RED:** `npx vitest run tests/practice-attempt-source.test.ts tests/practice-service.test.ts tests/practice-evidence.test.ts`.
- [ ] **Step 3: Refactor practice code minimally.** `SubmitAttemptInput` stays practice-specific. `PracticeService` constructs `{kind:'PRACTICE',sessionId,itemId}`. `listAttemptsForItem/session` narrows to PRACTICE. All existing retry/idempotency semantics remain.
- [ ] **Step 4: Add `projectHomeworkAttemptToEvidence()` RED/GREEN tests.** Reject non-HOMEWORK source and `hintUsed=true`. Map `INCORRECT -> incorrect`, `CORRECT + CORE -> independent_correct`, `CORRECT + APPLICATION -> application_correct`; emit `{kind:'HOMEWORK',refId:attempt.id}`. Phase 5 never emits `corrected`.
- [ ] **Step 5: Run full practice regression:** `npx vitest run tests/practice-*.test.ts tests/practice-attempt-source.test.ts && npm run typecheck`.
- [ ] **Step 6: Commit:** `git add lib/practice lib/homework/evidence.ts tests && git commit -m "refactor: unify practice and homework attempt sources"`.

---

### Task 4: Repository contracts, Drizzle schema and migration

**Files:**
- Create: `lib/homework/repository.ts`
- Create: `lib/homework/memory-repository.ts`
- Create: `tests/homework-repository.test.ts`
- Modify: `lib/persistence/schema.ts`
- Create: `lib/persistence/neon-homework-repository.ts`
- Modify: `lib/persistence/neon-practice-repository.ts`
- Create: `tests/persistence-homework-schema.test.ts`
- Create: `tests/persistence-neon-homework-contract.test.ts`
- Modify: `tests/persistence-neon-practice-contract.test.ts`
- Generate: `migrations/*`, `migrations/meta/*`

**Repository contract:**

```ts
export interface HomeworkRepository {
  getSubmission(id: string): Promise<HomeworkSubmission | undefined>;
  findSubmissionByStudentAndHash(studentId: string, sha256: string): Promise<HomeworkSubmission | undefined>;
  createSubmission(submission: HomeworkSubmission, problems: HomeworkProblemExtraction[]): Promise<void>;
  getProblem(id: string): Promise<HomeworkProblemExtraction | undefined>;
  listProblems(submissionId: string): Promise<HomeworkProblemExtraction[]>;
  appendConfirmation(confirmation: HomeworkConfirmation): Promise<void>;
  listConfirmations(problemId: string): Promise<HomeworkConfirmation[]>;
}
```

- [ ] **Step 1: Write RED memory-repository contract tests** for uniqueness `(studentId,sourceSha256)`, `(submissionId,sequence)`, immutable extraction, append-only confirmations, deterministic list order, and conflicting ID reuse.
- [ ] **Step 2: Implement `MemoryHomeworkRepository`; run:** `npx vitest run tests/homework-repository.test.ts` GREEN.
- [ ] **Step 3: Write RED schema tests** requiring `homework_submissions`, `homework_problems`, `homework_confirmations`; no raw bytes/base64/object URL; and generalized `attempts` columns `source_kind`, nullable `session_id/item_id`, nullable `homework_submission_id/homework_problem_id` FKs.
- [ ] **Step 4: Modify Drizzle schema** with source exclusivity check:

```sql
(source_kind='PRACTICE' AND session_id IS NOT NULL AND item_id IS NOT NULL AND homework_submission_id IS NULL AND homework_problem_id IS NULL)
OR
(source_kind='HOMEWORK' AND session_id IS NULL AND item_id IS NULL AND homework_submission_id IS NOT NULL AND homework_problem_id IS NOT NULL)
```

Existing rows must migrate to `source_kind='PRACTICE'` before the final non-null/check invariant. Add submission uniqueness on `(student_id,source_sha256)`, problem uniqueness on `(submission_id,sequence)`, useful student/submission indexes, and no raw-image column.
- [ ] **Step 5: Update `NeonPracticeRepository` serialization** to map both source variants and reject impossible row coordinate combinations.
- [ ] **Step 6: Implement `NeonHomeworkRepository`** with the same idempotency/conflict semantics as memory. Live contract only runs when explicit `TEST_DATABASE_URL` exists; otherwise intentional skip.
- [ ] **Step 7: Generate migration:** `npm run db:generate`.
- [ ] **Step 8: Verify:** `npx vitest run tests/homework-repository.test.ts tests/persistence-homework-schema.test.ts tests/persistence-neon-homework-contract.test.ts tests/persistence-neon-practice-contract.test.ts && npm run typecheck`.
- [ ] **Step 9: Commit:** `git add lib/homework lib/persistence migrations tests && git commit -m "feat: persist homework provenance and unified attempts"`.

---

### Task 5: Vision provider boundary and staged HomeworkService

**Files:**
- Create: `lib/providers/homework-vision.ts`
- Create: `lib/providers/minimax-homework-vision.ts`
- Modify only if needed for client reuse: `lib/providers/minimax.ts`
- Create: `lib/homework/service.ts`
- Modify: `lib/homework/index.ts`
- Create: `tests/homework-provider.test.ts`
- Create: `tests/homework-service.test.ts`

**Interfaces:**

```ts
export interface HomeworkVisionProvider {
  extract(input: HomeworkVisionInput): Promise<HomeworkVisionResult>;
}

export interface HomeworkService {
  submitHomework(input: SubmitHomeworkInput, now: string): Promise<HomeworkSubmissionProjection>;
  confirmHomeworkProblem(input: ConfirmHomeworkProblemInput, now: string): Promise<HomeworkProblemProjection>;
  gradeHomeworkProblem(input: GradeHomeworkProblemInput, now: string): Promise<HomeworkGradeProjection>;
}
```

- [ ] **Step 1: Write RED provider-boundary tests.** Result schema contains visible question, structured observed fields, student answer, normalized regions, confidence, provider/model/schema metadata. Its type/parsed object contains no authority fields. Malformed confidence/region is rejected before persistence.
- [ ] **Step 2: Implement narrow provider + MiniMax adapter** using the existing Anthropic-compatible dependency. Request strict `homework-vision-v1` JSON, parse, validate, discard raw response after conversion. Do not persist chain-of-thought/raw provider response and do not add another SDK.
- [ ] **Step 3: Write RED `submitHomework()` tests.** New hash invokes provider once and persists structured extraction only; duplicate `(student,hash)` returns existing submission without provider replay; extraction completion alone creates no Attempt/Evidence; provider/validation failure creates no Attempt/Evidence.
- [ ] **Step 4: Implement `submitHomework()`** including trusted SHA-256 recomputation from bytes and equality check with supplied metadata, type/size validation, provider call, immutable persistence, conversion/mapping/trust-state projection. Raw bytes never enter repository DTOs.
- [ ] **Step 5: Write RED confirmation tests.** A `0.97` handwritten answer blocks grading; append-only corrected answer makes it eligible only if conversion + one mapping succeed; conflicting confirmation-ID reuse fails. Confirmation itself writes no Attempt/Evidence.
- [ ] **Step 6: Implement `confirmHomeworkProblem()`** and recompute effective observation/trust deterministically.
- [ ] **Step 7: Write RED grading/idempotency tests.** `NEEDS_CONFIRMATION`/`UNSUPPORTED` cannot grade; confirmed supported work calls shared `gradeAnswer()` semantics; HOMEWORK Attempt has `hintUsed=false`; wrong/correct evidence mapping is correct; identical attempt replay is idempotent; conflicting attempt ID fails; existing Attempt with missing Evidence repairs exactly one Evidence.
- [ ] **Step 8: Implement `gradeHomeworkProblem()`** by reconstructing trusted conversion + one mapping, deriving trusted answer, invoking `gradeAnswer()`, appending canonical HOMEWORK Attempt through `PracticeRepository`, then source-aware Evidence with read-after-write repair mirroring Phase 4. Do not route homework through `PracticeService.submitAttempt()` because there is no practice item/session.
- [ ] **Step 9: Run GREEN:** `npx vitest run tests/homework-provider.test.ts tests/homework-service.test.ts tests/practice-service.test.ts && npm run typecheck`.
- [ ] **Step 10: Commit:** `git add lib/homework lib/providers tests/homework-provider.test.ts tests/homework-service.test.ts && git commit -m "feat: add trusted homework vision service"`.

---

### Task 6: E2E acceptance, authority audit and closeout

**Files:**
- Create: `tests/homework-e2e.test.ts`
- Modify: `.agent/BACKLOG.md`
- Modify: `.agent/CURRENT.md`

- [ ] **Step 1: Write the eight RED/acceptance scenarios with synthetic data:**
  1. P2 printed multiplication fact within 2/3/4/5/10 + clear handwritten answer → `P2-MD-001` → HOMEWORK Evidence.
  2. P3 fraction addition/subtraction → `P3-FRA-005` → correct Evidence.
  3. Low-confidence handwritten answer → no Attempt/Evidence → confirmation → grade.
  4. Incorrect supported answer → immutable incorrect Attempt + incorrect Evidence.
  5. Duplicate same-image/student submission → one submission and no duplicate learning history.
  6. Provider confidence high but mathematical structure invalid → fail closed.
  7. Open-ended/diagram unsupported question → no Attempt/Evidence.
  8. Attempt exists but Evidence write was interrupted → replay repairs exactly once.
- [ ] **Step 2: Run:** `npx vitest run tests/homework-e2e.test.ts`; fix only Phase 5 implementation until GREEN.
- [ ] **Step 3: Run authority/static audit:** `rg "gradeHomeworkWithAI|setMastery|S3|R2|Blob|object.?storage" lib app` and inspect `lib/providers/*homework*` for any grade/objective/Evidence authority field. Legitimate comments/tests do not count as authority; production provider contracts must not expose them.
- [ ] **Step 4: Run full verification:** `npm test`, `npm run typecheck`, `npm run validate:curriculum`, `npm run lint`, `npm run build`. Live Neon tests remain explicit-credential gated. A sandbox-only blocked Google Fonts build is recorded only if exact HEAD passes the approved host build path.
- [ ] **Step 5: Confirm no production migration:** inspect generated migration/meta, but do not run `npm run db:migrate` against production/unapproved DB.
- [ ] **Step 6: Update `.agent/BACKLOG.md`**: mark all Phase 5 Homework Vision items complete only after acceptance passes; keep Phase 6 and Phase 7 pending.
- [ ] **Step 7: Update `.agent/CURRENT.md`** with Phase 5 completion, `homework-confidence-v1`/0.98 gate, non-durable raw-image rule, locked mapping scope, one canonical Attempt ledger, HOMEWORK Evidence convergence, migration/live-Neon status, exact verification results, and Phase 6 as next.
- [ ] **Step 8: Commit closeout:** `git add .agent tests/homework-e2e.test.ts lib migrations && git commit -m "docs: close Phase 5 homework vision"`.
- [ ] **Step 9: Re-run exact-HEAD verification:** `npm test && npm run typecheck && npm run validate:curriculum && npm run lint && npm run build`. PR handoff uses this exact SHA and its attestation/host build evidence.

## Plan self-review result

- Spec coverage: image boundary, provenance, confidence, confirmation, deterministic conversion, exact P2/P3 mapping, canonical Attempt, shared grading, HOMEWORK Evidence, memory/Neon persistence, migration gate, E2E, closeout all have a task.
- Placeholder scan: no TBD/TODO/“similar to”/unspecified error-handling steps.
- Type consistency: Tasks 2/5 consume Task 1 types; Task 3 establishes the Attempt union before Tasks 4/5 persist/use HOMEWORK attempts; Task 4 repository interfaces match Task 5 service dependencies.
- Scope check: no Phase 6 Mistake, Phase 7 adaptation, object storage, queue/worker, PDF or multi-page work is included.
