# MathMagics Phase 5 — Homework Vision Design

**Status:** Approved design, pending written-spec review  
**Date:** 2026-08-25  
**Phase:** 5  
**Product scope:** Singapore Math home-education AI learning system, P2/P3 V1

## 1. Goal

Phase 5 adds a trusted paper-homework path to MathMagics:

`Photo → structured extraction → confidence gate → confirmation when needed → deterministic objective mapping → deterministic grading → Attempt → Evidence`

The purpose is not to create a second learning-state system for photographed worksheets. Paper homework must converge into the same durable Attempt/Evidence authority established by Phases 2 and 4.

Vision models may propose what is visible in an image. They do not own curriculum truth, objective identity, answer keys, grades, Evidence type, Mastery, or Readiness.

## 2. Architectural Principles

Phase 5 preserves all prior authority boundaries:

1. Curriculum truth remains version-controlled Phase 1 curriculum data.
2. Learning history remains append-only `EvidenceRecord` data.
3. Mastery and readiness remain deterministic derived state.
4. Mathematical truth remains code-owned typed structures, never provider-owned prose.
5. The image/vision layer is an untrusted extraction layer.
6. Human confirmation may correct extracted observations, but may not directly declare a grade or Evidence type.
7. Unsupported or ambiguous homework fails closed.
8. The original image is not durably retained in V1 unless a later requirement explicitly justifies object storage.
9. Phase 6 `Mistake` lifecycle is not pulled into Phase 5.
10. Phase 7 adaptive scoring is not pulled into Phase 5.

## 3. Scope

### 3.1 In scope

- JPEG, PNG, and WebP worksheet/photo intake at the application boundary.
- One uploaded image per Phase 5 submission in V1.
- Content hashing and source metadata.
- Structured extraction of visible math questions and student answers.
- Per-field confidence and normalized source-region provenance.
- Versioned deterministic confidence policy.
- Explicit confirmation for low-confidence critical fields.
- Deterministic conversion of supported extracted problems into code-owned mathematical structures.
- Deterministic mapping to a P2/P3 `LearningObjective`.
- Deterministic answer derivation only where the mathematical problem itself is sufficient to derive an answer key.
- Reuse of the existing `gradeAnswer()` grading primitive.
- A single canonical `Attempt` ledger for both practice and homework origins.
- Evidence projection with `origin.kind = 'HOMEWORK'` for homework attempts.
- Durable structured homework metadata required for replay, provenance, confirmation, and audit.
- Memory and Neon repository implementations.
- P2/P3 end-to-end scenarios, including low-confidence, unsupported, replay, and idempotency cases.

### 3.2 Explicitly out of scope

- Long-term image storage, gallery/history image viewing, S3, R2, Vercel Blob, or another object store.
- Queue/worker architecture.
- Batch worksheet processing.
- PDF ingestion.
- Multiple page uploads in one submission.
- Free-form AI grading.
- AI-generated objective IDs.
- AI-generated answer keys.
- AI-selected Evidence types.
- Geometry-diagram reasoning that cannot be deterministically represented by existing/new typed V1 specs.
- Open-ended explanations or essays that require semantic grading.
- Teacher-authored answer-key upload.
- `Mistake` lifecycle or guided correction.
- Adaptive ability scoring or next-best-action changes.
- Production database migration or production deployment.

## 4. Image Intake and Retention Boundary

### 4.1 Application boundary

Raw image bytes exist only at the request/provider boundary for the duration of processing.

The application accepts a trusted `HomeworkImageInput` equivalent to:

```ts
interface HomeworkImageInput {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  byteLength: number;
  sha256: string;
  bytes: Uint8Array;
}
```

The raw bytes are not part of the `lib/homework` durable domain model and are never written to Postgres.

V1 rejects unsupported media types and oversized payloads before provider invocation. The route-level hard byte limit is 10 MiB.

### 4.2 Durable source metadata

A `HomeworkSubmission` stores only:

- submission id;
- student id;
- source SHA-256;
- MIME type;
- byte length;
- provider/model/schema metadata for the extraction pass;
- creation timestamp.

The source hash is provenance and idempotency metadata, not a lookup key for external storage.

### 4.3 Retention decision

V1 intentionally does not select object storage. If a later product requirement needs image history, parent review, delayed asynchronous extraction, or reprocessing from original bytes, that requirement must explicitly define retention duration, deletion semantics, access control, and storage provider before raw-image persistence is added.

## 5. Homework Domain

A new storage-agnostic `lib/homework` domain owns Phase 5 contracts and deterministic policy.

It must not import:

- Drizzle or Neon;
- Next.js request objects;
- provider SDKs;
- object-storage SDKs.

