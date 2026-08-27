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

After the Phase 8 full-loop Neon contract exists, run the fixed pilot contract whitelist:

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

`tests/pilot-neon-full-loop.test.ts` is introduced later in the approved Phase 8 implementation sequence. Until it exists, the harness is prepared but the final six-suite pilot verification gate is intentionally incomplete rather than silently weakened.

Only after the complete non-production migration and six-suite verification evidence passes may the separate Production migration/deployment Human Gate be requested.

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
