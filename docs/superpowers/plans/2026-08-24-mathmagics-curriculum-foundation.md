# MathMagics Curriculum Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a versioned, deterministic P2/P3 Singapore Primary Mathematics curriculum knowledge base with source provenance, textbook mappings, deep teaching metadata for three vertical slices, and a validated query API for later MathMagics learning features.

**Architecture:** Keep curriculum content as Git-reviewed JSON under `content/curriculum/` and implement a small TypeScript loader/validator under `lib/curriculum/`. MOE syllabus data is curriculum truth; Primary Mathematics 2022 Edition is an edition-specific reference mapping. Raw textbook scans/PDFs remain local-only under gitignored `content-private/` and never become runtime curriculum truth.

**Tech Stack:** TypeScript 5, Node.js filesystem APIs, Vitest, existing Next.js 16 project. No new runtime dependency is required for Phase 1.

**Spec:** `docs/superpowers/specs/2026-08-24-mathmagics-curriculum-foundation-design.md` and `docs/superpowers/specs/2026-08-24-mathmagics-product-reset-design.md`

## Global Constraints

- V1 curriculum scope is Primary 2 and Primary 3 only.
- Curriculum truth source is the Singapore MOE Primary Mathematics syllabus implementing the 2021 cohort syllabus.
- Canonical textbook mapping reference is Primary Mathematics 2022 Edition, P2A/P2B/P3A/P3B.
- Textbook mapping never overrides curriculum truth.
- `content-private/` is local-only and must be gitignored before source assets are stored there.
- Raw copyrighted textbook scans, PDFs, page photos, and bulk textbook prose must not be committed.
- All committed curriculum/objective/mapping records must carry source provenance.
- Runtime AI must not validate or mutate curriculum structure.
- Phase 1 must not implement Student, Mastery, Lesson Planner, Practice Session, OCR, grading, or UI redesign.
- Prefer explicit deterministic validation over new dependencies.

---

## File Structure

### New committed files

```text
lib/curriculum/
  types.ts                  # curriculum domain records and dataset type
  validate.ts               # structural and graph validation
  loader.ts                 # load JSON files into one validated dataset
  queries.ts                # deterministic read/query API
  index.ts                  # public exports

content/curriculum/singapore-primary-math/
  README.md                 # provenance and content-maintenance rules
  sources.json              # MOE/textbook source manifest
  curriculum.json           # SG-MATH-2021 metadata
  representations.json      # shared CPA representations
  strategies.json           # cross-topic problem-solving strategies
  misconceptions.json       # reusable misconception definitions
  p2/
    nodes.json              # P2 strand/topic tree
    objectives.json         # P2 breadth + deep P2 multiplication/division metadata
  p3/
    nodes.json              # P3 strand/topic tree
    objectives.json         # P3 breadth + deep P3 fractions metadata
  textbook-mappings/
    primary-mathematics-2022-p2.json
    primary-mathematics-2022-p3.json

scripts/
  validate-curriculum.ts    # CLI validation entry point

tests/
  curriculum-validation.test.ts
  curriculum-loader.test.ts
  curriculum-queries.test.ts
```

### Modified files

- `.gitignore` — ignore `/content-private/`
- `package.json` — add `typecheck` and `validate:curriculum` scripts
- `.agent/CURRENT.md` — record Product Reset / Curriculum Foundation state after implementation passes validation

### Existing files intentionally left alone in Phase 1

- `lib/types.ts` — legacy Q05/Q18/chat types remain stable for now; curriculum types live in `lib/curriculum/types.ts` to avoid an unrelated refactor.
- `questions/Q05.json`, `questions/Q18.json` — retained as legacy teaching fixtures, not migrated in Phase 1.
- UI and API routes — no Phase 1 changes.

---

## Source Inventory Used by Phase 1

Committed `sources.json` must identify these source families without storing copyrighted full text:

1. `MOE-PM-2021-OCT-2025`
   - Singapore MOE Primary Mathematics syllabus, updated October 2025.
   - P2 content is located around syllabus pages 33-34; P3 around pages 35-36 in the published document.

2. `PM-2022-2A`
   - Primary Mathematics Student Book 2A, 2022 Edition.
   - ISBN `9789814911382`.

3. `PM-2022-2B`
   - Primary Mathematics Student Book 2B, 2022 Edition.
   - ISBN `9789814911399`.