Recommended modules:

```text
lib/homework/
  types.ts
  validation.ts
  confidence.ts
  extraction.ts
  confirmation.ts
  conversion.ts
  objective-mapping.ts
  grading.ts
  evidence.ts
  repository.ts
  service.ts
  index.ts
```

Provider adapters remain under `lib/providers` and persistence adapters remain under `lib/persistence`.

## 6. Vision Provider Boundary

### 6.1 Provider interface

Phase 5 introduces a narrow provider abstraction similar to:

```ts
interface HomeworkVisionProvider {
  extract(input: HomeworkVisionInput): Promise<HomeworkVisionResult>;
}
```

The provider receives image bytes plus a versioned extraction schema. It returns observations, never trusted learning decisions.

### 6.2 Provider output

Each extracted problem contains candidates for:

- visible question text;
- mathematical tokens/structure;
- student answer text;
- question region;
- answer region;
- field-level confidence;
- provider/model/schema version.

A source region uses normalized coordinates in `[0, 1]`:

```ts
interface SourceRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

Normalized regions avoid coupling durable provenance to original pixel dimensions.

### 6.3 Untrusted proposal rule

Provider output is untrusted even when confidence is high.

No provider field may directly become:

- `objectiveId`;
- `AnswerSpec`;
- `Attempt.outcome`;
- `EvidenceRecord.type`;
- Mastery or Readiness state.

Provider-supplied labels may be retained as diagnostic metadata but cannot bypass deterministic conversion and mapping.

## 7. Extraction Contract and Provenance

Each detected problem becomes an immutable original extraction record.

Conceptually:

```ts
interface HomeworkProblemExtraction {
  id: string;
  submissionId: string;
  studentId: string;
  sequence: number;
  question: ExtractedField<string>;
  answer?: ExtractedField<string>;
  structured: ExtractedMathCandidate;
  provider: string;
  model: string;
  schemaVersion: 'homework-vision-v1';
  createdAt: string;
}

interface ExtractedField<T> {
  value: T;
  confidence: number;
  region: SourceRegion;
}
```

Confidence must be finite and within `[0, 1]`. Regions must be finite, non-negative, and contained within the normalized image bounds.

Original provider output is immutable after persistence. Corrections are represented through separate confirmation records rather than overwriting extraction history.

## 8. Confidence and Confirmation Policy

### 8.1 Versioned policy

V1 uses `homework-confidence-v1`.

Automatic progression requires:

- every math-critical structural field confidence `>= 0.98`;
- student-answer confidence `>= 0.98`;
- all deterministic structural validation checks to pass;
- exactly one supported deterministic conversion;
- exactly one objective mapping candidate.

Question prose that is not used to compute the mathematical structure may be lower confidence without blocking grading, but it remains visible as untrusted display text.

These thresholds are conservative by design. Provider confidence alone never grants trust; structural validation must also pass.

### 8.2 States

A homework problem derives one of three trust states:

- `CONFIRMED` — all critical fields pass policy, or an explicit confirmation supplies corrected critical values.
- `NEEDS_CONFIRMATION` — one or more critical fields fail the automatic confidence policy but the problem is otherwise representable.
- `UNSUPPORTED` — the problem cannot be safely converted/mapped/graded by the Phase 5 deterministic capability set.

`UNSUPPORTED` is terminal for automatic grading in Phase 5.

### 8.3 Human confirmation

Confirmation can edit only observed fields needed to reconstruct the problem and student answer.

A confirmation cannot submit:

- `CORRECT` / `INCORRECT`;
- an Evidence type;
- Mastery state;
- arbitrary objective ID.

A `HomeworkConfirmation` is append-only and records:

- confirmation id;
- problem id;
- corrected field values;
- confirmer role (`STUDENT` or `PARENT` in V1 application semantics);
- confirmation timestamp;
- policy version.

The effective extraction is deterministically derived from the immutable original extraction plus the latest valid confirmation event by deterministic ordering.

## 9. Deterministic Problem Conversion

### 9.1 Rule

Vision does not create a trusted `PracticeProblemSpec` or `AnswerSpec` directly.

`lib/homework/conversion.ts` converts confirmed observations into code-owned structures only when all required mathematical facts are explicit and internally consistent.

### 9.2 Initial supported families

Phase 5 V1 supports homework forms that can map to Phase 4's deterministic families:

- multiplication/division arithmetic;
- multiplication/division equation-choice forms where the correct expression can be derived from the represented quantities;
- fraction comparison;
- equivalent fractions;
- fraction simplification;
- fraction addition/subtraction;
- supported one- or multi-step word-problem templates whose quantities and operation structure are deterministically reconstructable.

A family is enabled only when its parser/converter has explicit tests and produces a valid code-owned spec.

### 9.3 Answer-key rule

The system may derive an `AnswerSpec` only from trusted mathematical structure.

Examples:

- `7 × 8` can deterministically derive integer answer `56`.
- `3/4 + 1/4` can deterministically derive a trusted fraction/integer-equivalent answer according to the problem contract.
- A multiple-choice worksheet whose correct option depends on an unseen teacher key is unsupported unless the correct result can be independently derived from the mathematical structure.
- An open-ended explanation is unsupported in Phase 5.

There is no `gradeHomeworkWithAI()` fallback.

## 10. Objective Mapping

### 10.1 Authority

`objectiveId` is selected by deterministic code using:

- the student's P2/P3 level;
- validated mathematical structure;
- version-controlled curriculum objectives;
- a versioned homework capability registry.

Vision provider labels are advisory diagnostics only.

### 10.2 Mapping registry

Phase 5 adds a registry parallel in spirit to the Phase 4 generator registry. Each mapper declares:

- which mathematical structures it recognizes;
- which curriculum objective IDs it can produce;
- structural predicates required for each mapping;
- mapping version.

The mapper returns zero, one, or multiple candidates.

- zero → `UNSUPPORTED`;
- one → continue;
- multiple → `NEEDS_CONFIRMATION` only if a confirmation can resolve an observed ambiguity without manually selecting an arbitrary objective; otherwise `UNSUPPORTED`.

No lexical-ID fallback and no unrestricted LLM fallback are allowed.

## 11. Unifying Attempt Authority

### 11.1 Problem in the Phase 4 shape

Phase 4 `Attempt` is currently structurally bound to `PracticeSession` and `PracticeItem` through mandatory `sessionId`/`itemId` fields and database foreign keys.

Creating a separate `HomeworkAttempt` would violate the approved product rule that paper homework and in-app practice converge into one Attempt/Evidence pipeline.

Phase 5 therefore generalizes the canonical `Attempt` source coordinates rather than duplicating the ledger.

### 11.2 Source union

The canonical domain shape becomes conceptually:

```ts
type AttemptSource =
  | {
      kind: 'PRACTICE';
      sessionId: string;
      itemId: string;
    }
  | {
      kind: 'HOMEWORK';
      submissionId: string;
      problemId: string;
    };
