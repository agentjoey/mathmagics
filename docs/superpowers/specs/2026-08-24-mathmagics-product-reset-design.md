# MathMagics Product Reset Design

Status: Approved product direction; implementation not started.

## 1. Product Vision

MathMagics is a Singapore Math learning companion for home education.

The primary users are:
- a parent who may also act as tutor; and
- one student in the household.

The product helps the family sustain a continuous learning loop:

`Plan → Learn → Practice → Correct → Track → Adapt`

MathMagics is not primarily a chatbot and is not primarily an answer generator. Its core job is to maintain a trustworthy learning model over time so the family can answer:

1. What should the student learn next?
2. How should the parent/tutor teach it?
3. What has the student practised?
4. What mistakes remain unresolved?
5. What has the student actually mastered?

## 2. V1 Scope

### Curriculum scope

V1 covers:
- Singapore Primary Mathematics;
- Primary 2 (P2); and
- Primary 3 (P3).

The curriculum truth source is the Singapore MOE Primary Mathematics syllabus. Textbooks are reference mappings and teaching resources, not curriculum truth.

### User scope

V1 supports one household learning context:
- one Parent/Tutor role;
- one Student role;
- one active student profile.

The domain model may use stable IDs so multi-student support can be added later, but no multi-student UI or workflow is in V1.

### Core capabilities

V1 includes:
- curriculum-based learning planning;
- weekly and daily lesson planning;
- parent/tutor lesson preparation;
- student lesson flow;
- student practice;
- homework/worksheet photo submission;
- AI-assisted marking with confidence handling;
- guided correction rather than answer-only feedback;
- automatic mistake collection;
- curriculum, mastery, and practice progress tracking; and
- basic next-lesson recommendation.

## 3. Core User Flows

### 3.1 Parent/Tutor flow

`Student setup → Current position → Weekly plan → Lesson preparation → Review progress/mistakes → Adjust or accept next plan`

Minimum setup input:
- level: P2 or P3;
- current topic or diagnostic path;
- sessions per week;
- minutes per session; and
- learning mode: follow-school or structured-home-learning.

Optional inputs:
- school textbook and edition;
- current chapter/page;
- school term plan;
- upcoming test;
- parent observations; and
- learning goals.

As usage increases, observed learning evidence must gradually become more important than manually entered assumptions.

### 3.2 Student flow

`Today → Learn → Practice → Submit/Check Work → Correct Mistakes → Finish`

The student UI should remain task-oriented. It should not expose the full curriculum graph, mastery policy, or planner configuration.

### 3.3 Paper homework flow

`Photo → Question extraction → Student-answer extraction → Confirmation when confidence is low → Grading → Guided correction → Evidence → Mistake/Mastery update`

Paper work and in-app practice must converge into the same Attempt/Evidence pipeline. They must not create separate progress systems.

## 4. Learning Model

### 4.1 Core state

The central state is:

`Student × LearningObjective → Mastery`

A LearningObjective is the smallest curriculum unit whose progress is tracked.

### 4.2 Mastery states

V1 uses four deterministic states:
- `NOT_STARTED`
- `INTRODUCED`
- `DEVELOPING`
- `MASTERED`

A mastered objective may also be marked `reviewDue` without immediately reducing its mastery state.

### 4.3 Evidence types

Mastery is driven by recorded evidence, including:
- `introduced`
- `incorrect`
- `correct_with_hint`
- `independent_correct`
- `corrected`
- `explained_independently`
- `application_correct`

AI may interpret evidence and explain recommendations, but AI does not directly set mastery state. A deterministic policy owns mastery transitions.

### 4.4 Attempt vs Mistake

An `Attempt` is one student answer or learning interaction.

A wrong Attempt does not automatically equal a persistent learning problem.

A `Mistake` represents an identified learning issue or misconception supported by one or more attempts.

Mistake lifecycle:
- `OBSERVED`
- `CONFIRMED`
- `CORRECTING`
- `RESOLVED`

This distinction prevents one-off slips from being reported as knowledge gaps.

## 5. Progress Model

Progress is intentionally split into three views.

### Curriculum progress

Answers: where has the student reached in P2/P3?

### Mastery progress

Answers: how well are specific LearningObjectives understood?

### Practice progress

Answers: how much practice occurred and what happened during it?

V1 must not collapse these into one percentage such as “Fractions 78%”.

## 6. Teaching Model

MathMagics uses Singapore Mathematics pedagogy as a teaching framework rather than treating it as a visual theme.

A lesson may use:
- readiness checks;
- concrete, pictorial, and abstract representations where appropriate;
- guided inquiry/Socratic questioning;
- direct explanation where appropriate;
- deliberate practice;
- problem-solving heuristics such as bar models; and
- Feynman-style explanation as mastery evidence.

The existing Socratic/Feynman work from the legacy Q05/Q18 MVP is retained as teaching-engine material, not as the product shell.

## 7. AI Responsibility Boundary

AI may:
- generate age-appropriate explanations;
- generate or adapt examples and practice;
- generate hints;
- analyse likely error types;
- suggest misconception mappings;
- prepare lesson briefs;
- explain progress and recommendations; and
- recommend the next learning action.

AI may not be the source of truth for:
- curriculum contents;
- textbook provenance;
- student history;
- attempt records;
- correction completion;
- mastery state; or
- plan execution history.

Persistent state is owned by application data and deterministic rules.

## 8. Content Architecture

MathMagics separates three layers:

1. **Curriculum Truth**: versioned curriculum facts and learning objectives.
2. **Teaching Knowledge**: prerequisites, representations, strategies, misconceptions, readiness checks, and mastery evidence.
3. **Generated Content**: lesson wording, examples, exercise variants, hints, and correction dialogue.

Generated content may reference Layers 1 and 2 but may not silently rewrite them.

## 9. Legacy MVP Transition

Keep and repurpose:
- Q05 and Q18 as problem/teaching-engine fixtures;
- the existing MiniMax provider abstraction;
- streaming chat infrastructure where it is useful for guided teaching;
- Socratic prompt material;
- Feynman-style explanation prompts; and
- SVG/visual-aid concepts.

Do not preserve the old product architecture merely because it exists. The new product is learning-state-first, not question-chat-first.

The old Sprint 001 prompt-tuning/deployment closeout is superseded by this reset unless a later task explicitly revives it.

## 10. V1 Success Criteria

A successful household pilot lasts at least four weeks and allows MathMagics to answer, from recorded data:

1. What did the student learn during the period?
2. Which LearningObjectives are mastered, developing, or not yet introduced?
3. Which misconceptions or repeated mistake patterns need attention?
4. Which mistakes have been corrected versus still unresolved?
5. What should the student learn or review next, and why?

The family should not need a separate spreadsheet or notebook to track these five questions.

## 11. Explicit Non-Goals

V1 does not include:
- school administration;
- classroom management;
- tutor-centre multi-class workflows;
- billing or subscriptions;
- social features or leaderboards;
- P1 or P4-P6 curriculum coverage;
- a commercial textbook/content marketplace;
- a large worksheet-authoring platform;
- complex psychometric scoring;
- Bayesian knowledge tracing or IRT;
- learning-style personality models; or
- autonomous modification of curriculum truth.

## 12. Delivery Sequence

Implementation is dependency-driven:

1. Curriculum Foundation
2. Student and Mastery Model
3. Teaching Planner and Lesson Model
4. Practice and Attempt Model
5. Homework Vision and Grading
6. Guided Correction and Mistake Book
7. Progress Views
8. Basic Adaptive Planning
9. Four-week family pilot

Each phase must produce a testable vertical capability and must not require later phases to validate its own data contracts.
