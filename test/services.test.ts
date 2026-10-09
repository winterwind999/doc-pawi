import { validateToolCall } from '@/lib/ai/agent-tools';
import type { CompletionRequest, CompletionResult } from '@/lib/ai/llm-types';
import { listMessages, createConversation } from '@/lib/db/repositories/conversations';
import { insertDocument } from '@/lib/db/repositories/documents';
import { getActivitySummary } from '@/lib/db/repositories/stats';
import { insertProposal, listProposalsForConversation } from '@/lib/db/repositories/proposals';
import { listRecords } from '@/lib/db/repositories/records';
import { insertRecord } from '@/lib/db/repositories/records';
import { insertEvent, listTreatmentsWithEvents } from '@/lib/db/repositories/treatments';
import { hasDemoData, loadDemoData, removeDemoData } from '@/lib/demo/synthetic-data';
import { sendChatMessage } from '@/lib/services/chat-service';
import { confirmProposal } from '@/lib/services/proposal-service';
import { recordInputSchema, treatmentEventInputSchema } from '@/lib/validation/schemas';

import { openTestDbWithProfile, PROFILE_ID } from './helpers/node-db';

const MODEL = { modelId: 'qwen3-1.7b-q4_k_m', modelFile: 'Qwen3-1.7B-Q4_K_M.gguf', engine: 'test-double' };
const TIMINGS = { promptTokens: 10, promptMs: 100, promptTokensPerSecond: 100, generatedTokens: 5, generationMs: 50, generatedTokensPerSecond: 100 };

/**
 * These tests use a scripted stand-in for the local model, so they verify the orchestration
 * (retrieval → prompt → validation → persistence), NOT model quality. Real inference is tested on
 * the device (docs/TESTING.md).
 */
function scripted(result: Partial<CompletionResult>, capture?: (r: CompletionRequest) => void) {
  return async (request: CompletionRequest): Promise<CompletionResult> => {
    capture?.(request);
    request.onText?.(result.text ?? '');
    return { text: '', toolCalls: [], timings: TIMINGS, stopReason: 'eos', ...result };
  };
}