```

The `Attempt` retains its existing student/objective/answer/outcome/retry/grading/timestamp facts and gains exactly one source variant. The exact TypeScript migration may preserve compatibility helpers for Phase 4 call sites, but there is exactly one canonical `Attempt` concept and one durable `attempts` table.

### 11.3 Persistence migration

The existing `attempts.session_id` and `attempts.item_id` columns become nullable for homework-origin rows.

Phase 5 adds:

- `source_kind` (`PRACTICE` or `HOMEWORK`);
- `homework_submission_id` nullable FK;
- `homework_problem_id` nullable FK.

Database/application validation enforces an exclusive coordinate invariant:

- `PRACTICE` requires practice session/item coordinates and forbids homework coordinates;
- `HOMEWORK` requires submission/problem coordinates and forbids practice coordinates.

Existing Phase 4 rows migrate semantically as `source_kind = 'PRACTICE'`.

No existing Attempt is rewritten or deleted by application code.

### 11.4 Grading

Practice and homework both call the same `gradeAnswer(answerText, answerSpec)` primitive.

For homework:

1. confirmed extraction yields a trusted mathematical problem;
2. deterministic conversion derives trusted `AnswerSpec`;
3. deterministic objective mapping yields one objective;
4. `gradeAnswer()` computes the outcome;
5. the canonical Attempt ledger records the immutable result.

`hintUsed` is always `false` for original Phase 5 homework attempts because the photographed answer predates any MathMagics correction flow. Guided correction remains Phase 6.

## 12. Evidence Projection

Evidence remains append-only and derived from canonical Attempt data plus trusted item/problem context.

Practice continues to emit:

```ts
origin: { kind: 'PRACTICE', refId: attempt.id }
```

Homework emits:

```ts
origin: { kind: 'HOMEWORK', refId: attempt.id }
```

Homework evidence policy:

- incorrect homework attempt → `incorrect`;
- correct homework attempt → `independent_correct` by default;
- a homework problem explicitly mapped to an application/challenge capability may emit `application_correct` only when that classification is deterministic and code-owned.

Phase 5 does not emit `corrected`; correction evidence belongs to Phase 6 retry/correction flow.

Evidence IDs remain deterministic per attempt and source-aware so retries/replays cannot duplicate learning history.

## 13. Durable Homework Data

Phase 5 adds the minimum structured persistence required for replay and audit.

### 13.1 `homework_submissions`

- `id` PK
- `student_id` FK
- `source_sha256`
- `mime_type`
- `byte_length`
- `provider`
- `model`
- `schema_version`
- `created_at`

A uniqueness rule on `(student_id, source_sha256)` provides idempotent duplicate-upload handling for V1.

### 13.2 `homework_problems`

- `id` PK
- `submission_id` FK
- `student_id` FK
- `sequence`
- original extraction JSON
- provider confidence/provenance JSON
- trust policy version
- created timestamp

Unique `(submission_id, sequence)`.

Trusted conversion outputs such as objective ID, typed problem spec, and answer spec are not accepted from the client/provider. They may be persisted as server-derived cached facts only if repository/service validation can deterministically recompute and compare them. The implementation should prefer storing the minimum required replay facts rather than creating a second source of mathematical truth.

### 13.3 `homework_confirmations`

- `id` PK
- `problem_id` FK
- `student_id` FK
- corrected fields JSON
- confirmer role
- policy version
- confirmed timestamp

Confirmations are append-only.

### 13.4 No raw image column

No table contains raw bytes, base64 image content, object-store URL, or durable provider upload URL.

## 14. Service Flow

The Phase 5 service is split into explicit stages so a user can resolve low confidence without re-running unrelated side effects.

### 14.1 Submit and extract

`submitHomework(image, studentId, now)`:

1. validate image metadata/size/type;
2. hash bytes at the trusted application boundary;
3. return an existing submission for the same student/hash if already processed;
4. invoke `HomeworkVisionProvider`;
5. validate provider result shape;
6. persist immutable submission/problem extraction facts;
7. derive trust state for each problem;
8. return a student-safe review projection.

No Attempt or Evidence is written merely because extraction completed.

### 14.2 Confirm

`confirmHomeworkProblem(problemId, corrections, now)`:

1. load trusted original extraction and existing confirmations;
2. validate allowed correction fields;
3. append confirmation event idempotently;
4. derive effective confirmed observations;
5. rerun deterministic conversion and mapping;
6. return current trust/eligibility state.

Confirmation does not directly grade.

### 14.3 Grade eligible problem

`gradeHomeworkProblem(problemId, attemptId, now)`:

1. require `CONFIRMED` effective extraction;
2. deterministically reconstruct trusted problem structure;
3. require exactly one objective mapping;
4. derive trusted `AnswerSpec`;
5. call shared `gradeAnswer()`;
6. append one canonical HOMEWORK-origin Attempt;
7. append/repair exactly one matching EvidenceRecord;
8. return a student-safe grade projection.

Repeated commands with the same identifiers must be idempotent. Conflicting reuse of an id fails closed.

## 15. Student-Safe Projection

Before grading, the UI/API may expose:

- extracted question text;
- extracted student answer;
- fields requiring confirmation;
- confidence/review status in user-appropriate form;
- source-region coordinates only where needed to render a crop/review affordance.

It must not expose:

- hidden trusted answer spec before grading;
- solution outline before grading;
- provider chain-of-thought;
- internal evidence classification rules;
- arbitrary model rationale used as authority.

## 16. Error Handling and Fail-Closed Rules

The following conditions must not create Attempt or Evidence:

- unsupported MIME type or oversized image;
- malformed provider response;
- invalid confidence or region coordinates;
- missing critical fields;
- low-confidence critical fields without confirmation;
- inconsistent mathematical structure;
- zero objective mappings;
- multiple unresolved objective mappings;
- answer key not deterministically derivable;
- unsupported problem family;
- attempt source-coordinate mismatch;
- idempotency conflict;
- extraction/provider replay that disagrees with already persisted immutable facts.

Provider failure is surfaced as an extraction failure. Phase 5 does not add background retries or queues.

## 17. Testing Strategy

Implementation follows TDD.

### 17.1 Contract and validation tests

Cover image metadata, provider result shape, normalized regions, confidence bounds, immutable extraction, append-only confirmations, and Attempt source-coordinate exclusivity.

### 17.2 Confidence tests

Cover:

- all critical fields high confidence → automatic `CONFIRMED`;
- one critical field below 0.98 → `NEEDS_CONFIRMATION`;
- correction event resolves the low-confidence field;
- high confidence with invalid mathematical structure still fails closed.

### 17.3 Conversion/mapping tests

At minimum include representative P2/P3 multiplication/division, fractions, word problems, ambiguous mapping, and unsupported open-ended/diagram cases.

### 17.4 Attempt/Evidence tests

Prove:

- homework and practice both use canonical `Attempt`;
- same `gradeAnswer()` behavior applies;
- homework origin projects `HOMEWORK` Evidence;
- wrong answer projects `incorrect`;
- correct supported answer projects deterministic positive Evidence;
- replay repairs missing Evidence without duplicating Attempt;
- conflicting id reuse fails.

### 17.5 Repository tests

Memory and Neon repository contract suites cover new homework records plus generalized Attempt coordinates.

Live Neon tests remain gated behind explicit `TEST_DATABASE_URL` and must never use production `DATABASE_URL`.

### 17.6 End-to-end acceptance scenarios

Required scenarios:

1. P2 printed arithmetic + clearly extracted handwritten answer → confirmed → mapped → graded → HOMEWORK Evidence.
2. P3 fraction question → deterministic conversion/mapping → correct Evidence.
3. Low-confidence handwritten answer → no Attempt/Evidence until confirmation → confirmation → grade.
4. Incorrect answer → immutable incorrect Attempt + incorrect Evidence.
5. Duplicate same-image submission → idempotent existing submission, not duplicated learning history.
6. Provider high confidence but structurally invalid extraction → fail closed.
7. Unsupported open-ended/diagram question → no Attempt/Evidence.
8. Replay after Attempt exists but Evidence write was interrupted → Evidence repaired exactly once.

## 18. Migration and Activation Boundary

Phase 5 may generate and commit a Drizzle migration for the new structured tables and Attempt-source generalization.

Implementation does not apply that migration automatically to any real database.

Before durable-data activation, the existing project gate still applies:

1. use explicit non-production `TEST_DATABASE_URL`;
2. apply all committed migrations there;
3. pass Phase 2/3/4/5 live repository contracts;
4. only then consider production promotion as a separate Human Owner activation step.

## 19. Security and Privacy

Homework photos are personal learning records.

V1 privacy posture:

- raw images are request-scoped and non-durable;
- only structured extraction/provenance metadata needed for the learning record is durable;
- provider output is validated before persistence;
- no provider API key or provider response internals are exposed to the client;
- no production database is used in automated tests;
- no image is copied into curriculum source files or repository fixtures unless it is synthetic/non-personal test data.

Test fixtures must be synthetic or explicitly safe repository assets.

## 20. File-Level Implementation Shape

Expected additions/changes include:

```text
lib/homework/*
lib/providers/*homework-vision*
lib/practice/types.ts
lib/practice/grading.ts            # reused, not replaced
lib/practice/evidence.ts           # generalized/shared projection boundary
lib/persistence/schema.ts
lib/persistence/*homework*
migrations/*
tests/homework-*.test.ts
tests/persistence-*-homework*.test.ts
```

Exact filenames may follow existing repository naming conventions, but the domain/provider/persistence boundaries in this spec are load-bearing.

## 21. Acceptance Gate

Phase 5 is complete only when all of the following are true:

1. Homework image intake has an explicit non-durable raw-image retention boundary.
2. Vision output contains per-field confidence and source-region provenance.
3. Provider output cannot directly set objective, answer key, grade, Evidence, Mastery, or Readiness.
4. Low-confidence critical extraction cannot produce Attempt/Evidence without confirmation.
5. Supported confirmed problems convert into code-owned trusted mathematical structures.
6. Objective mapping is deterministic and fails closed on zero/ambiguous candidates.
7. Answer keys are derived deterministically; there is no AI grading fallback.
8. Practice and homework share one canonical Attempt ledger.
9. Homework attempts use the shared `gradeAnswer()` primitive.
10. Homework emits append-only HOMEWORK-origin Evidence through deterministic projection.
11. Memory and persistence contract tests pass.
12. Required P2/P3 E2E scenarios pass.
13. Unsupported cases prove no Attempt/Evidence side effects.
14. No object storage, queue, worker, Mistake lifecycle, or adaptive scoring is introduced.
15. `npm test` passes.
16. `npm run typecheck` passes.
17. `npm run validate:curriculum` passes.
18. `npm run lint` passes.
19. `npm run build` passes in the normal host environment; a sandbox-only blocked-font-network failure remains non-product if exact HEAD passes the approved host build path.
20. Generated migration is committed but not applied to production as part of feature development.

## 22. Handoff to Phase 6

Phase 6 may consume homework-origin Attempts and Evidence exactly as it consumes practice-origin facts.

It may introduce persistent `Mistake` records and guided correction flows referencing those immutable attempts/evidence records. Phase 6 does not need a separate homework mastery model because Phase 5 deliberately converges paper work into the existing learning ledger.
