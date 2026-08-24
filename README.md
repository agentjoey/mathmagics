# MathMagics

Singapore Math home-education AI learning system / teaching copilot for families.

Current V1 curriculum scope: Singapore Primary Mathematics P2/P3.

Core loop:

`Plan → Learn → Practice → Correct → Track → Adapt`

Current foundation includes curriculum truth, append-only learning evidence, derived mastery/readiness, deterministic teaching planning, parent/tutor lesson preparation, and Neon/PostgreSQL persistence adapters.

See [CLAUDE.md](CLAUDE.md), [Architecture](docs/architecture.md), and [Deployment](docs/deployment.md).

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