describe('chat orchestration', () => {
  it('persists the exchange with model metadata and the records used', async () => {
    const db = await openTestDbWithProfile();
    await loadDemoData(db, PROFILE_ID, new Date(2026, 9, 9, 10));
    const c = await createConversation(db, PROFILE_ID);
    let prompt = '';
    await sendChatMessage({
      db,
      profileId: PROFILE_ID,
      conversationId: c.id,
      text: 'When did I get my second hepatitis B dose?',
      model: MODEL,
      complete: scripted({ text: 'Your second dose was on April 6, 2026.' }, (r) => {
        prompt = r.messages[r.messages.length - 1].content;
      }),
    });
    expect(prompt).toContain('dose 2: completed 2026-04-06');
    const messages = await listMessages(db, c.id);
    expect(messages.map((m) => [m.role, m.status])).toEqual([
      ['user', 'complete'],
      ['assistant', 'complete'],
    ]);
    const meta = JSON.parse(messages[1].model_metadata!);
    expect(meta).toMatchObject({ modelId: MODEL.modelId, stopReason: 'eos' });
    expect(meta.sources.length).toBeGreaterThan(0);
  });

  it('turns a valid tool call into a pending proposal, never a record', async () => {
    const db = await openTestDbWithProfile();
    const c = await createConversation(db, PROFILE_ID);
    await sendChatMessage({
      db,
      profileId: PROFILE_ID,
      conversationId: c.id,
      text: 'I had a dental check-up yesterday',
      model: MODEL,
      complete: scripted({
        text: 'Here is a suggestion.',
        toolCalls: [{ name: 'propose_medical_record', arguments: JSON.stringify({ category: 'visit', title: 'Dental check-up' }) }],
      }),
    });
    const proposals = await listProposalsForConversation(db, c.id);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].status).toBe('pending');
    expect(await listRecords(db, PROFILE_ID)).toHaveLength(0);
  });

  it('discards invalid tool calls and records why', async () => {
    const db = await openTestDbWithProfile();
    const c = await createConversation(db, PROFILE_ID);
    await sendChatMessage({
      db,
      profileId: PROFILE_ID,
      conversationId: c.id,
      text: 'save this',
      model: MODEL,
      complete: scripted({ text: 'ok', toolCalls: [{ name: 'delete_everything', arguments: '{}' }] }),
    });
    expect(await listProposalsForConversation(db, c.id)).toHaveLength(0);
    const assistant = (await listMessages(db, c.id))[1];
    expect(JSON.parse(assistant.model_metadata!).toolCalls[0]).toMatchObject({ ok: false });
  });

  it('gives an attached document to the model without putting it in the visible message', async () => {
    const db = await openTestDbWithProfile();
    await insertDocument(db, {
      id: 'doc-1',
      profileId: PROFILE_ID,
      displayName: 'lab.png',
      mimeType: 'image/png',
      privateFilePath: '/vault/doc-1.dpv',
      fileSize: 10,
      sha256: 'x',
    });
    const c = await createConversation(db, PROFILE_ID);
    let prompt = '';
    await sendChatMessage({
      db,
      profileId: PROFILE_ID,
      conversationId: c.id,
      text: 'Summarize this report',
      model: MODEL,
      attachment: { documentId: 'doc-1', name: 'lab.png', text: 'WBC count 11.8 HIGH' },
      complete: scripted({ text: 'It shows a WBC count marked high.' }, (r) => {
        prompt = r.messages[r.messages.length - 1].content;
      }),
    });
    expect(prompt).toContain('Attached document "lab.png"');
    expect(prompt).toContain('WBC count 11.8 HIGH');
    const [user, assistant] = await listMessages(db, c.id);
    expect(user.content).toBe('Summarize this report');
    expect(JSON.parse(assistant.model_metadata!).sources[0]).toMatchObject({ type: 'document', label: 'lab.png' });
  });

  it('gives the model the dates the user meant and flags a suggestion on another day', async () => {
    const db = await openTestDbWithProfile();
    const c = await createConversation(db, PROFILE_ID);
    const dose = (eventTitle: string, date: string) => ({
      name: 'propose_treatment_event',
      arguments: JSON.stringify({
        treatment_name: 'Rabies vaccine',
        treatment_type: 'vaccination',
        event_title: eventTitle,
        status: 'completed',
        date,
      }),
    });
    let prompt = '';
    await sendChatMessage({
      db,
      profileId: PROFILE_ID,
      conversationId: c.id,
      text: 'last week Monday i also had my first rabies shot and my 2nd was on thursday',
      model: MODEL,
      // Saturday, Oct 10, 2026, 4:48 AM — when the problem was reported.
      now: new Date(2026, 9, 10, 4, 48),
      complete: scripted({ text: 'Two suggestions.', toolCalls: [dose('Dose 1', '2026-09-28'), dose('Dose 2', '2026-10-04')] }, (r) => {
        prompt = r.messages[r.messages.length - 1].content;
      }),
    });
    expect(prompt).toContain('"last week Monday" = Monday, 2026-09-28');
    expect(prompt).toContain('"thursday" = Thursday, 2026-10-01');
    const flagged = (await listProposalsForConversation(db, c.id)).map((p) => {
      const payload = JSON.parse(p.payload) as { warnings: string[]; event: { title: string } };
      return [payload.event.title, payload.warnings.some((w) => w.startsWith('Check the date'))];
    });
    expect(flagged).toEqual(
      expect.arrayContaining([
        ['Dose 1', false],
        ['Dose 2', true],
      ]),
    );
  });

  it('keeps partial text when stopped and reports model errors honestly', async () => {
    const db = await openTestDbWithProfile();
    const c = await createConversation(db, PROFILE_ID);
    await sendChatMessage({ db, profileId: PROFILE_ID, conversationId: c.id, text: 'hi', model: MODEL, complete: scripted({ text: 'Partial ans', stopReason: 'stopped' }) });
    await sendChatMessage({
      db,
      profileId: PROFILE_ID,
      conversationId: c.id,
      text: 'hi again',
      model: MODEL,
      complete: async () => {
        throw new Error('model not loaded');
      },
    });
    const messages = await listMessages(db, c.id);
    expect(messages[1]).toMatchObject({ status: 'stopped', content: 'Partial ans' });
    expect(messages[3].status).toBe('error');
    expect(messages[3].content).toContain('model not loaded');
  });
});

