import { ageOn, addDays, formatTimeOfDay, localTimeOfDay, todayLocal } from '../dates';
import type { DoctorRow, HmoRow, MedicalRecordRow, ProfileRow, TreatmentEventRow } from '../db/models';
import { listDoctors } from '../db/repositories/doctors';
import { getHmo, listHmos } from '../db/repositories/hmos';
import { getDoseSlotsForDate, listMedications } from '../db/repositories/medications';
import { getProfile } from '../db/repositories/profiles';
import { likePattern, listRecords } from '../db/repositories/records';
import { listTreatmentsWithEvents, listUpcomingEvents, type TreatmentWithEvents } from '../db/repositories/treatments';
import type { DbExecutor } from '../db/types';
import { parseJson, parseStringArray } from '../json';

/**
 * Local medical-context retrieval ("read tools" of the bounded agent).
 *
 * A deterministic router maps the question to intents and keywords, runs read-only
 * repository queries, and formats a compact, size-bounded context block. Running retrieval
 * before inference (instead of letting the model request tools) avoids an extra model
 * round-trip, which matters on mid-range phones. See docs/LOCAL_AI_ARCHITECTURE.md.
 */

export type Intent =
  | 'vaccination'
  | 'medication'
  | 'treatment'
  | 'lab'
  | 'condition'
  | 'doctor'
  | 'hmo'
  | 'profile'
  | 'upcoming'
  | 'overview';

const INTENT_TERMS: Record<Intent, string[]> = {
  vaccination: [
    'vaccin', 'vax', 'shot', 'immuniz', 'immunis', 'booster', 'jab', 'bakuna', 'hepatitis', 'hep b',
    'flu', 'influenza', 'covid', 'tetanus', 'rabies', 'hpv', 'mmr', 'pneumo', 'polio', 'measles', 'dose',
  ],
  medication: [
    'medic', 'medicine', 'drug', 'pill', 'tablet', 'capsule', 'taking', 'take my', 'mg', 'prescri',
    'gamot', 'maintenance', 'dosage', 'meds', 'reminder',
  ],
  treatment: ['treatment', 'therapy', 'session', 'course', 'ongoing', 'rehab', 'follow-up', 'follow up'],
  lab: [
    'lab', 'result', 'test', 'blood', 'cbc', 'glucose', 'sugar', 'cholesterol', 'lipid', 'creatinine',
    'hemoglobin', 'wbc', 'white blood', 'platelet', 'urine', 'x-ray', 'xray', 'ultrasound', 'report', 'value',
  ],
  condition: ['diagnos', 'condition', 'allerg', 'disease', 'illness', 'surgery', 'procedure', 'operation', 'history'],
  doctor: ['doctor', 'dr.', 'dr ', 'physician', 'specialist', 'clinic', 'doktor', 'pedia', 'cardio', 'derma', 'dentist'],
  hmo: ['hmo', 'insurance', 'coverage', 'covered', 'policy', 'member', 'card', 'philhealth', 'accredit', 'plan', 'hospital'],
  profile: ['my age', 'how old', 'weight', 'height', 'bmi', 'born', 'birthday', 'birth'],
  upcoming: ['next', 'upcoming', 'schedule', 'when is', 'when do', 'due', 'appointment', 'tomorrow', 'this week'],
  overview: ['summary', 'summarize', 'summarise', 'overview', 'my health', 'everything', 'all my', 'my records'],
};

const STOPWORDS = new Set(
  (
    'a an and are as at be been but by can could did do does doing for from had has have how i if in into is it its ' +
    'me my of on or our please should so than that the their them then there these they this to was we were what when ' +
    'where which who why will with would you your about any did does get got tell know ko ang ng sa ba po na mga ' +
    'doc pawi record records recorded show list give much many last time date dates'
  ).split(' '),
);

export function detectIntents(question: string): Intent[] {
  const q = ` ${question.toLowerCase()} `;
  return (Object.keys(INTENT_TERMS) as Intent[]).filter((intent) =>
    INTENT_TERMS[intent].some((term) => q.includes(term)),
  );
}

