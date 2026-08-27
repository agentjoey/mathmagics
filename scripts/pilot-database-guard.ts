export interface PilotDatabaseEnvironment {
  TEST_DATABASE_URL?: string;
  DATABASE_URL?: string;
}

export function requireNonProductionDatabase(env: PilotDatabaseEnvironment): string {
  const testUrl = env.TEST_DATABASE_URL?.trim();
  if (!testUrl) throw new Error('TEST_DATABASE_URL is required');

  const productionUrl = env.DATABASE_URL?.trim();
  if (productionUrl && productionUrl === testUrl) {
    throw new Error('TEST_DATABASE_URL must not equal DATABASE_URL');
  }

  return testUrl;
}
