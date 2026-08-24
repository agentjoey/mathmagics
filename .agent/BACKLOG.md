# Product Backlog — MathMagics

> Current product direction: Singapore Math home-education AI learning system / teaching copilot. Legacy Q05/Q18 MVP work is frozen unless needed as teaching-engine fixtures.

## 🔴 HIGH — Next Phase

### Phase 2: Student & Mastery Model
- [ ] [MM-P2-001] Define Student profile and curriculum enrollment/current-position model.
- [ ] [MM-P2-002] Implement `Student × LearningObjective → Mastery` state model.
- [ ] [MM-P2-003] Implement Evidence records and deterministic mastery transition policy.
- [ ] [MM-P2-004] Model Attempt separately from Mistake; a wrong attempt must not automatically create a confirmed misconception.
- [ ] [MM-P2-005] Add mastery/readiness queries backed by the Phase 1 curriculum API.
- [ ] [MM-P2-006] Add tests for mastery transitions, prerequisite readiness and evidence aggregation.

## 🟡 MED — Approved Roadmap

### Phase 3: Teaching Planner / Lesson Prep
- [ ] Weekly plan model: Learn / Practice / Review / Correction / Assessment.
- [ ] Current-position setup via selected topic, school plan/textbook mapping or short diagnostic.
- [ ] Parent/Tutor lesson-preparation copilot using deterministic curriculum/mastery context.

### Phase 4: Practice
- [ ] PracticeSession and Attempt pipeline.
- [ ] Objective-aligned practice with Foundation / Core / Application / Challenge metadata.
- [ ] Online practice evidence feeds the same mastery system used by later paper homework.

### Phase 5: Homework Vision
- [ ] Worksheet/photo ingestion, question extraction and answer extraction with confidence.
- [ ] Low-confidence handwriting confirmation flow.
- [ ] Map extracted problems to LearningObjective before grading/evidence updates.

### Phase 6: Correction + Mistake Book
- [ ] Guided correction: diagnose → Socratic hint → retry → explanation → evidence.
- [ ] Mistake lifecycle: observed → confirmed → correcting → resolved.
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
