import { checkSuggestedDate, describeResolvedDates, resolveRelativeDates } from '@/lib/ai/relative-dates';

// Saturday, Oct 10, 2026 — the day of the on-device report. Weeks start on Monday.
const TODAY = '2026-10-10';
const dates = (message: string) => resolveRelativeDates(message, TODAY).map((r) => `${r.phrase} = ${r.weekday} ${r.date}`);

describe('relative date resolution', () => {
  it('keeps a bare weekday in the week the message anchored (the rabies report)', () => {
    expect(dates('last week Monday i also had my first rabies shot and my 2nd was on thursday')).toEqual([
      'last week Monday = Monday 2026-09-28',
      'thursday = Thursday 2026-10-01',
    ]);
    expect(dates('last week on monday')).toEqual(['last week on monday = Monday 2026-09-28']);
    expect(dates('monday of last week')).toEqual(['monday of last week = Monday 2026-09-28']);
    expect(dates("this week's tuesday")).toEqual(["this week's tuesday = Tuesday 2026-10-06"]);
  });

  it('does not let a later weekday go back before the one said first', () => {
    expect(dates('last week friday I got one shot and on monday another')).toEqual([
      'last week friday = Friday 2026-10-02',
      'monday = Monday 2026-10-05',
    ]);
  });

  it('resolves days relative to today', () => {
    expect(dates('I had a fever the day before yesterday and saw a doctor yesterday')).toEqual([
      'the day before yesterday = Thursday 2026-10-08',
      'yesterday = Friday 2026-10-09',
    ]);
    expect(dates('I got my flu shot today')).toEqual(['today = Saturday 2026-10-10']);
    expect(dates('3 days ago')).toEqual(['3 days ago = Wednesday 2026-10-07']);
    expect(dates('two weeks ago')).toEqual(['two weeks ago = Saturday 2026-09-26']);
    expect(dates('a week ago')).toEqual(['a week ago = Saturday 2026-10-03']);
  });

  it('reads "last" and "next" weekdays and bare weekdays by tense', () => {
    expect(dates('last thursday')).toEqual(['last thursday = Thursday 2026-10-08']);
    expect(dates('next monday')).toEqual(['next monday = Monday 2026-10-12']);
    expect(dates('I had a fever on wednesday')).toEqual(['wednesday = Wednesday 2026-10-07']);
    expect(dates('My follow-up appointment is on friday')).toEqual(['friday = Friday 2026-10-16']);
  });

  it('ignores routines and text without relative dates', () => {
    expect(dates('I take it every monday')).toEqual([]);
    expect(dates('What medications am I taking?')).toEqual([]);
  });

  it('hands the dates to the model and flags suggestions that disagree', () => {
    const resolved = resolveRelativeDates('last week Monday i also had my first rabies shot and my 2nd was on thursday', TODAY);
    expect(describeResolvedDates([])).toBe('');
    expect(describeResolvedDates(resolved)).toContain('- "thursday" = Thursday, 2026-10-01');

    expect(checkSuggestedDate('2026-10-01', resolved)).toBeNull();
    expect(checkSuggestedDate(null, resolved)).toBeNull();
    expect(checkSuggestedDate('2026-10-04', [])).toBeNull();
    const warning = checkSuggestedDate('2026-10-04', resolved);
    expect(warning).toContain('Sunday, Oct 4, 2026');
    expect(warning).toContain('"thursday" is Thursday, Oct 1, 2026');
  });
});
