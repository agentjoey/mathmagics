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
