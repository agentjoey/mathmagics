# Current Status — MathMagics

Version:        v0.2.0-dev
Phase:          Phase 1 — Curriculum Foundation
Phase Status:   ✅ Completed
Last Updated:   2026-08-24 by agent

## Product Positioning
MathMagics is a Singapore Math home-education AI learning system / teaching copilot for families.

Primary users:
- Parent / Tutor
- Student

Initial curriculum scope:
- Singapore Primary Mathematics
- Primary 2 and Primary 3

Core learning loop:

`Plan → Learn → Practice → Correct → Track → Adapt`

The system learning model is authoritative. AI explains, analyzes, generates and recommends; AI does not own curriculum truth, history or mastery state.

## Phase 1 — Curriculum Foundation

**Completed:**
- ✅ Product reset design and Curriculum Foundation design approved.
- ✅ Curriculum Truth separated from textbook mapping and MathMagics-curated teaching knowledge.
- ✅ MOE 2021 Primary Mathematics syllabus established as curriculum truth source.
- ✅ Primary Mathematics 2022 Edition established as edition-specific textbook mapping source.
- ✅ Private textbook/source boundary established under ignored `content-private/`.
- ✅ P2/P3 curriculum graph established with stable nodes and LearningObjective IDs.
- ✅ Breadth inventory: 68 objectives total (P2=32, P3=36), 25 curriculum nodes.
- ✅ Three deep slices completed:
  - P2 Multiplication & Division
  - P3 Fractions
  - P2/P3 Word Problems + Bar Model
- ✅ Teaching knowledge model includes prerequisite edges, CPA representations, strategies, misconceptions, readiness evidence and mastery evidence.
- ✅ Textbook mapping supports `DIRECT`, `SUPPORTING` and `EXTENSION` relationships; 18 mappings currently loaded.
- ✅ Deterministic curriculum loader, validator and query API implemented.
- ✅ Validator prevents textbook sources from being used directly as LearningObjective curriculum provenance.
- ✅ Legacy Q05/Q18 experience preserved as teaching-engine fixtures, not current product scope.

## Verification — 2026-08-24

Local worktree acceptance:
- ✅ `npm test`: 24 passed, 1 provider smoke test skipped
- ✅ `npm run typecheck`
- ✅ `npm run validate:curriculum`: 25 nodes, 68 objectives (P2=32, P3=36), 18 textbook mappings
- ✅ `npm run lint`
- ✅ `npm run build` (Next.js 16.2.6 production build)

GrandeGPT controlled verification:
- ✅ test profile: 24 passed, 1 skipped
- ✅ lint profile
- ⚠ build profile is network-constrained by `next/font` Google Fonts fetch; the same production build passes on the host. This is an environment limitation, not a curriculum implementation failure.

## Next Phase

**Phase 2 — Student & Mastery Model**

Primary scope:
- Student entity/profile
- `Student × LearningObjective → Mastery`
- mastery states: `NOT_STARTED`, `INTRODUCED`, `DEVELOPING`, `MASTERED`
- Evidence model and deterministic mastery transition policy
- Attempt vs Mistake separation
- curriculum query integration as the knowledge-source boundary

Explicitly defer OCR/photo homework, full practice generation, UI redesign and adaptive planner until their roadmap phases.

## Known Non-blocking Technical Debt
- Next.js warns that the `middleware` convention is deprecated in favor of `proxy`.
- Provider smoke test remains skipped because it requires external provider credentials/network.