describe('synthetic demo data', () => {
  it('loads once, is labelled, and removes cleanly without touching user data', async () => {
    const db = await openTestDbWithProfile();
    await insertRecord(db, { profileId: PROFILE_ID, sourceType: 'manual', input: recordInputSchema.parse({ category: 'note', title: 'My own note' }) });
    await loadDemoData(db, PROFILE_ID, new Date(2026, 9, 9));
    expect(await hasDemoData(db, PROFILE_ID)).toBe(true);
    await expect(loadDemoData(db, PROFILE_ID)).rejects.toThrow(/already loaded/);
    const summary = await getActivitySummary(db, PROFILE_ID, '2026-10-02T00:00');
    expect(summary).toMatchObject({ records: 5, activeMedications: 2, ongoingTreatments: 2, doctors: 2, hmos: 1 });

    await removeDemoData(db, PROFILE_ID);
    expect(await hasDemoData(db, PROFILE_ID)).toBe(false);
    expect((await listRecords(db, PROFILE_ID)).map((r) => r.title)).toEqual(['My own note']);
  });

  it('keeps events the user added to a demo series when demo data is removed', async () => {
    const db = await openTestDbWithProfile();
    await loadDemoData(db, PROFILE_ID, new Date(2026, 9, 9));
    const demoFlu = (await listTreatmentsWithEvents(db, PROFILE_ID)).find((t) => t.title === 'Influenza vaccine 2026');
    expect(demoFlu?.source_type).toBe('demo');
    // A dose the user recorded by hand on the demo series.
    await insertEvent(db, {
      profileId: PROFILE_ID,
      sourceType: 'manual',
      input: treatmentEventInputSchema.parse({
        treatment_id: demoFlu!.id,
        title: 'Flu shot',
        event_type: 'dose',
        status: 'completed',
        completed_date: '2026-10-10',
      }),
    });
    // A dose confirmed from chat never joins the demo series.
    const outcome = validateToolCall(
      {
        name: 'propose_treatment_event',
        arguments: { treatment_name: 'Influenza vaccine 2026', treatment_type: 'vaccination', event_title: 'Flu shot', status: 'completed', date: '2026-10-10' },
      },
      '2026-10-10',
    );
    if (!outcome.ok) throw new Error(outcome.error);
    const proposal = await insertProposal(db, { profileId: PROFILE_ID, origin: 'chat', proposalType: outcome.payload.kind, payload: outcome.payload });
    const confirmed = await confirmProposal(db, { profileId: PROFILE_ID, proposalId: proposal.id });
    expect(confirmed).toMatchObject({ type: 'treatment_event', createdTreatment: true });

    await removeDemoData(db, PROFILE_ID);
    const left = await listTreatmentsWithEvents(db, PROFILE_ID);
    expect(left.every((t) => t.source_type !== 'demo')).toBe(true);
    expect(left.flatMap((t) => t.events.map((e) => `${t.title}: ${e.title} ${e.completed_date}`)).sort()).toEqual([
      'Influenza vaccine 2026: Flu shot 2026-10-10',
      'Influenza vaccine 2026: Flu shot 2026-10-10',
    ]);
  });
});
