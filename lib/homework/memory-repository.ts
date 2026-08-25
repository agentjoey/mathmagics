import type {
  HomeworkConfirmation,
  HomeworkProblemExtraction,
  HomeworkSubmission,
} from './types';
import type { HomeworkRepository } from './repository';
import {
  assertValidHomeworkConfirmationForProblem,
  assertValidHomeworkSubmissionBundle,
} from './repository';

function clone<T>(value: T): T {
  return structuredClone(value);
}

function submissionCoordinateKey(studentId: string, sha256: string): string {
  return JSON.stringify([studentId, sha256]);
}

export class MemoryHomeworkRepository implements HomeworkRepository {
  private readonly submissions = new Map<string, HomeworkSubmission>();
  private readonly submissionByCoordinates = new Map<string, string>();
  private readonly problems = new Map<string, HomeworkProblemExtraction>();
  private readonly confirmations = new Map<string, HomeworkConfirmation>();

  async getSubmission(id: string): Promise<HomeworkSubmission | undefined> {
    const submission = this.submissions.get(id);
    return submission ? clone(submission) : undefined;
  }

  async findSubmissionByStudentAndHash(studentId: string, sha256: string): Promise<HomeworkSubmission | undefined> {
    const id = this.submissionByCoordinates.get(submissionCoordinateKey(studentId, sha256));
    return id ? this.getSubmission(id) : undefined;
  }

  async createSubmission(submission: HomeworkSubmission, problems: HomeworkProblemExtraction[]): Promise<void> {
    if (this.submissions.has(submission.id)) throw new Error('homework submission id already exists');
    if (this.submissionByCoordinates.has(submissionCoordinateKey(submission.studentId, submission.sourceSha256))) {
      throw new Error('homework submission already exists for student and source hash');
    }

    assertValidHomeworkSubmissionBundle(submission, problems);
    for (const problem of problems) {
      if (this.problems.has(problem.id)) throw new Error('homework problem id must be unique');
    }

    this.submissions.set(submission.id, clone(submission));
    this.submissionByCoordinates.set(
      submissionCoordinateKey(submission.studentId, submission.sourceSha256),
      submission.id,
    );
    for (const problem of problems) this.problems.set(problem.id, clone(problem));
  }

  async getProblem(id: string): Promise<HomeworkProblemExtraction | undefined> {
    const problem = this.problems.get(id);
    return problem ? clone(problem) : undefined;
  }

  async listProblems(submissionId: string): Promise<HomeworkProblemExtraction[]> {
    return [...this.problems.values()]
      .filter((problem) => problem.submissionId === submissionId)
      .sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id))
      .map(clone);
  }

  async appendConfirmation(confirmation: HomeworkConfirmation): Promise<void> {
    if (this.confirmations.has(confirmation.id)) throw new Error('homework confirmation id already exists');
    const problem = this.problems.get(confirmation.problemId);
    if (!problem) throw new Error(`Unknown homework problem id: ${confirmation.problemId}`);
    assertValidHomeworkConfirmationForProblem(problem, confirmation);
    this.confirmations.set(confirmation.id, clone(confirmation));
  }

  async listConfirmations(problemId: string): Promise<HomeworkConfirmation[]> {
    return [...this.confirmations.values()]
      .filter((confirmation) => confirmation.problemId === problemId)
      .sort((left, right) => (
        Date.parse(left.confirmedAt) - Date.parse(right.confirmedAt)
        || left.id.localeCompare(right.id)
      ))
      .map(clone);
  }
}