4. `PM-2022-3A`
   - Primary Mathematics Student Book 3A, 2022 Edition.
   - ISBN `9789814911405`.

5. `PM-2022-3B`
   - Primary Mathematics Student Book 3B, 2022 Edition.
   - ISBN `9789814911412`.

The public publisher TOCs are sufficient to seed chapter/lesson mappings. Purchased books/guides can later refine page locators and teaching annotations without changing LearningObjective IDs.

---

### Task 1: Protect Private Source Material and Establish Source Manifest

**Files:**
- Modify: `.gitignore`
- Create: `content/curriculum/singapore-primary-math/README.md`
- Create: `content/curriculum/singapore-primary-math/sources.json`

**Interfaces:**
- Consumes: approved source policy from the Curriculum Foundation spec.
- Produces: stable source IDs referenced by every later content record.

- [ ] **Step 1: Add a failing privacy check**

Run before modifying `.gitignore`:

```bash
git check-ignore content-private/sources/example.pdf
```

Expected: exit code `1` because the path is not ignored yet.

- [ ] **Step 2: Ignore private source assets**

Append exactly:

```gitignore
# private curriculum source material (purchased books, scans, student source files)
/content-private/
```

- [ ] **Step 3: Verify the privacy boundary**

Run:

```bash
git check-ignore -v content-private/sources/example.pdf
```

Expected: output identifies `.gitignore` and `/content-private/`.

- [ ] **Step 4: Create the committed source manifest**

Create `sources.json` with stable IDs and metadata shaped like:

```json
[
  {
    "id": "MOE-PM-2021-OCT-2025",
    "type": "MOE_SYLLABUS",
    "title": "Primary Mathematics Syllabus Primary One to Six",
    "version": "2021 cohort syllabus; updated October 2025",
    "url": "https://www.moe.gov.sg/-/media/files/primary/2021-primary-mathematics-syllabus-p1-to-p6-updated-october-2025.pdf"
  },
  {
    "id": "PM-2022-2A",
    "type": "TEXTBOOK",
    "title": "Primary Mathematics Student Book 2A",
    "edition": "2022",
    "isbn": "9789814911382"
  }
]
```

Include analogous records for `PM-2022-2B`, `PM-2022-3A`, and `PM-2022-3B`.

- [ ] **Step 5: Document maintenance rules**

`README.md` must state:
- MOE source is curriculum truth;
- textbook entries are mappings only;
- raw source assets stay under `content-private/`;
- source locators must be preserved when derived metadata is edited; and
- textbook editions are not interchangeable.

- [ ] **Step 6: Commit**

```bash
git add .gitignore content/curriculum/singapore-primary-math/README.md content/curriculum/singapore-primary-math/sources.json
git commit -m "chore: establish curriculum source boundary"
```

---

### Task 2: Define Curriculum Domain Types

**Files:**
- Create: `lib/curriculum/types.ts`
- Create: `tests/curriculum-validation.test.ts`

**Interfaces:**
- Consumes: source IDs from Task 1.
- Produces: `CurriculumDataset`, `LearningObjective`, `SourceRef`, `CurriculumNode`, `Representation`, `ProblemSolvingStrategy`, `Misconception`, `TextbookReference`.

- [ ] **Step 1: Write a compile-time/runtime fixture test**

Start `tests/curriculum-validation.test.ts` with a minimal valid dataset fixture using the types below. The test should initially fail because `@/lib/curriculum/types` does not exist.

- [ ] **Step 2: Run the failing test**

```bash
npx vitest run tests/curriculum-validation.test.ts
```

Expected: FAIL with module resolution error for `@/lib/curriculum/types`.

- [ ] **Step 3: Implement the domain types**

Create these exact public type names:

