# Product Backlog — MathMagics

> Current product direction: Singapore Math home-education AI learning system / teaching copilot. Legacy Q05/Q18 MVP work is frozen unless needed as teaching-engine fixtures.

## 🔴 HIGH — Verification / Merge Gate

### Phase 7: Progress + Adaptive Learning Loop
- [x] Separate Curriculum Coverage, Knowledge Mastery, Practice Performance and Strategy progress.
- [x] Track cross-topic problem-solving strategy use from server-observed structured interactions.
- [x] Implement prerequisite-aware deterministic Next Best Lesson policy.
- [x] Add controlled lesson supersession with immutable `AdaptiveDecision + DailyLesson + LessonSupersession` facts.
- [x] Add starvation guard and blocking override policy.
- [x] Add minimal Parent/Tutor Progress View and thin Student next-lesson view.
- [x] Add authenticated progress/next/evaluate API contracts with server-owned authority.
- [x] Generate and review `0004_strange_meteorite.sql` for exactly four Phase 7 durable fact tables.
- [ ] Complete exact-HEAD Host verification (`npm test`, `npm run typecheck`, `npm run validate:curriculum`, `npm run lint`, `npm run build`) and then PR/merge closeout.

## 🟡 MED — Approved Roadmap

### Phase 8: Family Pilot
- [ ] Run a multi-week household pilot using the existing P2/P3 curriculum.
- [ ] Validate that the system can reliably answer what was learned, mastered, recently unstable, still needs correction, and should be taught next.
- [ ] Validate real-family comprehension of adaptive lesson changes and deterministic rationale.
- [ ] Collect product evidence before expanding curriculum breadth, multi-household identity or analytics/reporting scope.

## 🟢 LOW / Technical Debt / Activation Gates

- [ ] Before first durable-data deployment, provision separated Neon development/Preview and production databases in Singapore.
- [ ] Apply committed `0000`–`0004` Drizzle migrations against non-production first and pass learning/planning, practice, homework, correction, strategy and adaptive Neon contract suites with explicit `TEST_DATABASE_URL` before production promotion.
- [ ] Decide whether to retain source homework images only when durable image review/history becomes a real product requirement; Phase 5 deliberately stores structured provenance only.
- [x] Remove the unused `next/font/google` Geist dependency and keep local/system font tokens so sandbox and production builds do not require Google Fonts network access.
- [ ] Review npm audit findings separately; current toolchain install reports 13 findings (1 low, 4 moderate, 8 high). Do not use forced upgrades as incidental feature work.
- [ ] Add first-class GrandeGPT MathMagics profiles/capabilities for exact typecheck, curriculum validation and Drizzle migration generation so these no longer require Host fallback.
- [ ] Introduce multi-household User/Household/Membership identity only when the product leaves the single-household V1 boundary.

## ❄️ Frozen Legacy MVP Work

- [ ] Q05 prompt iteration and Q18 A/B tuning only if needed to improve the reusable Socratic/Feynman teaching engine.
- [ ] Old standalone Vercel MVP release is no longer a product milestone.
- [ ] Magic Canvas, full Math Kangaroo bank, generic voice/PWA expansion remain outside current roadmap unless re-approved.

## ✅ Completed

### Phase 0: Product Reset
- Product positioning, users, learning loop, AI boundary, V1 scope and non-goals approved.

### Phase 1: Curriculum Foundation
- P2/P3 curriculum breadth and three teaching-knowledge deep slices established.
- Curriculum provenance, prerequisite graph, CPA/strategy/misconception data and textbook mappings established.
- Deterministic loader, validator and curriculum query API implemented and verified.

### Phase 2: Student & Mastery Core
- Student profile/current position, append-only Evidence, deterministic Mastery/Readiness and replay-safe repositories implemented.
- No mutable Mastery/Readiness persistence path exists.

### Phase 3: Teaching Planner / Lesson Prep
- Deterministic learning position/candidates, immutable WeeklyPlan/DailyLesson and append-only execution history implemented.
- Trusted lesson-preparation context, signed household auth and Neon/Drizzle foundation implemented.
- Merged as PR #3.

### Phase 4: Practice / Attempt Core
- Code-owned structured practice/answer truth, deterministic grading, hint provenance, canonical immutable Attempt and Evidence projection implemented.
- Memory + Neon persistence and `0001_fantastic_shocker.sql` completed.
- Merged as PR #4.

### Phase 5: Homework Vision
- Observation-only homework vision, confidence/human confirmation, deterministic reconstruction/objective mapping and HOMEWORK Attempt integration implemented.
- Memory + Neon persistence and `0002_gorgeous_obadiah_stane.sql` completed.
- Merged as PR #5.

### Phase 6: Correction + Mistake Book
- Immutable Mistake episode ledger, constrained diagnosis, Socratic correction, structured reasoning, deterministic transfer and hard-fact resolution implemented.
- Canonical Attempt generalized to `PRACTICE | HOMEWORK | CORRECTION`.
- Recurrence tracking, Student/Parent projections, Memory + Neon persistence and `0003_stale_mercury.sql` completed.
- Merged as PR #6 and post-merge canonical Host verification passed.

### Phase 7 implementation
- Coverage/Mastery/Performance/Strategy remain separate deterministic projections with no aggregate learning score.
- Server-observed StrategyInteraction/StrategyEvidence and cross-topic Strategy progress implemented.
- Deterministic MistakePriority, candidate ordering, starvation guard and lesson-boundary adaptation implemented.
- Adaptive decisions and lesson supersessions are append-only and replayable; STARTED lessons and replacement lessons are immutable.
- Minimal Parent/Tutor Progress View, Student next-lesson view and authenticated API contracts implemented.
- Full-loop E2E and service-level starvation E2E implemented.
- Phase 7 adds exactly four durable fact tables through `0004_strange_meteorite.sql`; migration generated/reviewed but not applied to production.
