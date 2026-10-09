import { addDays, daysBetween, formatDate, parseLocalDate } from '../dates';

/**
 * Small on-device models are unreliable at calendar arithmetic: on the test phone, "last week
 * Monday … my 2nd was on Thursday" (said on Saturday 2026-10-10) became 2026-09-27 and 2026-10-04,
 * both Sundays. The app therefore resolves relative date phrases itself and gives the model the
 * exact dates. Weeks start on Monday, so "last week Monday" is the Monday of the previous week.
 */
export interface ResolvedDate {
  /** The words as written in the message, e.g. "last week Monday". */
  phrase: string;
  /** Local `YYYY-MM-DD`. */
  date: string;
  weekday: string;
}

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY = '(monday|tuesday|wednesday|thursday|friday|saturday|sunday)';
const NUMBER_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };

/** 0 = Monday … 6 = Sunday. */
const weekdayIndex = (isoDate: string) => (parseLocalDate(isoDate).getDay() + 6) % 7;
const mondayOf = (isoDate: string) => addDays(isoDate, -weekdayIndex(isoDate));
export const weekdayName = (isoDate: string) => WEEKDAY_NAMES[weekdayIndex(isoDate)];

const FUTURE_CUES = /\b(will|going to|scheduled|schedule|next|upcoming|tomorrow|plan|planned|appointment)\b/;

interface Match {
  index: number;
  phrase: string;
  resolve: (state: { anchorMonday: string | null; previous: string | null }) => { date: string; anchorMonday?: string } | null;
}

/**
 * Finds relative date phrases in `message` and computes their dates relative to `today`.
 * A bare weekday after an anchored one ("last week Monday … on Thursday") stays in the same week
 * when that keeps the story in order; otherwise it is the most recent such day (or the next one
 * when the message talks about the future).
 */
export function resolveRelativeDates(message: string, today: string): ResolvedDate[] {
  const text = message.toLowerCase();
  const future = FUTURE_CUES.test(text);
  const matches: Match[] = [];
  const taken: [number, number][] = [];
  const add = (re: RegExp, build: (m: RegExpExecArray) => Match['resolve']) => {
    for (const m of text.matchAll(new RegExp(re.source, 'g'))) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (taken.some(([s, e]) => start < e && end > s)) continue;
      taken.push([start, end]);
      matches.push({ index: start, phrase: message.slice(start, end).trim(), resolve: build(m as RegExpExecArray) });
    }
  };

  const weekOffset = (which: string) => (which === 'last' ? -7 : which === 'next' ? 7 : 0);
  // Longest, most specific patterns first so their words are not matched again below.
  // "every Monday" is a routine, not a date: claim the words so they resolve to nothing.
  add(new RegExp(`\\b(every|each) ${DAY}\\b`), () => () => null);
  add(new RegExp(`\\b(last|this|next) week'?s?,? (?:on )?${DAY}\\b`), (m) => () => {
    const monday = addDays(mondayOf(today), weekOffset(m[1]));
    return { date: addDays(monday, WEEKDAYS.indexOf(m[2] as (typeof WEEKDAYS)[number])), anchorMonday: monday };
  });
  add(new RegExp(`\\b${DAY},? (?:of )?(last|this|next) week\\b`), (m) => () => {
    const monday = addDays(mondayOf(today), weekOffset(m[2]));
    return { date: addDays(monday, WEEKDAYS.indexOf(m[1] as (typeof WEEKDAYS)[number])), anchorMonday: monday };
  });
  add(/\bthe day before yesterday\b/, () => () => ({ date: addDays(today, -2) }));
  add(/\bthe day after tomorrow\b/, () => () => ({ date: addDays(today, 2) }));
  add(/\byesterday\b/, () => () => ({ date: addDays(today, -1) }));
  add(/\btoday\b/, () => () => ({ date: today }));
  add(/\btomorrow\b/, () => () => ({ date: addDays(today, 1) }));
  add(/\b(\d{1,2}|a|an|one|two|three|four|five|six|seven) (day|week)s? ago\b/, (m) => () => {
    const n = NUMBER_WORDS[m[1]] ?? Number(m[1]);
    return { date: addDays(today, -n * (m[2] === 'week' ? 7 : 1)) };
  });
  add(new RegExp(`\\blast ${DAY}\\b`), (m) => () => {
    const target = WEEKDAYS.indexOf(m[1] as (typeof WEEKDAYS)[number]);
    const back = ((weekdayIndex(today) - target + 7) % 7) || 7;
    return { date: addDays(today, -back) };
  });
  add(new RegExp(`\\bnext ${DAY}\\b`), (m) => () => {
    const target = WEEKDAYS.indexOf(m[1] as (typeof WEEKDAYS)[number]);
    const ahead = ((target - weekdayIndex(today) + 7) % 7) || 7;
    return { date: addDays(today, ahead) };
  });
  add(new RegExp(`\\b${DAY}\\b`), (m) => ({ anchorMonday, previous }) => {
    const target = WEEKDAYS.indexOf(m[1] as (typeof WEEKDAYS)[number]);
    if (anchorMonday) {
      const inWeek = addDays(anchorMonday, target);
      if ((!previous || inWeek >= previous) && (future || inWeek <= today)) return { date: inWeek };
    }
    if (future) return { date: addDays(today, (target - weekdayIndex(today) + 7) % 7) };
    return { date: addDays(today, -((weekdayIndex(today) - target + 7) % 7)) };
  });

  matches.sort((a, b) => a.index - b.index);
  const state: { anchorMonday: string | null; previous: string | null } = { anchorMonday: null, previous: null };
  const out: ResolvedDate[] = [];
  for (const match of matches) {
    const result = match.resolve(state);
    if (!result) continue;
    if (result.anchorMonday) state.anchorMonday = result.anchorMonday;
    state.previous = result.date;
    if (!out.some((r) => r.phrase.toLowerCase() === match.phrase.toLowerCase() && r.date === result.date)) {
      out.push({ phrase: match.phrase, date: result.date, weekday: weekdayName(result.date) });
    }
  }
  return out;
}

/** Prompt lines that hand the computed dates to the model. Empty when nothing was found. */
export function describeResolvedDates(resolved: readonly ResolvedDate[]): string {
  if (!resolved.length) return '';
  return `Dates mentioned (calculated by the app; use these exact dates):\n${resolved
    .map((r) => `- "${r.phrase}" = ${r.weekday}, ${r.date}`)
    .join('\n')}`;
}

/**
 * Warns when a date in an AI suggestion is not one of the dates the user's own words point to.
 * Returns null when the date matches or nothing relative was said.
 */
export function checkSuggestedDate(date: string | null, resolved: readonly ResolvedDate[]): string | null {
  if (!date || !resolved.length || resolved.some((r) => r.date === date)) return null;
  const said = resolved.map((r) => `"${r.phrase}" is ${r.weekday}, ${formatDate(r.date)}`).join('; ');
  const gap = Math.min(...resolved.map((r) => Math.abs(daysBetween(r.date, date))));
  return `Check the date: the suggestion says ${weekdayName(date)}, ${formatDate(date)}, but ${said}${
    gap <= 7 ? '' : ' (more than a week apart)'
  }.`;
}