```ts
export type SourceType = 'MOE_SYLLABUS' | 'TEXTBOOK' | 'TEACHER_GUIDE' | 'HOUSEHOLD_NOTE';
export type CurriculumNodeType = 'level' | 'strand' | 'topic' | 'subtopic';
export type CpaStage = 'CONCRETE' | 'PICTORIAL' | 'ABSTRACT';
export type DifficultyBand = 'FOUNDATION' | 'CORE' | 'APPLICATION' | 'CHALLENGE';

export interface SourceRef {
  sourceId: string;
  locator: string;
}

export interface CurriculumSource {
  id: string;
  type: SourceType;
  title: string;
  version?: string;
  edition?: string;
  isbn?: string;
  url?: string;
}

export interface Curriculum {
  id: string;
  name: string;
  country: string;
  version: string;
  sourceRefs: SourceRef[];
}

export interface CurriculumNode {
  id: string;
  type: CurriculumNodeType;
  name: string;
  parentId: string | null;
  sequence: number;
  sourceRefs: SourceRef[];
}

export interface Representation {
  id: string;
  stage: CpaStage;
  name: string;
  description: string;
  sourceRefs: SourceRef[];
}

export interface ProblemSolvingStrategy {
  id: string;
  name: string;
  description: string;
  sourceRefs: SourceRef[];
}

export interface Misconception {
  id: string;
  name: string;
  description: string;
  evidenceSignals: string[];
  sourceRefs: SourceRef[];
}

export interface LearningObjective {
  id: string;
  levelId: 'P2' | 'P3';
  topicId: string;
  title: string;
  description: string;
  sequence: number;
  sourceRefs: SourceRef[];
  prerequisiteIds: string[];
  representationIds: string[];
  strategyIds: string[];
  misconceptionIds: string[];
  readinessEvidence: string[];
  masteryEvidence: string[];
  difficultyBand: DifficultyBand;
}

export interface TextbookReference {
  id: string;
  sourceId: string;
  series: string;
  edition: string;
  book: string;
  chapter: string;
  lesson: string;
  pageStart?: number;
  pageEnd?: number;
  objectiveIds: string[];
}

export interface CurriculumDataset {
  sources: CurriculumSource[];
  curriculum: Curriculum;
  nodes: CurriculumNode[];
  objectives: LearningObjective[];
  representations: Representation[];
  strategies: ProblemSolvingStrategy[];
  misconceptions: Misconception[];
  textbookReferences: TextbookReference[];
}
```

- [ ] **Step 4: Run the test**

```bash
npx vitest run tests/curriculum-validation.test.ts
```

Expected: PASS for the fixture construction test.

- [ ] **Step 5: Commit**

```bash
git add lib/curriculum/types.ts tests/curriculum-validation.test.ts
git commit -m "feat: define curriculum domain types"
```

---

### Task 3: Implement Deterministic Structural and Graph Validation

**Files:**
- Create: `lib/curriculum/validate.ts`
- Modify: `tests/curriculum-validation.test.ts`

**Interfaces:**
- Consumes: `CurriculumDataset` from Task 2.
- Produces: `validateCurriculumDataset(dataset): string[]` and `assertValidCurriculumDataset(dataset): void`.

- [ ] **Step 1: Add failing validator tests**

Add tests that require errors for:
- duplicate IDs within each entity collection;
- missing node `parentId`;
- objective `topicId` pointing to an unknown node;
- unknown prerequisite objective ID;
- unknown representation/strategy/misconception IDs;
- unknown `sourceId` in any `sourceRefs`;
- textbook mapping to unknown objective;
- textbook mapping to unknown source;
- a prerequisite cycle `A → B → A`.

Also require one valid fixture to return `[]`.

- [ ] **Step 2: Verify tests fail**

```bash
npx vitest run tests/curriculum-validation.test.ts
```

Expected: FAIL because validator exports do not exist.

- [ ] **Step 3: Implement validation**

Expose exactly:

```ts
export function validateCurriculumDataset(dataset: CurriculumDataset): string[];

export function assertValidCurriculumDataset(dataset: CurriculumDataset): void;
```

`assertValidCurriculumDataset` must throw one `Error` whose message contains all validation errors joined by newlines.

Cycle detection must use objective prerequisite IDs only and must report the cycle path or involved objective IDs.

- [ ] **Step 4: Run targeted validation tests**

```bash
npx vitest run tests/curriculum-validation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/curriculum/validate.ts tests/curriculum-validation.test.ts
git commit -m "feat: validate curriculum graph integrity"
```

---

### Task 4: Build the Canonical P2/P3 Curriculum Breadth Inventory

**Files:**
- Create: `content/curriculum/singapore-primary-math/curriculum.json`
- Create: `content/curriculum/singapore-primary-math/p2/nodes.json`
- Create: `content/curriculum/singapore-primary-math/p2/objectives.json`
- Create: `content/curriculum/singapore-primary-math/p3/nodes.json`
- Create: `content/curriculum/singapore-primary-math/p3/objectives.json`

