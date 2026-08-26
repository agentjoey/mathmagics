# Product Backlog — MathMagics

> Current product direction: Singapore Math home-education AI learning system / teaching copilot. Legacy Q05/Q18 MVP work is frozen unless needed as teaching-engine fixtures.

## 🔴 HIGH — Next Phase

### Phase 7: Progress + Adaptive Learning Loop
- [ ] Separate Curriculum Coverage, Knowledge Mastery and Practice Performance.
- [ ] Track cross-topic problem-solving strategy mastery.
- [ ] Implement prerequisite-aware Next Best Lesson recommendations.
- [ ] Consume Phase 6 Mistake/recurrence facts without weakening correction authority.
- [ ] Use the reserved `CORRECTION` lesson intent adaptively where deterministic policy supports it.

## 🟡 MED — Approved Roadmap

### Phase 8: Family Pilot
- [ ] Multi-week household pilot using P2/P3 curriculum.
- [ ] Validate that the system can reliably answer what was learned, understood, struggled with, still needs correction, and should be taught next.

## 🟢 LOW / Technical Debt / Activation Gates

- [ ] Before first durable-data deployment, provision separated Neon development/Preview and production databases in Singapore.
- [ ] Apply committed `0000` + `0001` + `0002` + `0003` Drizzle migrations against non-production first and pass learning/planning, practice, homework and correction Neon contract suites with explicit `TEST_DATABASE_URL` before production promotion.
- [ ] Decide whether to retain source homework images only when durable image review/history becomes a real product requirement; Phase 5 deliberately stores structured provenance only.
- [ ] Decide whether to self-host/package Geist fonts so sandbox builds do not depend on Google Fonts network access.
- [ ] Review npm audit findings separately; do not use forced upgrades as incidental feature work.
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
- [x] Defined `PracticeSession`, structured `PracticeItem`, server-observed `PracticeHintReveal` and immutable `Attempt` contracts.
- [x] Implemented deterministic Foundation / Core / Application / Challenge `practice-v1` blueprint and code-owned structured problem/answer specs.
- [x] Built trusted objective-aligned PracticePreparationContext from DailyLesson, curriculum facts and Evidence-derived learning state.
- [x] Implemented deterministic grading and replay-safe Attempt → `EvidenceRecord` projection with no mutable Mastery write path.
- [x] Preserved append-only hint and linear retry provenance with stable Evidence IDs.
- [x] Added P2/P3 E2E and memory + Neon PracticeRepository persistence.
- [x] Generated `0001_fantastic_shocker.sql`; no real database migration was executed during implementation.

### Phase 5: Homework Vision
- [x] Defined trusted JPEG/PNG/WebP homework-image intake, 10 MiB limit and non-durable raw-image retention boundary.
- [x] Implemented extraction contracts with confidence and normalized source-region provenance.
- [x] Implemented `homework-confidence-v1` and append-only Student/Parent confirmation.
- [x] Implemented deterministic P2/P3 mathematical conversion and conservative objective mapping before grading/Evidence.
- [x] Generalized the canonical Attempt ledger to `PRACTICE | HOMEWORK`; unsupported/ambiguous work fails closed.
- [x] Added memory + Neon homework persistence and `0002_gorgeous_obadiah_stane.sql` with no raw-image storage.
- [x] Added P2/P3 homework E2E, deduplication and replay repair.

### Phase 6: Correction + Mistake Book
- [x] Implemented projected `Mistake` lifecycle `OBSERVED → CONFIRMED → CORRECTING → RESOLVED` over immutable episode facts/events.
- [x] Implemented automatic post-Attempt observation, deterministic/constrained diagnosis and Student/Parent confirmation for uncertain AI candidates.
- [x] Implemented guided correction through canonical CORRECTION Attempts, deterministic grading, structured independent reasoning and deterministic isomorphic transfer.
- [x] Preserved one canonical Attempt ledger and append-only Evidence history; failed correction retries do not duplicate `incorrect` Evidence.
- [x] Implemented recurrence-safe episode isolation, misconception aggregation, Student/Parent projections and replay repair.
- [x] Added memory + Neon correction persistence and generated `0003_stale_mercury.sql`; no production migration was executed.
- [x] Exact canonical Host verification passed on merge SHA `a0b0c0aa37c882b2c8fd9850a76327f3068b487f`: 311 tests passed / 6 skipped, typecheck passed, curriculum valid (25 nodes / 68 objectives / 18 mappings), lint passed and Next.js production build passed.
- [x] PR #6 merged; Phase 7 is now the next roadmap phase.
