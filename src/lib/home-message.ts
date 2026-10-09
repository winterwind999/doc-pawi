import { formatDate, relativeDay } from './dates';
import type { DoseSlot } from './db/repositories/medications';
import type { ActivitySummary } from './db/repositories/stats';
import type { UpcomingEvent } from './db/repositories/treatments';

/**
 * Builds the mascot's contextual message strictly from saved data: counts, dates, and titles.
 * It never infers symptoms, progress, or anything clinical.
 */
export function buildHomeMessage(args: {
  slots: DoseSlot[];
  upcoming: UpcomingEvent[];
  overdue: UpcomingEvent[];
  summary: ActivitySummary;
  today: string;
}): string {
  const { slots, upcoming, overdue, summary, today } = args;
  const due = slots.filter((s) => s.state === 'due').length;
  const later = slots.filter((s) => s.state === 'upcoming').length;
  const parts: string[] = [];

  if (due > 0) {
    parts.push(`You have ${due} dose${due === 1 ? '' : 's'} due today that ${due === 1 ? 'is' : 'are'} not recorded yet.`);
  } else if (slots.length > 0 && later === 0) {
    parts.push('All of today’s scheduled doses are recorded.');
  } else if (later > 0) {
    parts.push(`${later} more dose${later === 1 ? '' : 's'} scheduled later today.`);
  }

  if (overdue.length > 0) {
    const e = overdue[0];
    parts.push(`“${e.title}” was scheduled for ${formatDate(e.scheduled_date)} and is not marked completed.`);
  } else if (upcoming.length > 0) {
    const e = upcoming[0];
    parts.push(`Next recorded event: “${e.title}” ${relativeDay(e.scheduled_date!, today)} (${formatDate(e.scheduled_date)}).`);
  }

  if (summary.pendingProposals > 0) {
    parts.push(`${summary.pendingProposals} AI suggestion${summary.pendingProposals === 1 ? ' is' : 's are'} waiting for your review.`);
  }

  if (parts.length === 0) {
    const empty = summary.records + summary.activeMedications + summary.ongoingTreatments + summary.documents === 0;
    return empty
      ? 'Welcome! Add a record, import a medical document, or ask me a question to get started. Everything stays on this phone.'
      : 'Nothing is scheduled for today. Your records are stored securely on this phone.';
  }
  return parts.join(' ');
}