**Interfaces:**
- Consumes: MOE syllabus source `MOE-PM-2021-OCT-2025`.
- Produces: complete stable-ID P2/P3 curriculum tree and objective inventory; teaching annotation arrays may be empty outside the three deep slices but provenance may not be empty.

- [ ] **Step 1: Create curriculum metadata**

Use curriculum ID `SG-MATH-2021` and source ref to the MOE syllabus.

- [ ] **Step 2: Encode the P2 breadth**

P2 nodes/objectives must cover the MOE P2 content headings:

- Number and Algebra
  - Whole Numbers: numbers up to 1000; addition/subtraction; multiplication/division
  - Fractions: fraction of a whole; addition/subtraction of like fractions
  - Money
- Measurement and Geometry
  - Length, Mass and Volume
  - Time
  - 2D Shapes
  - 3D Shapes
- Statistics
  - Picture Graphs with Scales

Each numbered MOE content statement becomes a traceable LearningObjective or is split into multiple objectives only when the split makes mastery meaningfully clearer. Every objective must carry a locator such as `P2 / Number and Algebra / Multiplication and Division / 3.3`.

- [ ] **Step 3: Encode the P3 breadth**

P3 nodes/objectives must cover:

- Number and Algebra
  - Whole Numbers: numbers up to 10,000; addition/subtraction; multiplication/division
  - Fractions: equivalent fractions; addition/subtraction of related fractions
  - Money
- Measurement and Geometry
  - Length, Mass and Volume
  - Time
  - Area and Perimeter
  - Angles
  - Perpendicular and Parallel Lines
- Statistics
  - Bar Graphs

Every objective must carry an MOE source locator.

- [ ] **Step 4: Preserve breadth/depth separation**

For objectives outside the three deep slices, use:

```json
{
  "prerequisiteIds": [],
  "representationIds": [],
  "strategyIds": [],
  "misconceptionIds": [],
  "readinessEvidence": [],
  "masteryEvidence": []
}
```

Do not invent pedagogical metadata simply to avoid empty arrays.

- [ ] **Step 5: Commit**

```bash
git add content/curriculum/singapore-primary-math/curriculum.json content/curriculum/singapore-primary-math/p2 content/curriculum/singapore-primary-math/p3
git commit -m "content: add P2 P3 curriculum breadth"
```

---

### Task 5: Add Shared Teaching Knowledge and Deep P2 Multiplication/Division Annotation

**Files:**
- Create: `content/curriculum/singapore-primary-math/representations.json`
- Create: `content/curriculum/singapore-primary-math/strategies.json`
- Create: `content/curriculum/singapore-primary-math/misconceptions.json`
- Modify: `content/curriculum/singapore-primary-math/p2/objectives.json`
- Create: `content/curriculum/singapore-primary-math/textbook-mappings/primary-mathematics-2022-p2.json`

**Interfaces:**
- Consumes: P2 objective IDs from Task 4 and 2022-edition P2 TOCs/source material.
- Produces: first fully annotated vertical slice plus reusable representation/strategy/misconception IDs.

- [ ] **Step 1: Add shared representation records**

At minimum define stable records for:
- equal groups / manipulatives (`CONCRETE`);
- arrays (`PICTORIAL`);
- number line (`PICTORIAL`);
- part-whole bar model (`PICTORIAL`);
- comparison bar model (`PICTORIAL`);
- multiplication/division notation (`ABSTRACT`);
- fraction strips (`PICTORIAL`); and
- fraction notation (`ABSTRACT`).

- [ ] **Step 2: Add shared strategy records**

At minimum define:
- `STRAT-BAR-PART-WHOLE`;
- `STRAT-BAR-COMPARISON`;
- `STRAT-DRAW-DIAGRAM`;
- `STRAT-LOOK-FOR-PATTERN`;
- `STRAT-WORK-BACKWARDS`; and
- `STRAT-GUESS-CHECK`.

- [ ] **Step 3: Add P2 multiplication/division misconceptions**

Include internally written definitions for at least:
- confusing number of groups with group size;
- treating division only as sharing and not grouping;
- failing to use multiplication/division inverse relationship; and
- multiplication-fact retrieval error distinguished from concept error.

Do not copy textbook wording.

