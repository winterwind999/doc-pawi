import { checkGrounding, extractionSchema, extractionToProposal, isGrounded, normalizeForMatch, parseExtraction } from '@/lib/ai/extraction';
import { asksAboutDoseChange, assessMessage } from '@/lib/ai/safety';
import { addDays, ageOn, formatTimeOfDay, greetingFor, isValidIsoDate, relativeDay } from '@/lib/dates';
import type { ActivitySummary } from '@/lib/db/repositories/stats';
import { buildHomeMessage } from '@/lib/home-message';
import { FREE_ATTEMPTS, INITIAL_THROTTLE, lockoutMsAfter, registerFailure, remainingLockMs } from '@/lib/security/throttle';

const OCR_TEXT = `BAYANIHAN DIAGNOSTIC LABORATORY (FICTIONAL)
Date collected: 2026-09-15   Date reported: 2026-09-16
Requesting physician: Dr. Maria Santos
Test   Result   Unit   Reference range   Flag
Hemoglobin   14.1   g/dL   13.5 - 17.5
WBC count   11.8   x10^9/L   4.5 - 11.0   HIGH`;

describe('document extraction', () => {
  const extraction = extractionSchema.parse({
    document_type: 'lab_result',
    title: 'Complete blood count',
    document_date: '2026-09-15',
    facility: 'Bayanihan Diagnostic Laboratory',
    clinician: 'Dr. Maria Santos',
    summary: 'A blood count with one value marked high.',
    lab_results: [
      { test: 'WBC count', value: '11.8', unit: 'x10^9/L', reference_range: '4.5 - 11.0', flag: 'high' },
      { test: 'Platelet count', value: '999', unit: 'x10^9/L', reference_range: '150 - 400', flag: '' },
    ],
    medications: [],
    vaccinations: [],
    diagnoses: [],
  });

  it('flags values that do not appear in the OCR text', () => {
    const report = checkGrounding(extraction, OCR_TEXT);
    expect(report.ungrounded).toEqual(expect.arrayContaining(['lab_results.1.test', 'lab_results.1.value', 'lab_results.1.reference_range']));
    expect(report.ungrounded).not.toContain('lab_results.0.value');
    expect(report.ungrounded).not.toContain('facility');
  });

  it('normalizes dashes and spacing when matching', () => {
    expect(normalizeForMatch('4.5 – 11.0')).toBe('4.5 - 11.0');
    expect(isGrounded('4.5 – 11.0', normalizeForMatch(OCR_TEXT))).toBe(true);
  });

  it('builds a reviewable proposal and clears future dates', () => {
    const proposal = extractionToProposal({ ...extraction, document_date: '2030-01-01' }, checkGrounding(extraction, OCR_TEXT), 'scan.png', '2026-10-09');
    expect(proposal.record.category).toBe('lab_result');
    expect(proposal.record.event_date).toBeNull();
    expect(proposal.unverified_fields).toContain('document_date');
  });

  it('parses JSON wrapped in extra text and rejects non-JSON', () => {
    expect(parseExtraction(`Here you go: ${JSON.stringify({ title: 'X', summary: 'S' })}`)?.title).toBe('X');
    expect(parseExtraction('no json here')).toBeNull();
  });

  it('coerces invalid enum values and truncates long strings instead of failing', () => {
    const parsed = extractionSchema.parse({ document_type: 'horoscope', title: 'x'.repeat(500), summary: 's' });
    expect(parsed.document_type).toBe('other');
    expect(parsed.title).toHaveLength(160);
    expect(parsed.lab_results).toEqual([]);
  });
});

describe('safety', () => {
  it.each([
    'I have chest pain and my left arm hurts',
    "I can't breathe properly",
    'I think I want to kill myself',
    'my face is drooping and I have slurred speech',
  ])('detects emergency red flags: %s', (text) => {
    expect(assessMessage(text).emergency).toBe(true);
  });

  it('does not flag ordinary questions', () => {
    expect(assessMessage('When is my next vaccine dose?').emergency).toBe(false);
  });

  it('detects requests to change medication', () => {
    expect(asksAboutDoseChange('Should I double my metformin dose?')).toBe(true);
    expect(asksAboutDoseChange('What time is my metformin dose?')).toBe(false);
  });
});

describe('dates', () => {
  it('validates real calendar dates', () => {
    expect(isValidIsoDate('2024-02-29')).toBe(true);
    expect(isValidIsoDate('2026-02-29')).toBe(false);
    expect(isValidIsoDate('2026-9-1')).toBe(false);
  });

  it('handles month/year boundaries and ages', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(ageOn('1990-10-10', '2026-10-09')).toBe(35);
    expect(ageOn('1990-10-09', '2026-10-09')).toBe(36);
  });

  it('formats times and relative days', () => {
    expect(formatTimeOfDay('00:05')).toBe('12:05 AM');
    expect(formatTimeOfDay('20:00')).toBe('8:00 PM');
    expect(relativeDay('2026-10-10', '2026-10-09')).toBe('tomorrow');
    expect(relativeDay('2026-10-23', '2026-10-09')).toBe('in 14 days');
  });

  it('greets by time of day', () => {
    expect(greetingFor(new Date(2026, 9, 9, 7))).toBe('Good morning');
    expect(greetingFor(new Date(2026, 9, 9, 13))).toBe('Good afternoon');
    expect(greetingFor(new Date(2026, 9, 9, 22))).toBe('Good evening');
  });
});

describe('PIN throttling', () => {
  it('allows free attempts then escalates lockouts', () => {
    let state = INITIAL_THROTTLE;
    for (let i = 0; i < FREE_ATTEMPTS - 1; i++) state = registerFailure(state, 1000);
    expect(remainingLockMs(state, 1000)).toBe(0);
    state = registerFailure(state, 1000);
    expect(remainingLockMs(state, 1000)).toBe(30_000);
    expect(lockoutMsAfter(FREE_ATTEMPTS + 1)).toBe(60_000);
    expect(lockoutMsAfter(100)).toBe(60 * 60_000);
  });
});

describe('home message', () => {
  const summary: ActivitySummary = {
    records: 0,
    documents: 0,
    conversations: 0,
    activeMedications: 0,
    ongoingTreatments: 0,
    dosesTakenLast7Days: 0,
    dosesSkippedLast7Days: 0,
    pendingProposals: 0,
    doctors: 0,
    hmos: 0,
    demoRows: 0,
  };

  it('uses a neutral welcome when there is no data', () => {
    expect(buildHomeMessage({ slots: [], upcoming: [], overdue: [], summary, today: '2026-10-09' })).toMatch(/^Welcome!/);
  });

  it('only states facts from saved data', () => {
    const msg = buildHomeMessage({
      slots: [],
      upcoming: [{ title: 'Dose 3', scheduled_date: '2026-10-23' } as never],
      overdue: [],
      summary: { ...summary, pendingProposals: 1 },
      today: '2026-10-09',
    });
    expect(msg).toBe('Next recorded event: “Dose 3” in 14 days (Oct 23, 2026). 1 AI suggestion is waiting for your review.');
  });
});
