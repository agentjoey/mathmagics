import { describe, expect, it } from 'vitest';
import { createNeonDatabase } from '@/lib/persistence/db';
import { NeonHomeworkRepository } from '@/lib/persistence/neon-homework-repository';

const describeLive = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describeLive('NeonHomeworkRepository live contract', () => {
  it('constructs only from explicit TEST_DATABASE_URL and exposes the homework repository surface', () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required');
    const repository = new NeonHomeworkRepository(createNeonDatabase(databaseUrl));
    expect(repository.createSubmission).toBeTypeOf('function');
    expect(repository.getProblem).toBeTypeOf('function');
    expect(repository.appendConfirmation).toBeTypeOf('function');
  });
});
