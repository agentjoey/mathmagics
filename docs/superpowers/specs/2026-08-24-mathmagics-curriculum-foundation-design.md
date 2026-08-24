# MathMagics Curriculum Foundation Design

Status: Approved Phase 1 design; implementation not started.

## 1. Objective

Create a versioned, reviewable Singapore Primary Mathematics knowledge base for P2 and P3 that can power lesson planning, practice mapping, correction, mastery tracking, and future adaptive planning.

Phase 1 builds curriculum and teaching knowledge. It does not build student persistence, UI, OCR, lesson generation, or adaptive planning.

## 2. Authoritative and Reference Sources

### 2.1 Curriculum truth

Canonical curriculum source:
- Singapore Ministry of Education (MOE), Primary Mathematics syllabus implementing the 2021 cohort syllabus.

All curriculum records must carry source provenance and curriculum version. The curriculum source determines what students are expected to learn; textbook sequence does not override it.

### 2.2 Reference textbook

Canonical reference series for V1 mapping:
- **Primary Mathematics, 2022 Edition** (Marshall Cavendish / Singapore Math distribution), P2A, P2B, P3A, and P3B.

Reason for selecting one edition:
- textbook components are edition-specific and should not be merged as if they were interchangeable;
- the 2022 edition explicitly organises lessons around Readiness, Engagement, and Mastery; and
- P2/P3 Student Books, practice books, and instructor/teacher guides are available as a coherent series.

If the household actually uses another edition, that edition may later receive a separate mapping. It must never overwrite the canonical curriculum graph.

### 2.3 Teaching references

Preferred supporting material, when legally obtained for personal use:
- Home Instructor's Guide or Teacher's Guide for P2/P3;
- Additional Practice / workbook material;
- Mastery & Beyond or equivalent enrichment material; and
- the student's real school worksheets and tests.

## 3. Content Acquisition and Storage Policy

This is a private, non-commercial project, but source provenance and copyright boundaries still matter.

### 3.1 Public curriculum material

MOE syllabus material may be downloaded and retained locally according to its published personal/non-commercial terms. Derived structured curriculum data may be committed to the repository with source metadata.

### 3.2 Purchased textbook material

Purchase or otherwise lawfully obtain the P2A/P2B/P3A/P3B 2022-edition materials used by the household.

Raw scans, PDFs, page photographs, and full copyrighted textbook text are local reference assets and must **not** be committed into the normal source repository.

Recommended local-only source location:

`content-private/sources/`

The directory must be gitignored before any source asset is placed there.

The repository may contain derived facts and metadata such as:
- book identifier and edition;
- chapter and lesson names;
- page references;
- curriculum/objective mappings;
- prerequisite relationships;
- short internally written teaching summaries;
- misconception labels;
- representation labels; and
- problem metadata for household-created or separately licensed problems.

Do not bulk-copy textbook prose or full exercise sets into committed JSON merely because the project is private.

### 3.3 User-generated learning material

Photos of the student's homework, school worksheets, and tests are personal learning records. Their eventual storage belongs to the student-data subsystem, not the canonical curriculum repository.

## 4. Content Layers

### Layer 1: Curriculum Truth

Contains:
- Curriculum
- Level
- Strand
- Topic
- LearningObjective
- curriculum source/version metadata

This layer is human-reviewed and not writable by runtime AI.

### Layer 2: Teaching Knowledge

Contains:
- prerequisite relationships;
- CPA representations;
- problem-solving strategies;
- readiness checks;
- common misconceptions;
- mastery evidence definitions; and
- textbook references.

AI may propose additions, but committed records require review.

### Layer 3: Generated Content

Contains runtime/generated artifacts such as:
- lesson wording;
- examples;
- practice variants;
- hints; and
- correction dialogue.

Layer 3 is not part of Phase 1 persistence.

## 5. Curriculum Graph

Hierarchy:

`Curriculum → Level → Strand → Topic → LearningObjective`

LearningObjective is the smallest curriculum unit tracked by the learning system.

P2 and P3 belong to the same curriculum/version and may have cross-level prerequisite edges.

## 6. Stable IDs

IDs are stable semantic identifiers, not display text.

Examples:
- `SG-MATH-2021`
- `P2`
- `P2-NUM-MULDIV`
- `P2-NUM-MULDIV-MULTIPLICATION-CONCEPT`
- `P3-NUM-FRA-COMPARE-ORDER`
- `STRAT-BAR-PART-WHOLE`
- `MISC-FRA-DENOMINATOR-MAGNITUDE`

IDs must not encode textbook page numbers because pages and editions can change.

## 7. Core Records

### 7.1 Curriculum

Required fields:
- `id`
- `name`
- `country`
- `version`
- `sourceTitle`
- `sourceUrl`

### 7.2 CurriculumNode

Represents `level`, `strand`, `topic`, or `subtopic`.

Required fields:
- `id`
- `type`
- `name`
- `parentId`
- `sequence`

### 7.3 LearningObjective

Required fields:
- `id`
- `levelId`
- `topicId`
- `title`
- `description`
- `sequence`
- `sourceRefs`
- `prerequisiteIds`
- `representationIds`
- `strategyIds`
- `misconceptionIds`
- `readinessEvidence`
- `masteryEvidence`
- `difficultyBand`

`difficultyBand` is one of:
- `FOUNDATION`
- `CORE`
- `APPLICATION`
- `CHALLENGE`

Difficulty is teaching/practice metadata; it does not redefine the official curriculum scope.

### 7.4 Representation

Represents a teaching representation.

Required fields:
- `id`
- `stage`: `CONCRETE | PICTORIAL | ABSTRACT`
- `name`
- `description`

