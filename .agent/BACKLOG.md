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
- [x] Complete the P8-0 exact-HEAD release gate on repaired canonical release candidate `2bb70584ca189b43015a3cd2736b6262a8b2e78a`: `npm test` (including exact `npm run typecheck` and `npm run validate:curriculum` release-contract checks), `npm run lint`, and `npm run build` all passed in a fresh GrandeGPT worktree. The original Phase 7 merge SHA `61fb3e16485d645692c69a527db2d1f2ba36fa96` is not retroactively relabeled as verified; release-blocking defects were repaired by PR #9 and PR #10 before this closure.

## 🟡 MED — Approved Roadmap

### Phase 8: Family Pilot
- [ ] Run a multi-week household pilot using the existing P2/P3 curriculum.
- [ ] Validate that the system can reliably answer what was learned, mastered, recently unstable, still needs correction, and should be taught next.
- [ ] Validate real-family comprehension of adaptive lesson changes and deterministic rationale.
- [ ] Collect product evidence before expanding curriculum breadth, multi-household identity or analytics/reporting scope.

## 🟢 LOW / Technical Debt / Activation Gates

- [ ] Before first production durable-data deployment, confirm a separated Production Neon database in Singapore and verify its URL is distinct from the tested non-production branch.
- [x] Apply committed `0000`–`0004` Drizzle migrations against an isolated Singapore non-production Neon branch and pass the fixed learning/planning, practice, homework, correction, strategy/adaptive and full-loop Neon contract gate with explicit `TEST_DATABASE_URL`: 6/6 files, 13/13 tests, zero skips on 2026-08-28.
- [x] Remove live-pilot read-path N+1 blockers discovered by the Task 7 Neon gate: ParentProgress/PilotReview now share request-scoped facts and forward adaptive evaluation uses one batched progress projection plus one cutoff-scoped risk snapshot.
- [ ] Production migration/deployment remains an explicit Human Gate. Apply `0000`–`0004`, deploy the exact approved SHA, and smoke-test only after explicit Human Owner approval.
- [ ] Decide whether to retain source homework images only when durable image review/history becomes a real product requirement; Phase 5 deliberately stores structured provenance only.
- [x] Remove the unused `next/font/google` Geist dependency and keep local/system font tokens so sandbox and production builds do not require Google Fonts network access.
- [ ] Review npm audit findings separately; current toolchain install reports 13 findings (1 low, 4 moderate, 8 high). Do not use forced upgrades as incidental feature work.
- [ ] Add first-class GrandeGPT MathMagics profiles/capabilities for standalone curriculum validation and Drizzle migration generation. Exact `typecheck` and `validate:curriculum` are already enforced by `tests/release-gate-scripts.test.ts` inside the controlled `test` profile; this item is operational convenience, not a release blocker.
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

### Phase 7: Progress + Adaptive Learning Loop
- Coverage/Mastery/Performance/Strategy remain separate deterministic projections with no aggregate learning score.
- Server-observed StrategyInteraction/StrategyEvidence and cross-topic Strategy progress implemented.
- Deterministic MistakePriority, candidate ordering, starvation guard and lesson-boundary adaptation implemented.
- Adaptive decisions and lesson supersessions are append-only and replayable; STARTED lessons and replacement lessons are immutable.
- Minimal Parent/Tutor Progress View, Student next-lesson view and authenticated API contracts implemented.
- Full-loop E2E and service-level starvation E2E implemented.
- Phase 7 adds exactly four durable fact tables through `0004_strange_meteorite.sql`; migration generated/reviewed but not applied to production.
- P8-0 release closure completed on repaired canonical candidate `2bb70584ca189b43015a3cd2736b6262a8b2e78a` after PR #9/#10 fixed the build and release-gate execution blockers discovered after the original Phase 7 merge.