export function extractKeywords(question: string): string[] {
  const words = question
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
  return [...new Set(words)].slice(0, 8);
}

export interface RetrievedSource {
  type: 'profile' | 'record' | 'treatment' | 'medication' | 'doctor' | 'hmo';
  id: string;
  label: string;
}

export interface RetrievalResult {
  /** Text block inserted into the model input. */
  contextText: string;
  sources: RetrievedSource[];
  intents: Intent[];
  /** Topics the user asked about for which nothing is recorded. */
  missing: string[];
}

const MAX_CONTEXT_CHARS = 2600;
const clip = (s: string | null | undefined, n: number) => {
  if (!s) return '';
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const SOURCE_LABEL: Record<string, string> = {
  manual: 'entered by user',
  document: 'from imported document',
  ai_chat: 'confirmed AI suggestion',
  demo: 'synthetic demo data',
};

function formatProfile(p: ProfileRow, today: string) {
  const parts: string[] = [];
  const age = p.birth_date ? ageOn(p.birth_date, today) : null;
  if (age !== null) parts.push(`age ${age}`);
  if (p.sex && p.sex !== 'prefer_not_to_say') parts.push(`sex ${p.sex}`);
  if (p.height_value) parts.push(`height ${p.height_value} ${p.height_unit}`);
  if (p.weight_value) parts.push(`weight ${p.weight_value} ${p.weight_unit}`);
  return parts.length ? `Profile: ${parts.join(', ')}.` : 'Profile: no age, sex, height, or weight recorded.';
}

function formatEvent(e: TreatmentEventRow) {
  const when =
    e.status === 'completed'
      ? `completed ${e.completed_date ?? '(date not recorded)'}`
      : e.status === 'scheduled'
        ? `scheduled ${e.scheduled_date ?? '(no date)'}`
        : `${e.status}${e.scheduled_date ? ` (was scheduled ${e.scheduled_date})` : ''}`;
  return `${e.title}: ${when}${e.facility ? ` at ${e.facility}` : ''}`;
}

function formatTreatment(t: TreatmentWithEvents) {
  const header = `${t.title} (${t.kind.replace('_', ' ')}, ${t.status}${t.start_date ? `, started ${t.start_date}` : ''})`;
  const events = t.events.slice(-8).map(formatEvent);
  return `- ${header}${events.length ? `: ${events.join('; ')}` : ': no events recorded'}.`;
}

function formatRecord(r: MedicalRecordRow) {
  const data = parseJson<Record<string, unknown>>(r.structured_data, {});
  const labs = Array.isArray(data.lab_results)
    ? (data.lab_results as Record<string, unknown>[])
        .slice(0, 8)
        .map((l) => `${l.test} ${l.value}${l.unit ? ` ${l.unit}` : ''}${l.flag ? ` (${String(l.flag).toUpperCase()})` : ''}${l.reference_range ? ` [ref ${l.reference_range}]` : ''}`)
    : [];
  const bits = [
    `${r.event_date ?? 'date not recorded'} ${r.category.replace('_', ' ')}: "${clip(r.title, 80)}"`,
    r.facility ? `at ${clip(r.facility, 60)}` : '',
    r.summary ? `— ${clip(r.summary, 180)}` : '',
    labs.length ? `Values: ${labs.join(', ')}` : '',
    `(${SOURCE_LABEL[r.source_type] ?? r.source_type})`,
  ];
  return `- ${bits.filter(Boolean).join(' ')}`;
}

function formatDoctor(d: DoctorRow) {
  const phones = parseStringArray(d.phones);
  return `- ${d.name}${d.specialty ? `, ${d.specialty}` : ''}${d.organization ? `, ${d.organization}` : ''}${
    d.address ? `, ${clip(d.address, 80)}` : ''
  }${phones.length ? `, phone ${phones[0]}` : ''}.`;
}

function maskMemberId(id: string | null) {
  if (!id) return null;
  return id.length <= 4 ? id : `…${id.slice(-4)}`;
}

function formatHmo(h: HmoRow, extra: string) {
  return `- ${h.provider_name}${h.plan_name ? ` – ${h.plan_name}` : ''}${
    h.member_id ? `, member ID ending ${maskMemberId(h.member_id)}` : ''
  }${h.valid_until ? `, valid until ${h.valid_until}` : ''}${h.coverage_notes ? `. Coverage notes: ${clip(h.coverage_notes, 200)}` : ''}${extra}`;
}

/**
 * Retrieves local records relevant to `question`. Always read-only.
 * `now` is injectable for deterministic tests.
 */
export async function retrieveHealthContext(
  db: DbExecutor,
  profileId: string,
  question: string,
  now: Date = new Date(),
): Promise<RetrievalResult> {
  const today = todayLocal(now);
  const intents = detectIntents(question);
  const has = (i: Intent) => intents.includes(i) || intents.includes('overview');
  const keywords = extractKeywords(question);
  const sections: string[] = [];
  const sources: RetrievedSource[] = [];
  const missing: string[] = [];

  const profile = await getProfile(db, profileId);
  if (profile) sections.push(formatProfile(profile, today));

  if (has('vaccination')) {
    const vaccines = await listTreatmentsWithEvents(db, profileId, { kind: 'vaccination' });
    const vaccineRecords = await listRecords(db, profileId, { category: 'vaccination', limit: 6 });
    if (vaccines.length || vaccineRecords.length) {
      sections.push(
        ['Vaccinations:', ...vaccines.slice(0, 6).map(formatTreatment), ...vaccineRecords.map(formatRecord)].join('\n'),
      );
      vaccines.forEach((t) => sources.push({ type: 'treatment', id: t.id, label: t.title }));
      vaccineRecords.forEach((r) => sources.push({ type: 'record', id: r.id, label: r.title }));
    } else {
      missing.push('vaccinations');
    }
  }

  if (has('treatment') || has('upcoming')) {
    const treatments = await listTreatmentsWithEvents(db, profileId, { excludeKind: 'vaccination' });
    const relevant = treatments.filter((t) => t.status === 'ongoing' || t.status === 'planned' || has('treatment'));
    if (relevant.length) {
      sections.push(['Treatments:', ...relevant.slice(0, 5).map(formatTreatment)].join('\n'));
      relevant.slice(0, 5).forEach((t) => sources.push({ type: 'treatment', id: t.id, label: t.title }));
    } else if (has('treatment')) {
      missing.push('treatments');
    }
  }

  if (has('upcoming')) {
    const upcoming = await listUpcomingEvents(db, profileId, today, 6);
    if (upcoming.length) {
      sections.push(
        [
          `Upcoming scheduled events (today is ${today}):`,
          ...upcoming.map((e) => `- ${e.scheduled_date}: ${e.title} (${e.treatment_title})${e.facility ? ` at ${e.facility}` : ''}`),
        ].join('\n'),
      );
    } else {
      missing.push('upcoming scheduled events');
    }
  }

  if (has('medication')) {
    const meds = await listMedications(db, profileId);
    const active = meds.filter((m) => m.status === 'active');
    if (meds.length) {
      const slots = await getDoseSlotsForDate(db, profileId, today, `${today}T${localTimeOfDay(now)}`);
      const lines = active.slice(0, 8).map((m) => {
        const times = m.schedules.map((s) => formatTimeOfDay(s.time_of_day)).join(', ');
        const todays = slots
          .filter((s) => s.medication.id === m.id)
          .map((s) => `${formatTimeOfDay(s.schedule.time_of_day)} ${s.state === 'due' ? 'not yet recorded' : s.state}`)
          .join(', ');
        return `- ${m.name}${m.strength ? ` ${m.strength}` : ''}${m.form ? ` ${m.form}` : ''}${
          m.start_date ? `, since ${m.start_date}` : ''
        }${times ? `; scheduled daily at ${times}` : '; no schedule'}${m.instructions ? `; instructions: ${clip(m.instructions, 100)}` : ''}${
          todays ? `; today: ${todays}` : ''
        }.`;
      });
      const archived = meds.filter((m) => m.status === 'archived').map((m) => m.name);
      sections.push(
        [
          'Medications (active):',
          ...(lines.length ? lines : ['- none active']),
          archived.length ? `Archived medications: ${archived.slice(0, 8).join(', ')}.` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      );
      active.slice(0, 8).forEach((m) => sources.push({ type: 'medication', id: m.id, label: m.name }));
    } else {
      missing.push('medications');
    }
  }

  const wantsRecords = has('lab') || has('condition');
  const recordMap = new Map<string, MedicalRecordRow>();
  if (wantsRecords) {
    const category = has('lab') && !has('condition') ? 'lab_result' : null;
    for (const r of await listRecords(db, profileId, { category, limit: 6 })) recordMap.set(r.id, r);
    if (!recordMap.size) missing.push(has('lab') ? 'lab results' : 'medical records');
  }
  for (const keyword of keywords.slice(0, 5)) {
    for (const r of await listRecords(db, profileId, { search: keyword, limit: 4 })) recordMap.set(r.id, r);
  }
  if (recordMap.size) {
    const records = [...recordMap.values()].slice(0, 7);
    sections.push(['Medical records:', ...records.map(formatRecord)].join('\n'));
    records.forEach((r) => sources.push({ type: 'record', id: r.id, label: r.title }));
  }

  if (has('doctor')) {
    const doctors = await listDoctors(db, profileId);
    const matched = keywords.length
      ? doctors.filter((d) =>
          keywords.some((k) => `${d.name} ${d.specialty ?? ''} ${d.organization ?? ''}`.toLowerCase().includes(k)),
        )
      : [];
    const chosen = (matched.length ? matched : doctors).slice(0, 5);
    if (chosen.length) {
      sections.push(['Saved doctors:', ...chosen.map(formatDoctor)].join('\n'));
      chosen.forEach((d) => sources.push({ type: 'doctor', id: d.id, label: d.name }));
    } else {
      missing.push('doctors');
    }
  }

  if (has('hmo')) {
    const hmos = await listHmos(db, profileId);
    if (hmos.length) {
      const lines: string[] = [];
      for (const h of hmos.slice(0, 3)) {
        const detail = await getHmo(db, h.id);
        const facilities = detail?.facilities.map((f) => f.name) ?? [];
        const doctors = detail?.doctors.map((d) => d.name) ?? [];
        lines.push(
          formatHmo(
            h,
            `${facilities.length ? `. Saved facilities (user-reported): ${facilities.slice(0, 5).join(', ')}` : ''}${
              doctors.length ? `. Doctors the user linked to this HMO (user-reported): ${doctors.slice(0, 5).join(', ')}` : ''
            }.`,
          ),
        );
        sources.push({ type: 'hmo', id: h.id, label: h.provider_name });
      }
      sections.push(['HMO / insurance (saved by the user, not verified):', ...lines].join('\n'));
    } else {
      missing.push('HMO or insurance details');
    }
  }

  if (has('overview') && sources.length === 0) missing.push('health records');

  let contextText = sections.join('\n\n');
  if (missing.length) {
    contextText += `\n\nNot recorded in Doc Pawi: ${missing.join(', ')}.`;
  }
  if (contextText.length > MAX_CONTEXT_CHARS) {
    contextText = `${contextText.slice(0, MAX_CONTEXT_CHARS - 40)}\n…(more records omitted for length)`;
  }
  const unique = new Map(sources.map((s) => [`${s.type}:${s.id}`, s]));
  return { contextText, sources: [...unique.values()], intents, missing };
}

/** Exposed for the doctor search UI and tests. */
export const __private = { likePattern, addDays };
