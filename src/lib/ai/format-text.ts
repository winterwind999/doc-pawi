import { formatDate, isValidIsoDate } from '../dates';
import type { CompletionTimings } from './llm-types';

const ISO_DATE_IN_TEXT = /\b\d{4}-\d{2}-\d{2}\b/g;

/** Rewrites real `YYYY-MM-DD` dates in model text as "Apr 6, 2026"; anything else is untouched. */
export function humanizeDates(text: string) {
  return text.replace(ISO_DATE_IN_TEXT, (match) => (isValidIsoDate(match) ? formatDate(match) : match));
}

/**
 * One-line speed summary of a completion. When the whole prompt was already in llama.cpp's KV
 * cache (for example the same question asked again), no prompt time is reported.
 */
export function describeTimings(t: CompletionTimings) {
  const prompt =
    t.promptMs > 0 && t.promptTokensPerSecond > 0
      ? `Read ${t.promptTokens} prompt tokens at ${t.promptTokensPerSecond.toFixed(1)} tok/s`
      : 'Prompt was already in the model cache';
  return `${prompt} · wrote ${t.generatedTokens} tokens at ${t.generatedTokensPerSecond.toFixed(1)} tok/s`;
}

export interface TextSegment {
  text: string;
  bold: boolean;
}

/**
 * The local model answers in light Markdown. Chat bubbles show it as styled plain text:
 * `**bold**` and `# headings` become bold, list markers (`- `, `* `, `+ `) become bullets, and
 * ISO dates read "Apr 6, 2026". Everything else is shown exactly as written. Returns one segment
 * list per line.
 */
export function formatModelText(text: string): TextSegment[][] {
  return humanizeDates(text).split('\n').map((raw) => {
    let line = raw;
    const heading = /^\s{0,3}#{1,6}\s+(.*)$/.exec(line);
    if (heading) line = heading[1];
    line = line.replace(/^(\s*)[-*+]\s+/, '$1• ');
    return line
      .split('**')
      .map((part, i) => ({ text: part, bold: Boolean(heading) || i % 2 === 1 }))
      .filter((segment) => segment.text.length > 0);
  });
}
