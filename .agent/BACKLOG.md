# Product Backlog — MathMagics

> Current product direction: Singapore Math home-education AI learning system / teaching copilot. Legacy Q05/Q18 MVP work is frozen unless needed as teaching-engine fixtures.

## 🔴 HIGH — Next Phase

### Phase 3: Teaching Planner / Lesson Prep
- [ ] [MM-P3-001] Define `LearningPosition`, `WeeklyPlan`, `DailyLesson` and plan-execution domain contracts.
- [ ] [MM-P3-002] Define planner inputs from Student Profile, Current Position, Mastery, Readiness and curriculum sequence.
- [ ] [MM-P3-003] Implement deterministic planner context and candidate next-objective selection without AI-owned curriculum/mastery state.
- [ ] [MM-P3-004] Implement weekly planning across Learn / Practice / Review / Correction / Assessment intents.
- [ ] [MM-P3-005] Implement parent/tutor lesson-preparation brief contract and generation boundary.
- [ ] [MM-P3-006] Add end-to-end planner scenarios using real P2/P3 curriculum and Phase 2 learning-state APIs.
- [ ] [MM-P3-007] Decide and implement the minimum durable household persistence needed before planner state must survive process restarts.

## 🟡 MED — Approved Roadmap

### Phase 4: Practice
- [ ] Introduce `PracticeSession` and `Attempt` as separate domain records.
- [ ] Objective-aligned practice with Foundation / Core / Application / Challenge metadata.
- [ ] Convert practice outcomes into Phase 2 `EvidenceRecord`s through the existing evidence-origin contract.
- [ ] Keep wrong Attempt separate from persistent Mistake/misconception confirmation.

### Phase 5: Homework Vision
- [ ] Worksheet/photo ingestion, question extraction and answer extraction with confidence.
- [ ] Low-confidence handwriting confirmation flow.
- [ ] Map extracted problems to LearningObjective before grading/evidence updates.

### Phase 6: Correction + Mistake Book
- [ ] Introduce `Mistake` lifecycle: `OBSERVED → CONFIRMED → CORRECTING → RESOLVED`.
- [ ] Guided correction: diagnose → Socratic hint → retry → explanation → evidence.
- [ ] Allow Mistakes to reference Attempts/Evidence without replacing the evidence ledger.
- [ ] Automatic misconception aggregation; no manual screenshot-style mistake collection.

### Phase 7: Progress + Adaptive Learning Loop
- [ ] Separate Curriculum Coverage, Knowledge Mastery and Practice Performance.
- [ ] Track cross-topic problem-solving strategy mastery.
- [ ] Implement prerequisite-aware Next Best Lesson recommendations.

### Phase 8: Family Pilot
- [ ] Multi-week household pilot using P2/P3 curriculum.
- [ ] Validate that the system can reliably answer what was learned, understood, struggled with, still needs correction, and should be taught next.

## 🟢 LOW / Technical Debt
- [ ] Migrate deprecated Next.js `middleware` convention to `proxy` when touching auth/routing infrastructure.
- [ ] Decide whether to self-host/package Geist fonts so sandbox builds do not depend on Google Fonts network access.
- [ ] Review current npm audit findings separately; do not use forced upgrades as incidental feature work.

## ❄️ Frozen Legacy MVP Work
- [ ] Q05 prompt iteration and Q18 A/B tuning only if needed to improve the reusable Socratic/Feynman teaching engine.
- [ ] Old standalone Vercel MVP release is no longer a product milestone.
- [ ] Magic Canvas, full Math Kangaroo bank, generic voice/PWA expansion remain outside current roadmap unless re-approved.

## ✅ Completed

### Phase 0: Product Reset
- Product positioning, users, learning loop, AI boundary, V1 scope and non-goals approved.

### Phase 1: Curriculum Foundation
- P2/P3 curriculum breadth established.
- Three teaching-knowledge deep slices established.
- Curriculum provenance, private source boundary and textbook mapping model established.
- Deterministic loader, validator and curriculum query API implemented and verified.

### Phase 2: Student & Mastery Core
- [x] [MM-P2-001] Student profile and current-position model implemented and validated.
- [x] [MM-P2-002] `Student × LearningObjective → Mastery` derived-state model implemented.
- [x] [MM-P2-003] Append-only Evidence records and deterministic mastery/review policy implemented.
- [x] [MM-P2-005] Mastery/readiness queries backed by real Phase 1 curriculum prerequisite links implemented.
- [x] [MM-P2-006] Mastery transition, repository, readiness, query and end-to-end acceptance tests implemented.
- [x] Prior `[MM-P2-004] Attempt vs Mistake` work was intentionally decomposed: `Attempt` moves to Phase 4 and `Mistake` to Phase 6; Phase 2 already provides the extensible evidence-origin boundary they will use.
- [x] Production persistence intentionally not selected in Phase 2; decision moved to Phase 3 before planner state requires durability.
