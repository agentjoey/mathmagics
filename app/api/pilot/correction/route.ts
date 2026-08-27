import { NextRequest } from 'next/server';
import { createPilotSessionRuntime } from '@/lib/pilot/runtime';
import { createPilotCorrectionGetHandler, createPilotCorrectionPostHandler } from './handler';

export const runtime = 'nodejs';

function dependencies() {
  const services = createPilotSessionRuntime();
  return {
    sessionSecret: () => process.env.SESSION_SECRET,
    now: services.clock.now,
    studentExists: async (studentId: string) => (await services.learning.getStudent(studentId)) !== undefined,
    listOpenMistakes: (studentId: string) => services.pilotHomeworkCorrection.listOpenMistakes(studentId),
    getMistake: (studentId: string, mistakeId: string) => services.pilotHomeworkCorrection.getMistake(studentId, mistakeId),
    proposeDiagnosis: (studentId: string, mistakeId: string, at: string) => services.pilotHomeworkCorrection.proposeDiagnosis(studentId, mistakeId, at),
    confirmDiagnosis: (studentId: string, input: Parameters<typeof services.pilotHomeworkCorrection.confirmDiagnosis>[1], at: string) => services.pilotHomeworkCorrection.confirmDiagnosis(studentId, input, at),
    startCorrection: (studentId: string, mistakeId: string, at: string) => services.pilotHomeworkCorrection.startCorrection(studentId, mistakeId, at),
    submitCorrectionRetry: (studentId: string, input: Parameters<typeof services.pilotHomeworkCorrection.submitCorrectionRetry>[1], at: string) => services.pilotHomeworkCorrection.submitCorrectionRetry(studentId, input, at),
    revealReasoningHelp: (studentId: string, mistakeId: string, checkId: string, at: string) => services.pilotHomeworkCorrection.revealReasoningHelp(studentId, mistakeId, checkId, at),
    submitReasoningCheck: (studentId: string, input: Parameters<typeof services.pilotHomeworkCorrection.submitReasoningCheck>[1], at: string) => services.pilotHomeworkCorrection.submitReasoningCheck(studentId, input, at),
    prepareTransfer: (studentId: string, mistakeId: string, at: string) => services.pilotHomeworkCorrection.prepareTransfer(studentId, mistakeId, at),
    submitTransferAttempt: (studentId: string, input: Parameters<typeof services.pilotHomeworkCorrection.submitTransferAttempt>[1], at: string) => services.pilotHomeworkCorrection.submitTransferAttempt(studentId, input, at),
  };
}

export async function GET(req: NextRequest) {
  return createPilotCorrectionGetHandler(dependencies())(req);
}

export async function POST(req: NextRequest) {
  return createPilotCorrectionPostHandler(dependencies())(req);
}
