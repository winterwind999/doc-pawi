import { ZodError } from 'zod';

import { validateToolCall } from '@/lib/ai/agent-tools';
import { insertProposal, getProposal } from '@/lib/db/repositories/proposals';
import { listRecords } from '@/lib/db/repositories/records';
import { listTreatmentsWithEvents } from '@/lib/db/repositories/treatments';
import { confirmProposal, ProposalAlreadyResolvedError, rejectProposal } from '@/lib/services/proposal-service';

import { openTestDbWithProfile, PROFILE_ID } from './helpers/node-db';

async function proposeFromTool(db: Awaited<ReturnType<typeof openTestDbWithProfile>>, name: string, args: object) {
  const outcome = validateToolCall({ name, arguments: JSON.stringify(args) }, '2026-10-09');
  if (!outcome.ok) throw new Error(outcome.error);
  return insertProposal(db, { profileId: PROFILE_ID, origin: 'chat', proposalType: outcome.payload.kind, payload: outcome.payload });
}

describe('AI proposals require explicit confirmation', () => {
  it('does not create a record while pending, and creates exactly one on confirm', async () => {
    const db = await openTestDbWithProfile();
    const proposal = await proposeFromTool(db, 'propose_medical_record', {
      category: 'visit',
      title: 'Dental check-up',
      event_date: '2026-10-08',
      summary: 'Cleaning at the dentist',
    });
    expect(await listRecords(db, PROFILE_ID)).toHaveLength(0);

    const result = await confirmProposal(db, { profileId: PROFILE_ID, proposalId: proposal.id });
    const records = await listRecords(db, PROFILE_ID);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ id: result.id, title: 'Dental check-up', source_type: 'ai_chat' });
    expect((await getProposal(db, proposal.id))?.status).toBe('confirmed');

    await expect(confirmProposal(db, { profileId: PROFILE_ID, proposalId: proposal.id })).rejects.toBeInstanceOf(ProposalAlreadyResolvedError);
    expect(await listRecords(db, PROFILE_ID)).toHaveLength(1);
  });

  it('creates nothing when rejected', async () => {
    const db = await openTestDbWithProfile();
    const proposal = await proposeFromTool(db, 'propose_medical_record', { category: 'allergy', title: 'Peanut allergy' });
    await rejectProposal(db, proposal.id);
    expect(await listRecords(db, PROFILE_ID)).toHaveLength(0);
    expect((await getProposal(db, proposal.id))?.status).toBe('rejected');
  });

  it('validates user edits and writes nothing when they are invalid', async () => {
    const db = await openTestDbWithProfile();
    const proposal = await proposeFromTool(db, 'propose_medical_record', { category: 'visit', title: 'Check-up' });
    const edited = {
      kind: 'medical_record',
      record: { category: 'visit', title: '', event_date: '2026-02-30', summary: null, facility: null, structured_data: {} },
      unverified_fields: [],
      warnings: [],
    };
    await expect(confirmProposal(db, { profileId: PROFILE_ID, proposalId: proposal.id, editedPayload: edited })).rejects.toBeInstanceOf(ZodError);
    expect(await listRecords(db, PROFILE_ID)).toHaveLength(0);
    expect((await getProposal(db, proposal.id))?.status).toBe('pending');
  });

  it('creates a vaccine series for a new treatment event and reuses it for the next dose', async () => {
    const db = await openTestDbWithProfile();
    const first = await proposeFromTool(db, 'propose_treatment_event', {
      treatment_name: 'Hepatitis B vaccine series',
      treatment_type: 'vaccination',
      event_title: 'Hepatitis B vaccine – dose 1',
      status: 'completed',
      date: '2026-09-01',
    });
    await confirmProposal(db, { profileId: PROFILE_ID, proposalId: first.id });
    const second = await proposeFromTool(db, 'propose_treatment_event', {
      treatment_name: 'hepatitis b vaccine series',
      treatment_type: 'vaccination',
      event_title: 'Hepatitis B vaccine – dose 2',
      status: 'completed',
      date: '2026-10-08',
    });
    const result = await confirmProposal(db, { profileId: PROFILE_ID, proposalId: second.id });
    expect(result.type === 'treatment_event' && result.createdTreatment).toBe(false);
    const treatments = await listTreatmentsWithEvents(db, PROFILE_ID);
    expect(treatments).toHaveLength(1);
    expect(treatments[0].events.map((e) => e.completed_date)).toEqual(['2026-09-01', '2026-10-08']);
  });
});

describe('tool-call validation', () => {
  it('rejects malformed JSON, unknown tools, and invalid arguments', () => {
    expect(validateToolCall({ name: 'propose_medical_record', arguments: '{not json' }).ok).toBe(false);
    expect(validateToolCall({ name: 'run_sql', arguments: '{"q":"DROP TABLE"}' }).ok).toBe(false);
    expect(validateToolCall({ name: 'propose_medical_record', arguments: { category: 'astrology', title: 'x' } }).ok).toBe(false);
    expect(validateToolCall({ name: 'propose_treatment_event', arguments: { treatment_name: 'x' } }).ok).toBe(false);
  });

  it('removes impossible dates and flags them for the user', () => {
    const future = validateToolCall({ name: 'propose_medical_record', arguments: { category: 'visit', title: 'Visit', event_date: '2027-01-01' } }, '2026-10-09');
    expect(future.ok && future.payload.kind === 'medical_record' && future.payload.record.event_date).toBeNull();
    expect(future.ok && future.warnings.length).toBe(1);

    const invalid = validateToolCall({ name: 'propose_medical_record', arguments: { category: 'visit', title: 'Visit', event_date: '2026-13-45' } }, '2026-10-09');
    expect(invalid.ok).toBe(false);
  });

  it('strips unexpected argument fields', () => {
    const r = validateToolCall({ name: 'propose_medical_record', arguments: { category: 'note', title: 'N', sql: 'DROP' } });
    expect(r.ok).toBe(true);
    expect(JSON.stringify(r)).not.toContain('DROP');
  });
});
