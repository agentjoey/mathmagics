import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './lib/persistence/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://unused:unused@localhost:5432/unused',
  },
  strict: true,
  verbose: true,
});