- [ ] **Step 4: Deep-annotate the P2 multiplication/division objectives**

For every objective in that slice, add:
- meaningful prerequisite IDs;
- CPA representation IDs;
- relevant problem-solving strategy IDs;
- misconception IDs;
- readiness evidence; and
- mastery evidence.

At least one cross-level-ready objective chain must be usable later as a prerequisite for P3 multiplication/division or fractions.

- [ ] **Step 5: Map Primary Mathematics 2022 P2 lessons**

Seed the mapping from the public TOCs and refine with purchased material when available. At minimum include known 2022-edition lesson mappings such as:
- 2A Chapter 4: Addition and Subtraction Using Bar Models;
- 2B Chapter 6: Multiplication;
- relevant P2 division/multiplication practice locations once confirmed from the owned source.

If a page number has not been confirmed from the owned book, omit `pageStart/pageEnd`; do not guess.

- [ ] **Step 6: Commit**

```bash
git add content/curriculum/singapore-primary-math
git commit -m "content: annotate P2 multiplication division slice"
```

---

### Task 6: Deep-annotate P3 Fractions and Map Primary Mathematics 2022 P3B

**Files:**
- Modify: `content/curriculum/singapore-primary-math/p3/objectives.json`
- Modify: `content/curriculum/singapore-primary-math/representations.json`
- Modify: `content/curriculum/singapore-primary-math/misconceptions.json`
- Create: `content/curriculum/singapore-primary-math/textbook-mappings/primary-mathematics-2022-p3.json`

**Interfaces:**
- Consumes: P2 prerequisite IDs, shared teaching knowledge, P3 fraction objectives.
- Produces: fully annotated P3 fraction vertical slice and textbook mapping.

- [ ] **Step 1: Add fraction teaching representations**

Ensure records exist for:
- fraction strip;
- part-whole area representation;
- number line; and
- symbolic fraction notation.

- [ ] **Step 2: Add fraction misconception definitions**

At minimum include:
- larger denominator assumed to mean larger fraction;
- comparing numerator only;
- changing only numerator or denominator when forming equivalent fractions; and
- confusing part size with number of equal parts.

- [ ] **Step 3: Deep-annotate P3 fraction objectives**

Cover the MOE P3 fraction objectives for:
- equivalent fractions;
- simplest form;
- compare/order unlike fractions with denominators within the syllabus bounds;
- generating an equivalent fraction from a given numerator or denominator; and
- addition/subtraction of related fractions within one whole.

Where the Primary Mathematics 2022 P3B reference contains additional lesson granularity such as unit fractions, fractions greater than one, number-line representation, or fractions of a set, record those as textbook mappings/teaching references unless they correspond directly to an MOE P3 objective. Do not silently promote textbook-only granularity into MOE curriculum truth.

- [ ] **Step 4: Add prerequisite edges**

At minimum, P3 fraction prerequisites must link back to appropriate P2 fraction understanding and relevant multiplication/division knowledge where pedagogically justified.

- [ ] **Step 5: Map the P3B fraction chapter**

Seed references for Primary Mathematics Student Book 3B (2022 Edition), Chapter 7, including lessons:
- Unit Fractions;
- More Fractions;
- Fractions Greater Than 1;
- Compare and Order Fractions;
- Equivalent Fractions;
- Fractions on a Number Line; and
- Fractions of a Set.

Mapping must target existing objective IDs and preserve source ID `PM-2022-3B`.

- [ ] **Step 6: Commit**

```bash
git add content/curriculum/singapore-primary-math/p3/objectives.json content/curriculum/singapore-primary-math/representations.json content/curriculum/singapore-primary-math/misconceptions.json content/curriculum/singapore-primary-math/textbook-mappings/primary-mathematics-2022-p3.json
git commit -m "content: annotate P3 fractions slice"
```

---

### Task 7: Complete the Cross-topic Bar Model / Word-problem Slice

**Files:**
- Modify: `content/curriculum/singapore-primary-math/strategies.json`
- Modify: `content/curriculum/singapore-primary-math/p2/objectives.json`
- Modify: `content/curriculum/singapore-primary-math/p3/objectives.json`
- Modify: both textbook mapping JSON files

**Interfaces:**
- Consumes: curriculum objective IDs and shared bar-model strategy IDs.
- Produces: strategy mappings that can be queried independently from topics.

