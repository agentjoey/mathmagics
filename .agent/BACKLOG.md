# Product Backlog — MathMagics

> Current product direction: Singapore Math home-education AI learning system / teaching copilot. Legacy Q05/Q18 MVP work is frozen unless needed as teaching-engine fixtures.

## 🔴 HIGH — Next Phase

### Phase 4: Practice / Attempt Core
- [ ] [MM-P4-001] Define `PracticeSession` and immutable `Attempt` domain contracts without introducing persistent Mistake state.
- [ ] [MM-P4-002] Define objective-aligned practice specification for Foundation / Core / Application / Challenge items.
- [ ] [MM-P4-003] Build deterministic practice context from Student Profile, DailyLesson/objective IDs, curriculum teaching knowledge and Evidence-derived learning state.
- [ ] [MM-P4-004] Record Attempt outcomes independently from Mastery and define explicit Attempt → `EvidenceRecord` conversion rules.
- [ ] [MM-P4-005] Preserve retry/correction provenance so later Phase 6 Mistake logic can reference Attempts/Evidence without rewriting history.
- [ ] [MM-P4-006] Add P2/P3 end-to-end practice scenarios covering correct, hinted, incorrect, retry and application outcomes.
- [ ] [MM-P4-007] Extend repository persistence only for approved Phase 4 facts; derived mastery/readiness remain unpersisted.

## 🟡 MED — Approved Roadmap

### Phase 5: Homework Vision
- [ ] Worksheet/photo ingestion, question extraction and answer extraction with confidence.
- [ ] Low-confidence handwriting confirmation flow.
- [ ] Map extracted problems to LearningObjective before grading/evidence updates.
- [ ] Decide object storage only when real homework-image retention requirements are known.

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

## 🟢 LOW / Technical Debt / Activation Gates

- [ ] Before first durable-data deployment, provision separated Neon development/Preview and production databases in Singapore.
- [ ] Run committed Drizzle migration against non-production and pass `tests/persistence-neon-contract.test.ts` with explicit `TEST_DATABASE_URL` before production promotion.
- [ ] Decide whether to self-host/package Geist fonts so sandbox builds do not depend on Google Fonts network access.
- [ ] Review npm audit findings separately; current Drizzle toolchain install reports 13 findings (1 low, 4 moderate, 8 high). Do not use forced upgrades as incidental feature work.
- [ ] Introduce multi-household User/Household/Membership identity only when the product leaves the single-household V1 boundary.

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
- [x] Prior `[MM-P2-004] Attempt vs Mistake` work intentionally decomposed: `Attempt` moves to Phase 4 and `Mistake` to Phase 6; Phase 2 provides the evidence-origin boundary they will use.

### Phase 3: Teaching Planner / Lesson Prep
- [x] [MM-P3-001] Defined `LearningPosition`, `WeeklyPlan`, `DailyLesson` and append-only plan-execution contracts.
- [x] [MM-P3-002] Planner inputs use Student Profile, Current Position, Evidence-derived Mastery/Readiness and curriculum sequence.
- [x] [MM-P3-003] Implemented deterministic planner context and candidate next-objective selection without AI-owned curriculum/mastery state.
- [x] [MM-P3-004] Implemented weekly planning intents and deterministic Learn / Practice / Review scheduling; Correction / Assessment remain reserved plan intents until their owning phases.
- [x] [MM-P3-005] Implemented trusted parent/tutor lesson-preparation context and provider-agnostic AI generation boundary.
- [x] [MM-P3-006] Added real P3 fraction end-to-end scenarios for forward learning, remediation, review + forward learning and execution/Evidence separation.
- [x] [MM-P3-007] Implemented minimum durable persistence architecture with Neon PostgreSQL + Drizzle, generated migrations and memory/Neon repository adapters.
- [x] Hardened household auth to signed stateless `mm_session` and migrated Next.js access guard to `proxy.ts`.
- [x] Locked deployment architecture to Vercel `sin1` + Neon Singapore with explicit migration and Preview/Production isolation rules.
- [x] Live Neon activation remains a separate explicit operational gate; no real database migration was executed as part of Phase 3 implementation.
