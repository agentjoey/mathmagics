import { and, asc, eq } from 'drizzle-orm';
import type {
  HomeworkConfirmation,
  HomeworkProblemExtraction,
  HomeworkRepository,
  HomeworkSubmission,
} from '@/lib/homework';
import {
  assertValidHomeworkConfirmationForProblem,
  assertValidHomeworkSubmissionBundle,
  validateHomeworkVisionResult,
} from '@/lib/homework';
import { createNeonDatabase } from './db';
import type { MathMagicsDatabase } from './db';
import { canonicalInstant } from './instant';
import {
  homeworkConfirmations,
  homeworkProblems,
  homeworkSubmissions,
} from './schema';

function toSubmission(row: typeof homeworkSubmissions.$inferSelect): HomeworkSubmission {
  return {
    id: row.id,
    studentId: row.studentId,
    sourceSha256: row.sourceSha256,
    mimeType: row.mimeType as HomeworkSubmission['mimeType'],
    byteLength: row.byteLength,
    provider: row.provider,
    model: row.model,
    schemaVersion: row.schemaVersion as HomeworkSubmission['schemaVersion'],
    createdAt: canonicalInstant(row.createdAt),
  };
}

function toProblem(row: typeof homeworkProblems.$inferSelect): HomeworkProblemExtraction {
  const problem = structuredClone(row.extraction as HomeworkProblemExtraction);
  problem.createdAt = canonicalInstant(problem.createdAt);
  if (
    problem.id !== row.id
    || problem.submissionId !== row.submissionId
    || problem.studentId !== row.studentId
    || problem.sequence !== row.sequence
    || problem.createdAt !== canonicalInstant(row.createdAt)
  ) {
    throw new Error('persisted homework problem coordinates disagree with extraction');
  }
  if (row.trustPolicyVersion !== 'homework-confidence-v1') {
    throw new Error('persisted homework problem trust policy is unsupported');
  }
  validateHomeworkVisionResult({
    submissionId: problem.submissionId,
    studentId: problem.studentId,
    provider: problem.provider,
    model: problem.model,
    schemaVersion: problem.schemaVersion,
    problems: [problem],
  });
  return problem;
}

function toConfirmation(row: typeof homeworkConfirmations.$inferSelect): HomeworkConfirmation {
  return {
    id: row.id,
    problemId: row.problemId,
    studentId: row.studentId,
    corrections: structuredClone(row.corrections),
    confirmerRole: row.confirmerRole as HomeworkConfirmation['confirmerRole'],
    policyVersion: row.policyVersion as HomeworkConfirmation['policyVersion'],
    confirmedAt: canonicalInstant(row.confirmedAt),
  };
}

export class NeonHomeworkRepository implements HomeworkRepository {
  constructor(private readonly db: MathMagicsDatabase = createNeonDatabase()) {}

  async getSubmission(id: string): Promise<HomeworkSubmission | undefined> {
    const [row] = await this.db.select().from(homeworkSubmissions)
      .where(eq(homeworkSubmissions.id, id)).limit(1);
    return row ? toSubmission(row) : undefined;
  }

  async findSubmissionByStudentAndHash(studentId: string, sha256: string): Promise<HomeworkSubmission | undefined> {
    const [row] = await this.db.select().from(homeworkSubmissions)
      .where(and(
        eq(homeworkSubmissions.studentId, studentId),
        eq(homeworkSubmissions.sourceSha256, sha256),
      )).limit(1);
    return row ? toSubmission(row) : undefined;
  }

  async createSubmission(submission: HomeworkSubmission, problems: HomeworkProblemExtraction[]): Promise<void> {
    const [sameId] = await this.db.select({ id: homeworkSubmissions.id }).from(homeworkSubmissions)
      .where(eq(homeworkSubmissions.id, submission.id)).limit(1);
    if (sameId) throw new Error('homework submission id already exists');
    if (await this.findSubmissionByStudentAndHash(submission.studentId, submission.sourceSha256)) {
      throw new Error('homework submission already exists for student and source hash');
    }

    assertValidHomeworkSubmissionBundle(submission, problems);
    for (const problem of problems) {
      const [existing] = await this.db.select({ id: homeworkProblems.id }).from(homeworkProblems)
        .where(eq(homeworkProblems.id, problem.id)).limit(1);
      if (existing) throw new Error('homework problem id must be unique');
    }

    const submissionInsert = this.db.insert(homeworkSubmissions).values({
      id: submission.id,
      studentId: submission.studentId,
      sourceSha256: submission.sourceSha256,
      mimeType: submission.mimeType,
      byteLength: submission.byteLength,
      provider: submission.provider,
      model: submission.model,
      schemaVersion: submission.schemaVersion,
      createdAt: submission.createdAt,
    });
    const problemInsert = this.db.insert(homeworkProblems).values(problems.map((problem) => ({
      id: problem.id,
      submissionId: problem.submissionId,
      studentId: problem.studentId,
      sequence: problem.sequence,
      extraction: structuredClone(problem),
      trustPolicyVersion: 'homework-confidence-v1',
      createdAt: problem.createdAt,
    })));
    await this.db.batch([submissionInsert, problemInsert]);
  }

  async getProblem(id: string): Promise<HomeworkProblemExtraction | undefined> {
    const [row] = await this.db.select().from(homeworkProblems)
      .where(eq(homeworkProblems.id, id)).limit(1);
    return row ? toProblem(row) : undefined;
  }

  async listProblems(submissionId: string): Promise<HomeworkProblemExtraction[]> {
    const rows = await this.db.select().from(homeworkProblems)
      .where(eq(homeworkProblems.submissionId, submissionId))
      .orderBy(asc(homeworkProblems.sequence), asc(homeworkProblems.id));
    return rows.map(toProblem);
  }

  async appendConfirmation(confirmation: HomeworkConfirmation): Promise<void> {
    const [sameId] = await this.db.select({ id: homeworkConfirmations.id }).from(homeworkConfirmations)
      .where(eq(homeworkConfirmations.id, confirmation.id)).limit(1);
    if (sameId) throw new Error('homework confirmation id already exists');
    const problem = await this.getProblem(confirmation.problemId);
    if (!problem) throw new Error(`Unknown homework problem id: ${confirmation.problemId}`);
    assertValidHomeworkConfirmationForProblem(problem, confirmation);
    await this.db.insert(homeworkConfirmations).values({
      id: confirmation.id,
      problemId: confirmation.problemId,
      studentId: confirmation.studentId,
      corrections: structuredClone(confirmation.corrections),
      confirmerRole: confirmation.confirmerRole,
      policyVersion: confirmation.policyVersion,
      confirmedAt: confirmation.confirmedAt,
    });
  }

  async listConfirmations(problemId: string): Promise<HomeworkConfirmation[]> {
    const rows = await this.db.select().from(homeworkConfirmations)
      .where(eq(homeworkConfirmations.problemId, problemId))
      .orderBy(asc(homeworkConfirmations.confirmedAt), asc(homeworkConfirmations.id));
    return rows.map(toConfirmation);
  }
}
