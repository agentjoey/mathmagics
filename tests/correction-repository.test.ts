import { describe, expect, it } from 'vitest';
import {
  MemoryMistakeRepository,
  type CorrectionItem,
  type CorrectionReasoningCheck,
  type Mistake,
  type MistakeAttemptLink,
  type MistakeEvent,
} from '@/lib/correction';

const now = '2026-08-25T12:00:00.000Z';
const mistake: Mistake = {
  id: 'm1', studentId: 's1', objectiveId: 'P2-MD-001', initialAttemptId: 'a1',
  initialDiagnosisTarget: { kind: 'GENERIC', code: 'UNKNOWN' },
  diagnosisPolicyVersion: 'mistake-diagnosis-v1', firstObservedAt: now, createdAt: now,
};
const link: MistakeAttemptLink = { mistakeId: 'm1', attemptId: 'a1', role: 'OBSERVATION', linkedAt: now };
const event: MistakeEvent = {
  id: 'e1', mistakeId: 'm1', type: 'MISTAKE_OBSERVED', payload: {}, actorKind: 'SYSTEM',
  policyVersion: 'mistake-lifecycle-v1', occurredAt: now,
};
const item: CorrectionItem = {
  id: 'ci1', mistakeId: 'm1', studentId: 's1', objectiveId: 'P2-MD-001', kind: 'ORIGINAL_RETRY',
  sourceAttemptId: 'a1', problemSpec: { kind: 'ARITHMETIC', operation: 'MULTIPLY', left: 2, right: 3 },
  answerSpec: { kind: 'INTEGER', value: '6' }, prompt: '2 × 3?', solutionOutline: ['2 × 3 = 6'],
  generator: 'correction-original', generatorVersion: '1', createdAt: now,
};
const reasoning: CorrectionReasoningCheck = {
  id: 'r1', mistakeId: 'm1', studentId: 's1', objectiveId: 'P2-MD-001',
  checkSpec: { id: 'spec1', kind: 'FIELDS', prompt: 'Identify quantities', fields: ['groups'], expected: { groups: '2' } },
  response: { groups: '2' }, outcome: 'PASS', assisted: false,
  policyVersion: 'correction-reasoning-v1', submittedAt: now, recordedAt: now,
};

describe('MemoryMistakeRepository', () => {
  it('stores append-only facts with stable reads and defensive clones', async () => {
    const repo = new MemoryMistakeRepository();
    await repo.appendMistake(mistake);
    await repo.appendAttemptLink(link);
    await repo.appendEvent(event);
    await repo.appendCorrectionItem(item);
    await repo.appendReasoningCheck(reasoning);

    expect(await repo.findMistake('m1')).toEqual(mistake);
    expect(await repo.listMistakesForStudentObjective('s1', 'P2-MD-001')).toEqual([mistake]);
    expect(await repo.listAttemptLinks('m1')).toEqual([link]);
    expect(await repo.listEvents('m1')).toEqual([event]);
    expect(await repo.listCorrectionItems('m1')).toEqual([item]);
    expect(await repo.listReasoningChecks('m1')).toEqual([reasoning]);

    const returned = await repo.findMistake('m1');
    if (!returned) throw new Error('fixture missing');
    returned.initialDiagnosisTarget = { kind: 'GENERIC', code: 'FACT_ERROR' };
    expect((await repo.findMistake('m1'))?.initialDiagnosisTarget).toEqual({ kind: 'GENERIC', code: 'UNKNOWN' });
  });

  it('allows exact replay where intended and rejects conflicting id reuse', async () => {
    const repo = new MemoryMistakeRepository();
    await repo.appendMistake(mistake);
    await expect(repo.appendMistake(structuredClone(mistake))).resolves.toBeUndefined();
    await expect(repo.appendMistake({ ...mistake, objectiveId: 'P2-MD-002' })).rejects.toThrow('conflicting mistake id reuse');

    await repo.appendEvent(event);
    await expect(repo.appendEvent(structuredClone(event))).resolves.toBeUndefined();
    await expect(repo.appendEvent({ ...event, type: 'CORRECTION_STARTED' })).rejects.toThrow('conflicting mistake event id reuse');
  });

  it('orders facts deterministically', async () => {
    const repo = new MemoryMistakeRepository();
    await repo.appendMistake(mistake);
    await repo.appendEvent(event);
    await repo.appendEvent({ ...event, id: 'e2', occurredAt: '2026-08-25T12:02:00.000Z' });
    await repo.appendEvent({ ...event, id: 'e0', occurredAt: '2026-08-25T12:01:00.000Z' });
    expect((await repo.listEvents('m1')).map((entry) => entry.id)).toEqual(['e1', 'e0', 'e2']);
  });
});
