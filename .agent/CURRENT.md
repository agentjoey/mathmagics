# Current Status — MathMagics

Updated: 2026-09-29
Product direction: user-approved curriculum-first learning product roadmap
Active milestone: A — product scope and complete lesson designs
Milestone state: A1–A3 drafted and checked; user-requested A4 geometry added for verification and consolidated design review. Not implemented or pilot-validated.
Baseline: `d5b475cb6501cadbc009169ee27fd6fda19056e8`

## Read first

- [Approved direction and new roadmap](../docs/superpowers/specs/2026-09-29-mathmagics-learning-product-roadmap.md)
- [Milestone A package](../docs/milestone-a/README.md)
- [Active backlog](BACKLOG.md)

The existing application is a learning-management/engine prototype with partial practice and correction, not a usable P2/P3 teaching product. Engineering completion and deployment readiness do not prove that children can learn from it. Lesson content and interactive teaching are core scope, not optional post-pilot expansion.

## Milestone A

Four original designs: A1 P2 count in tens/hundreds, A2 P2 equal groups/multiplication/division, A3 P3 two-step Bar Model, and the user-requested [A4 AMC Pre-A-target geometry](../docs/milestone-a/lessons/pre-a-geometry.md). Each includes teaching copy, examples, questions, answers, hints, error branches and recovery.

A4 is optional enrichment targeting the Australian AMC China Pre-A Years 1–2 level. Public organizer pages establish the division, not an exact geometry syllabus or empirically calibrated item difficulty. It is original, not official exam content. Geometry success/failure does not directly alter core curriculum Mastery. P2/P3 breadth remains unchanged.

Historical A1–A3 verification: 599 passed / 12 skipped; lint passed; 63 arithmetic equations and document integrity checked. A4 adds 15 geometric cases and separate geometry QA. Latest exact results belong to the corresponding commit/PR evidence, not those historical counts. See [acceptance](../docs/milestone-a/acceptance.md).

After consolidated review, prepare B's executable plan for a continuous P2 number-learning unit, lesson player, tutoring, saved progress and parent summary. A4 also informs later geometry content/renderer acceptance; it does not silently expand B or restart product positioning.

## Delivery boundary

A changes design documents, author-only geometry fixtures and design tests only. No app/runtime, authoritative curriculum data, grading policy, migration, secrets or production deployment is changed. New specifications do not silently authorize runtime policy changes.

The existing activation task `task-mathmagics-phase8-production-activation-20260920-001` / PR #28 remains separate. Approval exists; this task claims no merge/deploy/verify completion and does not bypass the reported GrandeGPT readiness issue.

PR #28 edits the former CURRENT.md. Reconcile valid activation evidence into this new status; do not restore the old product roadmap. This task does not merge, close or clean up historical tasks.

## Historical evidence

The former status and backlog remain verbatim in [historical current](history/2026-09-29-pre-milestone-a-current.md) and [historical backlog](history/2026-09-29-pre-milestone-a-backlog.md). Their dates/status labels are historical, not current product-readiness claims.