Examples include counters, number bonds, bar models, fraction strips, number lines, and symbolic notation.

### 7.5 ProblemSolvingStrategy

Problem-solving strategies are cross-topic resources, not children of a single Topic.

Required fields:
- `id`
- `name`
- `description`

Examples:
- part-whole bar model;
- comparison bar model;
- draw a diagram;
- look for a pattern;
- work backwards; and
- guess and check.

### 7.6 Misconception

Required fields:
- `id`
- `name`
- `description`
- `evidenceSignals`

A misconception is a candidate learning pattern, not proof that a student has the misconception. Runtime Mistake analysis must distinguish isolated errors from repeated evidence.

### 7.7 TextbookReference

Required fields:
- `id`
- `series`
- `edition`
- `book`
- `chapter`
- `lesson`
- `pageStart` when known
- `pageEnd` when known
- `objectiveIds`
- `sourceType`

Textbook references are mappings. They do not own LearningObjective IDs.

## 8. Source Provenance

Every curriculum objective and textbook mapping must be traceable.

A `sourceRef` records:
- source ID;
- source type (`MOE_SYLLABUS`, `TEXTBOOK`, `TEACHER_GUIDE`, `HOUSEHOLD_NOTE`);
- edition/version;
- section/chapter/lesson; and
- page or locator when available.

The system must be able to distinguish:
- “MOE explicitly requires this”; from
- “the reference textbook teaches it here”; from
- “MathMagics recommends this teaching approach.”

## 9. Initial Vertical Slices

Phase 1 does not attempt deep teaching annotation for every P2/P3 objective at once.

### Slice A: P2 Multiplication and Division

Purpose:
- validate cross-concept prerequisites;
- validate concrete/pictorial representations; and
- provide prerequisite data used by later P3 work.

Deep annotation includes:
- multiplication concept;
- division as sharing/grouping;
- relevant multiplication facts;
- basic word problems; and
- bar-model links where appropriate.

### Slice B: P3 Fractions

Purpose:
- validate a concept-rich progression;
- validate visual representations;
- validate misconception metadata; and
- validate readiness/mastery evidence.

Deep annotation includes at least:
- unit fractions;
- fractions greater than one where applicable to the selected source mapping;
- compare/order fractions;
- equivalent fractions;
- fraction representation on a number line; and
- fractions of a set.

### Slice C: P2/P3 Word Problems and Bar Models

Purpose:
- validate strategies that cut across topics and levels.

Deep annotation includes:
- part-whole model;
- comparison model;
- change/related word-problem structures where present; and
- objective-to-strategy mappings.

## 10. Breadth vs Depth Rule

Phase 1 output has two levels of completeness:

### Breadth

Create the P2 and P3 curriculum tree and objective inventory so all V1 topics have stable IDs and source provenance.

### Depth

Fully annotate the three vertical slices with prerequisites, representations, strategies, misconceptions, readiness evidence, mastery evidence, and textbook references.

This prevents the first implementation from requiring exhaustive pedagogical annotation of every P2/P3 objective before it can be tested.

## 11. Repository Layout

Planned committed layout:

```text
content/
  curriculum/
    singapore-primary-math/
      curriculum.json
      p2/
        nodes.json
        objectives.json
      p3/
        nodes.json
        objectives.json
      representations.json
      strategies.json
      misconceptions.json
      textbook-mappings/
        primary-mathematics-2022-p2.json
        primary-mathematics-2022-p3.json
```

Planned private source layout:

```text
content-private/
  sources/
    moe/
    primary-mathematics-2022/
```

`content-private/` must be gitignored.

## 12. Loader and Validation Boundary

Phase 1 includes a small deterministic curriculum loader/validator so content errors fail early.

It must validate at minimum:
- duplicate IDs;
- missing parent IDs;
- missing prerequisite objective IDs;
- missing representation, strategy, and misconception references;
- invalid curriculum/level relationships;
- prerequisite cycles;
- textbook mappings to unknown objectives; and
- required source provenance.

Runtime AI is not used to validate structural integrity.

## 13. Interfaces to Later Phases

Later Student/Mastery work may consume:
- `getLearningObjective(id)`;
- `listObjectivesForTopic(topicId)`;
- `getPrerequisites(objectiveId)`;
- `getRepresentations(objectiveId)`;
- `getStrategies(objectiveId)`;
- `getMisconceptions(objectiveId)`; and
- `getTextbookReferences(objectiveId)`.

Phase 1 does not implement mastery state, attempts, lessons, plans, OCR, or student persistence.

## 14. Phase 1 Acceptance Criteria

Phase 1 is complete when:

1. P2 and P3 curriculum trees and objective inventories are represented with stable IDs and source provenance.
2. The three vertical slices have deep teaching annotations.
3. The 2022 Primary Mathematics P2/P3 textbook structure can be mapped to curriculum objectives without becoming curriculum truth.
4. The loader rejects dangling references and prerequisite cycles.
5. A deterministic API can answer:
   - what objectives belong to a topic;
   - what prerequisites an objective has;
   - which representations and strategies are recommended;
   - which misconceptions are associated with it; and
   - where the reference textbook covers it.
6. No copyrighted raw textbook scans or bulk textbook prose are committed to the repository.

## 15. Explicit Non-Goals

Phase 1 does not implement:
- Student profiles;
- Mastery records;
- Practice sessions or Attempts;
- Mistake lifecycle;
- Lesson Planner;
- AI content generation;
- homework image OCR/grading;
- UI redesign; or
- complete deep annotation of every P2/P3 objective.