- [ ] **Step 1: Ensure bar-model strategies are cross-topic records**

`STRAT-BAR-PART-WHOLE` and `STRAT-BAR-COMPARISON` must live in `strategies.json`, never as child curriculum nodes.

- [ ] **Step 2: Map P2 bar-model use**

Associate the strategies with the P2 addition/subtraction word-problem objectives that match the 2022-edition 2A Chapter 4 reference structure.

- [ ] **Step 3: Map P3 word-problem use**

Associate bar-model/drawing strategies with relevant P3 arithmetic, money, fraction, measurement, and area/perimeter objectives only where the teaching source or reviewed pedagogy supports the mapping.

- [ ] **Step 4: Add readiness/mastery evidence for strategy use**

Evidence must describe observable behaviour, for example:
- identifies whole and parts before drawing;
- labels known and unknown quantities correctly;
- selects comparison rather than part-whole structure independently; and
- explains what each bar segment represents.

- [ ] **Step 5: Commit**

```bash
git add content/curriculum/singapore-primary-math
git commit -m "content: map bar model strategies across P2 P3"
```

---

### Task 8: Implement the JSON Loader and Validation CLI

**Files:**
- Create: `lib/curriculum/loader.ts`
- Create: `scripts/validate-curriculum.ts`
- Create: `tests/curriculum-loader.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: JSON files produced by Tasks 1 and 4-7.
- Produces: `loadCurriculumDataset(rootDir?: string): CurriculumDataset` and CLI script `npm run validate:curriculum`.

- [ ] **Step 1: Write failing loader tests**

Tests must verify:
- the default dataset loads;
- both `P2` and `P3` nodes exist;
- representative P2 multiplication/division and P3 fraction objectives exist;
- textbook mappings load; and
- `assertValidCurriculumDataset` is invoked by the loader.

- [ ] **Step 2: Run failing test**

```bash
npx vitest run tests/curriculum-loader.test.ts
```

Expected: FAIL because the loader does not exist.

- [ ] **Step 3: Implement loader**

Expose:

```ts
export function loadCurriculumDataset(rootDir?: string): CurriculumDataset;
```

Default root:

```ts
path.join(process.cwd(), 'content', 'curriculum', 'singapore-primary-math')
```

The loader must read the known JSON files explicitly, merge P2/P3 arrays, validate the assembled dataset, and return it. Do not recursively ingest arbitrary JSON files.

- [ ] **Step 4: Add validation CLI**

`scripts/validate-curriculum.ts` must load the default dataset and print a short success summary including node/objective/mapping counts. Structural failure exits non-zero by allowing the validation error to propagate.

- [ ] **Step 5: Add scripts**

Add to `package.json`:

```json
{
  "typecheck": "tsc --noEmit",
  "validate:curriculum": "tsx scripts/validate-curriculum.ts"
}
```

- [ ] **Step 6: Run targeted and full validation**

```bash
npm run validate:curriculum
npx vitest run tests/curriculum-validation.test.ts tests/curriculum-loader.test.ts
npm run typecheck
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/curriculum/loader.ts scripts/validate-curriculum.ts tests/curriculum-loader.test.ts package.json package-lock.json
git commit -m "feat: load and validate curriculum content"
```

---

### Task 9: Implement the Deterministic Curriculum Query API

**Files:**
- Create: `lib/curriculum/queries.ts`
- Create: `lib/curriculum/index.ts`
- Create: `tests/curriculum-queries.test.ts`

**Interfaces:**
- Consumes: `CurriculumDataset` from the loader.
- Produces exact public functions:
  - `getLearningObjective(id, dataset?)`
  - `listObjectivesForTopic(topicId, dataset?)`
  - `getPrerequisites(objectiveId, dataset?)`
  - `getRepresentations(objectiveId, dataset?)`
  - `getStrategies(objectiveId, dataset?)`
  - `getMisconceptions(objectiveId, dataset?)`
  - `getTextbookReferences(objectiveId, dataset?)`

- [ ] **Step 1: Write failing query tests**

Tests must cover:
- a P3 fractions topic returns multiple objectives in sequence order;
- a P3 fraction objective returns at least one P2/P3 prerequisite from the deep slice;
- representations resolve from IDs to full records;
- a bar-model strategy resolves independently of Topic hierarchy;
- textbook references for a mapped P3 fraction objective include `PM-2022-3B`;
- unknown objective/topic IDs throw clear errors.

- [ ] **Step 2: Run failing tests**

```bash
npx vitest run tests/curriculum-queries.test.ts
```

Expected: FAIL because query exports do not exist.

- [ ] **Step 3: Implement query functions**

Use these signatures:

```ts
export function getLearningObjective(id: string, dataset?: CurriculumDataset): LearningObjective;
export function listObjectivesForTopic(topicId: string, dataset?: CurriculumDataset): LearningObjective[];
export function getPrerequisites(objectiveId: string, dataset?: CurriculumDataset): LearningObjective[];
export function getRepresentations(objectiveId: string, dataset?: CurriculumDataset): Representation[];
export function getStrategies(objectiveId: string, dataset?: CurriculumDataset): ProblemSolvingStrategy[];
export function getMisconceptions(objectiveId: string, dataset?: CurriculumDataset): Misconception[];
export function getTextbookReferences(objectiveId: string, dataset?: CurriculumDataset): TextbookReference[];
```

When `dataset` is omitted, lazily load the default dataset once and reuse it. Do not mutate the dataset.

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/curriculum-queries.test.ts
npm test
npm run typecheck
npm run validate:curriculum
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/curriculum/queries.ts lib/curriculum/index.ts tests/curriculum-queries.test.ts
git commit -m "feat: expose curriculum query API"
```

