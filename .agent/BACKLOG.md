# Product Backlog — MathMagics

> Current product direction: Singapore Math home-education AI learning system / teaching copilot. Legacy Q05/Q18 MVP work is frozen unless needed as teaching-engine fixtures.

## 🔴 HIGH — Next Phase

### Phase 6: Correction + Mistake Book
- [ ] Introduce `Mistake` lifecycle: `OBSERVED → CONFIRMED → CORRECTING → RESOLVED`.
- [ ] Guided correction: diagnose → Socratic hint → retry → explanation → evidence.
- [ ] Allow Mistakes to reference Attempts/Evidence without replacing the evidence ledger.
- [ ] Automatic misconception aggregation; no manual screenshot-style mistake collection.

## 🟡 MED — Approved Roadmap

### Phase 7: Progress + Adaptive Learning Loop
- [ ] Separate Curriculum Coverage, Knowledge Mastery and Practice Performance.
- [ ] Track cross-topic problem-solving strategy mastery.
- [ ] Implement prerequisite-aware Next Best Lesson recommendations.

### Phase 8: Family Pilot
- [ ] Multi-week household pilot using P2/P3 curriculum.
- [ ] Validate that the system can reliably answer what was learned, understood, struggled with, still needs correction, and should be taught next.

## 🟢 LOW / Technical Debt / Activation Gates

- [ ] Before first durable-data deployment, provision separated Neon development/Preview and production databases in Singapore.
- [ ] Apply committed `0000` + `0001` + `0002` Drizzle migrations against non-production first and pass learning/planning, practice and homework Neon contract suites with explicit `TEST_DATABASE_URL` before production promotion.
- [ ] Decide whether to retain source homework images only when durable image review/history becomes a real product requirement; Phase 5 deliberately stores structured provenance only.
- [ ] Decide whether to self-host/package Geist fonts so sandbox builds do not depend on Google Fonts network access.
- [ ] Review npm audit findings separately; current toolchain install reports 13 findings (1 low, 4 moderate, 8 high). Do not use forced upgrades as incidental feature work.
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
- [x] Prior `[MM-P2-004] Attempt vs Mistake` work intentionally decomposed: `Attempt` moved to Phase 4 and `Mistake` to Phase 6.

### Phase 3: Teaching Planner / Lesson Prep
- [x] [MM-P3-001] `LearningPosition`, `WeeklyPlan`, `DailyLesson` and append-only plan-execution contracts.
- [x] [MM-P3-002] Planner uses Student Profile, Current Position, Evidence-derived Mastery/Readiness and curriculum sequence.
- [x] [MM-P3-003] Deterministic planner context and candidate next-objective selection.
- [x] [MM-P3-004] Deterministic Learn / Practice / Review scheduling.
- [x] [MM-P3-005] Trusted lesson-preparation context and provider-agnostic AI boundary.
- [x] [MM-P3-006] P3 fraction E2E for forward learning, remediation, review and execution/Evidence separation.
- [x] [MM-P3-007] Neon + Drizzle persistence foundation and generated migration.
- [x] Signed household session auth and Vercel `sin1` + Neon Singapore deployment architecture.

### Phase 4: Practice / Attempt Core
- [x] [MM-P4-001] Defined `PracticeSession`, structured `PracticeItem`, server-observed `PracticeHintReveal` and immutable `Attempt` contracts without persistent Mistake state.
- [x] [MM-P4-002] Implemented deterministic Foundation / Core / Application / Challenge `practice-v1` blueprint and code-owned structured problem/answer specs.
- [x] [MM-P4-003] Built trusted objective-aligned PracticePreparationContext from DailyLesson, curriculum facts and Evidence-derived learning state.
- [x] [MM-P4-004] Implemented deterministic grading and explicit replay-safe Attempt → `EvidenceRecord` projection with no mutable Mastery write path.
- [x] [MM-P4-005] Preserved append-only hint and retry/correction provenance with latest-only linear retries and stable Evidence IDs.
- [x] [MM-P4-006] Added P2/P3 E2E for independent, hinted, incorrect/retry, application, replay-repair and unsupported fail-closed outcomes.
- [x] [MM-P4-007] Added memory + Neon PracticeRepository persistence and Drizzle-generated `0001_fantastic_shocker.sql` for only the four approved practice fact tables.
- [x] Optional renderer boundary carries presentation-only data and cannot alter math truth, grading, Evidence, Mastery or Readiness.
- [x] Live Neon activation remains a separate explicit operational gate; no real database migration was executed during Phase 4 implementation.

### Phase 5: Homework Vision
- [x] Defined trusted JPEG/PNG/WebP homework-image intake, 10 MiB limit and non-durable raw-image retention boundary.
- [x] Implemented worksheet/photo question and answer extraction contracts with per-field confidence and normalized source-region provenance.
- [x] Implemented `homework-confidence-v1` with explicit low-confidence handwriting confirmation and append-only correction provenance.
- [x] Implemented deterministic P2/P3 mathematical conversion and conservative LearningObjective mapping before grading/Evidence.
- [x] Generalized the canonical immutable `Attempt` ledger to `PRACTICE | HOMEWORK`, reusing Phase 4 deterministic grading and source-aware Evidence projection; unsupported/ambiguous work fails closed.
- [x] Added memory + Neon homework persistence and Drizzle-generated `0002_gorgeous_obadiah_stane.sql` with no raw-image storage.
- [x] Added P2/P3 end-to-end homework scenarios for clear extraction, low confidence, incorrect answers, deduplication, unsupported structure and replay repair.
- [x] Persistent `Mistake` remains intentionally deferred to Phase 6; no object storage, queue/worker or adaptive scoring was introduced.
