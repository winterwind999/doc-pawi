import { detectIntents, extractKeywords, retrieveHealthContext } from '@/lib/ai/retrieval';
import { buildChatMessages } from '@/lib/ai/prompts';
import { loadDemoData } from '@/lib/demo/synthetic-data';

import { openTestDbWithProfile, PROFILE_ID } from './helpers/node-db';

const NOW = new Date(2026, 9, 9, 10, 0, 0); // 2026-10-09 10:00 local

describe('intent detection', () => {
  it('maps questions to record types', () => {
    expect(detectIntents('When was my last hepatitis B dose?')).toEqual(expect.arrayContaining(['vaccination']));
    expect(detectIntents('What medications am I taking?')).toEqual(expect.arrayContaining(['medication']));
    expect(detectIntents('What was my cholesterol result?')).toEqual(expect.arrayContaining(['lab']));
    expect(detectIntents('Is my HMO card still valid?')).toEqual(expect.arrayContaining(['hmo']));
  });

  it('extracts content keywords without stopwords', () => {
    expect(extractKeywords('What was my cholesterol in the lipid test?')).toEqual(expect.arrayContaining(['cholesterol', 'lipid']));
    expect(extractKeywords('What was my')).toEqual([]);
  });
});

describe('local context retrieval', () => {
  it('returns the recorded vaccination dates from the synthetic dataset', async () => {
    const db = await openTestDbWithProfile();
    await loadDemoData(db, PROFILE_ID, NOW);
    const r = await retrieveHealthContext(db, PROFILE_ID, 'When did I get my second hepatitis B dose?', NOW);
    expect(r.contextText).toContain('Hepatitis B vaccine series');
    expect(r.contextText).toContain('dose 2: completed 2026-04-06');
    expect(r.contextText).toContain('dose 3: scheduled 2026-10-23');
    expect(r.sources.some((s) => s.label === 'Hepatitis B vaccine series')).toBe(true);
  });

  it('includes lab values and medications with today’s dose status', async () => {
    const db = await openTestDbWithProfile();
    await loadDemoData(db, PROFILE_ID, NOW);
    const labs = await retrieveHealthContext(db, PROFILE_ID, 'What was my cholesterol?', NOW);
    expect(labs.contextText).toContain('Total cholesterol 5.6 mmol/L (HIGH)');
    const meds = await retrieveHealthContext(db, PROFILE_ID, 'What medications am I taking?', NOW);
    expect(meds.contextText).toContain('Metformin (demo) 500 mg');
    expect(meds.contextText).toContain('8:00 AM not yet recorded');
    expect(meds.contextText).toContain('Archived medications: Amoxicillin (demo)');
  });

  it('states explicitly when nothing is recorded, so the model cannot fill gaps', async () => {
    const db = await openTestDbWithProfile();
    const r = await retrieveHealthContext(db, PROFILE_ID, 'When was my last tetanus vaccine?', NOW);
    expect(r.missing).toContain('vaccinations');
    expect(r.contextText).toContain('Not recorded in Doc Pawi: vaccinations');
  });

  it('masks HMO member IDs and labels HMO data as unverified', async () => {
    const db = await openTestDbWithProfile();
    await loadDemoData(db, PROFILE_ID, NOW);
    const r = await retrieveHealthContext(db, PROFILE_ID, 'What does my HMO cover?', NOW);
    expect(r.contextText).toContain('member ID ending …1234');
    expect(r.contextText).not.toContain('DEMO-0000-1234');
    expect(r.contextText).toContain('not verified');
  });

  it('puts retrieved records in the latest user turn and keeps the system prompt static', async () => {
    const db = await openTestDbWithProfile();
    await loadDemoData(db, PROFILE_ID, NOW);
    const retrieval = await retrieveHealthContext(db, PROFILE_ID, 'hepatitis B?', NOW);
    const messages = buildChatMessages({ history: [], question: 'hepatitis B?', retrieval, now: NOW });
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).not.toContain('Hepatitis B vaccine series');
    expect(messages[1].content).toContain('Today is Friday, Oct 9, 2026 (2026-10-09)');
    expect(messages[1].content).toContain('Hepatitis B vaccine series');
  });
});
