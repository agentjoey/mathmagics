import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

export function createNeonDatabase(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) throw new Error('DATABASE_URL is not configured');
  const client = neon(databaseUrl);
  return drizzle({ client, schema });
}

export type MathMagicsDatabase = ReturnType<typeof createNeonDatabase>;
