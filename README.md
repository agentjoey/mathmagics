# MathMagics

Singapore Math learning for families, initially P2/P3: actual lessons, interactive representations, contextual tutoring, meaningful practice and correction, with parent support.

## Current product work

The existing app is an engineering prototype, not a complete child-ready course. The user approved a curriculum-first product reset on 2026-09-29, then requested AMC Pre-A-target geometry in the lesson-design package.

- [Product scope and roadmap](docs/superpowers/specs/2026-09-29-mathmagics-learning-product-roadmap.md)
- [Milestone A: four complete lesson designs](docs/milestone-a/README.md)
- [A4: geometry enrichment](docs/milestone-a/lessons/pre-a-geometry.md)
- [Current status](.agent/CURRENT.md) and [backlog](.agent/BACKLOG.md)

A contains design specifications, not a deployed classroom or full P2/P3 coverage. Existing evidence, grading and persistence are reusable assets; legacy phase completion is not a teaching-quality claim. A4 targets the Australian AMC China Pre-A age band; its original item difficulty still needs official-sample calibration, and it is not official exam content.

See [CLAUDE.md](CLAUDE.md), [existing architecture](docs/architecture.md), and [deployment](docs/deployment.md) for current implementation and operating constraints.

## Development

```bash
npm ci
npm run dev
npm test
npm run typecheck
npm run validate:curriculum
npm run lint
npm run build
```

Secrets are never committed. Local secrets are loaded through the existing macOS Keychain workflow; deployed secrets are configured in Vercel environment variables.
