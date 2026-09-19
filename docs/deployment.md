# Deployment

## V1 Architecture

MathMagics V1 is a single Next.js 16 application deployed to Vercel with durable application state in Neon PostgreSQL.

- Vercel Functions region: `sin1` (Singapore), locked by `vercel.json`.
- Neon production database: Singapore.
- Persistence: Drizzle ORM + `@neondatabase/serverless` using Neon HTTP.
- Curriculum truth remains version-controlled JSON in the application bundle; it is not copied into Neon.
- Mastery, readiness, `LearningPosition`, and execution status remain derived projections, not mutable database facts.

## Environment Separation

Vercel Preview and Production must use different Neon credentials/databases or branches.

Production environment variables:

- `MINIMAX_API_KEY`
- `SITE_PASSWORD`
- `SESSION_SECRET`
- `DATABASE_URL` pointing only to the production Neon database

Development/integration testing may additionally define:

- `TEST_DATABASE_URL` pointing only to a disposable/non-production Neon database

`tests/persistence-neon-contract.test.ts` never falls back from `TEST_DATABASE_URL` to `DATABASE_URL`.

## Database Migrations

Schema source: `lib/persistence/schema.ts`.

Generate SQL after a schema change:

```bash
npm run db:generate
```

Inspect and commit generated SQL before applying it. Production migration is an explicit release action:

```bash
DATABASE_URL='<production-neon-url>' npm run db:migrate
```

Rules:

- application startup does not auto-migrate;
- Preview deployments never migrate Production;
- do not hold a database transaction open while calling an AI provider;
- destructive production migrations require a separate Human Gate.

## Phase 8 Non-Production Pilot Activation

Before any production migration or pilot deployment, use a disposable/non-production Neon database or branch in Singapore. `TEST_DATABASE_URL` is mandatory and must be distinct from any configured production `DATABASE_URL`.

Apply the committed migration chain to non-production through the guarded runner:

```bash
TEST_DATABASE_URL='<non-production-neon-url>' npm run db:migrate:test
```

The migration runner validates `TEST_DATABASE_URL` first, then supplies that exact URL as the child `DATABASE_URL` required by Drizzle. It refuses to run when the test URL is missing or equals the production URL.

Run the fixed pilot contract whitelist:

```bash
TEST_DATABASE_URL='<non-production-neon-url>' npm run verify:pilot-neon
```

The verification child receives the validated `TEST_DATABASE_URL` and does not inherit `DATABASE_URL`. The fixed whitelist is:

- `tests/persistence-neon-contract.test.ts`
- `tests/persistence-neon-practice-contract.test.ts`
- `tests/persistence-neon-homework-contract.test.ts`
- `tests/persistence-neon-correction-contract.test.ts`
- `tests/persistence-neon-phase7-contract.test.ts`
- `tests/pilot-neon-full-loop.test.ts`

### Verified non-production state

Task 7 completed the approved non-production gate on 2026-08-28:

- isolated Neon testing branch in `ap-southeast-1` (Singapore);
- fresh-unmigrated RED observed before migration;
- committed migrations `0000` through `0004` applied only to the testing branch;
- `npm run verify:pilot-neon`: **6/6 files passed, 13/13 tests passed, zero integration skips**;
- full learning loop, PilotReview historical replay, adaptive SUPERSEDE and forward KEEP verified;
- test-owned rows cleaned without truncating shared tables.

This evidence authorizes requesting the separate Production Human Gate. It does **not** authorize production migration or deployment by itself.

### Production activation checklist

Production activation remains a Human Owner action. Before executing it, record or confirm all of the following without committing secrets:

1. exact pilot release SHA to be activated;
2. Production Neon is in Singapore and its `DATABASE_URL` is distinct from the tested non-production branch;
3. migration chain is still exactly `0000` through `0004`; no incidental `0005` exists;
4. candidate verification for the exact release SHA is current;
5. Human Owner explicitly approves Production migration/deployment;
6. apply the approved migration chain to Production;
7. deploy the exact approved SHA;
8. smoke-test auth, `/api/pilot/review`, `/api/learning/next`, student lesson flow and parent view;
9. record only environment/region, SHA, migration result and smoke result.

Do not run steps 6–9 without the explicit Production Human Gate.

## Vercel Deployment

1. `vercel link` on first setup.
2. Configure Preview environment variables with non-production Neon credentials.
3. Configure Production environment variables listed above with the production Neon credential.
4. Apply an approved production migration explicitly before a release that requires it.
5. Deploy with `vercel --prod` or the approved deployment pipeline.
6. Run production smoke verification.

## Local / Host Verification

```bash
npm run typecheck
npm run validate:curriculum
npm run build
```

When a disposable Neon test database has already been migrated:

```bash
TEST_DATABASE_URL='<test-neon-url>' npm test
```

The normal unit suite does not require network or database access.