---

### Task 10: Phase 1 Verification and Project-state Update

**Files:**
- Modify: `.agent/CURRENT.md`
- Optionally modify: `.agent/BACKLOG.md` only to reflect the already-approved product reset and next-phase ordering; do not expand scope.

**Interfaces:**
- Consumes: complete Phase 1 implementation.
- Produces: verified Phase 1 completion state and handoff contract for Student/Mastery work.

- [ ] **Step 1: Run full local verification**

```bash
npm test
npm run typecheck
npm run validate:curriculum
npm run lint
```

Expected: all commands PASS.

- [ ] **Step 2: Verify privacy boundary**

```bash
git check-ignore -v content-private/sources/example.pdf
git ls-files 'content-private/**'
```

Expected:
- first command confirms ignore rule;
- second command returns no files.

- [ ] **Step 3: Inspect curriculum coverage**

Run the validation CLI and confirm it reports non-zero P2/P3 objective counts and non-zero textbook mappings. Manually spot-check:
- one P2 multiplication/division objective;
- one P3 fraction objective;
- one cross-topic bar-model strategy;
- one prerequisite edge; and
- one textbook mapping.

- [ ] **Step 4: Update current status**

Record:
- product reset accepted;
- Phase 1 Curriculum Foundation completed;
- P2/P3 breadth inventory established;
- three deep slices completed;
- next planned phase is Student/Mastery Model;
- legacy Q05/Q18 remain fixtures rather than product scope.

- [ ] **Step 5: Commit project-state update**

```bash
git add .agent/CURRENT.md .agent/BACKLOG.md
git commit -m "docs: record curriculum foundation completion"
```

If `.agent/BACKLOG.md` did not need a change, omit it from `git add`.

---

## Self-Review Checklist

Before implementation is considered complete, verify:

1. **Spec coverage**
   - curriculum truth vs textbook mapping is explicit;
   - P2/P3 breadth exists;
   - three deep slices exist;
   - source provenance exists;
   - private source boundary exists;
   - graph validation exists;
   - deterministic query API exists.

2. **No placeholder content**
   - no `TODO`/`TBD` in new curriculum files;
   - no guessed textbook page numbers;
   - no invented MOE requirements;
   - empty annotation arrays are allowed only outside deep slices.

3. **Type consistency**
   - all JSON keys match `lib/curriculum/types.ts`;
   - all query signatures match Task 9 exactly;
   - all source IDs match `sources.json`;
   - prerequisite/reference IDs resolve under the validator.

4. **Scope discipline**
   - no Student/Mastery persistence;
   - no OCR/photo pipeline;
   - no UI redesign;
   - no AI curriculum generation.

## Execution Note

The current GrandeGPT registration for `mathmagics` does not expose a repo-specific `test`/`typecheck` run profile. Before agentic implementation, either register controlled MathMagics verification profiles for the existing npm commands or execute those verification commands through the approved host workflow. Do not treat the absence of a GrandeGPT run profile as permission to skip the test gates.
