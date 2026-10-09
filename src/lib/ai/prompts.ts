import { formatLongDate, todayLocal } from '../dates';
import type { MessageRow } from '../db/models';
import type { RetrievalResult } from './retrieval';

/**
 * Prompt construction. The system prompt is static so llama.cpp can reuse the KV cache for it
 * across turns; per-turn data (today's date, retrieved records) goes into the latest user turn.
 */
export const CHAT_SYSTEM_PROMPT = `You are Doc Pawi, a friendly health-information assistant that runs entirely on the user's phone. You are not a doctor.

Rules:
1. For questions about the user's own health, use ONLY the facts in the "Local records" section of their message. If the answer is not there, say it is not recorded in Doc Pawi. Never invent dates, results, vaccine brands, doctors, prescriptions, or treatments.
2. Do not diagnose, prescribe, or tell the user to start, stop, or change any medication or dose. Suggest asking their doctor or pharmacist.
3. If the user describes possible emergency symptoms (such as chest pain, trouble breathing, stroke signs, severe bleeding, or thoughts of self-harm), tell them to call 911 in the Philippines or their local emergency number right away.
4. When the user reports a new health event about themselves (a vaccine dose, test result, visit, diagnosis, or treatment session), call the matching tool with only the details they gave. Saving always needs the user's confirmation, so call it a suggestion.
5. Keep answers short (under 120 words), clear, and kind. Use plain language and simple lists when helpful.`;

const MAX_HISTORY_MESSAGES = 6;
const MAX_HISTORY_CHARS = 2400;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export function buildUserTurn(question: string, retrieval: RetrievalResult, now: Date = new Date()) {
  const records = retrieval.contextText.trim() || 'No records were retrieved.';
  return `Today is ${formatLongDate(now)} (${todayLocal(now)}).

Local records (from the user's encrypted Doc Pawi database):
${records}

User message: ${question}`;
}

/** Recent history as plain turns; earlier record context is not repeated to keep prompts small. */
export function buildHistory(messages: MessageRow[]): ChatMessage[] {
  const usable = messages.filter((m) => m.content.trim() && m.status !== 'error').slice(-MAX_HISTORY_MESSAGES);
  const out: ChatMessage[] = [];
  let budget = MAX_HISTORY_CHARS;
  for (let i = usable.length - 1; i >= 0; i--) {
    const content = usable[i].content.length > 600 ? `${usable[i].content.slice(0, 600)}…` : usable[i].content;
    if (content.length > budget) break;
    budget -= content.length;
    out.unshift({ role: usable[i].role, content });
  }
  // A conversation history must start with a user turn.
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

export function buildChatMessages(args: {
  history: MessageRow[];
  question: string;
  retrieval: RetrievalResult;
  now?: Date;
}): ChatMessage[] {
  return [
    { role: 'system', content: CHAT_SYSTEM_PROMPT },
    ...buildHistory(args.history),
    { role: 'user', content: buildUserTurn(args.question, args.retrieval, args.now) },
  ];
}

export const EXTRACTION_SYSTEM_PROMPT = `You extract information from medical documents for a personal health record. Output JSON only.
Rules:
- Copy values exactly as written in the document text. Do not guess, convert units, or fill in missing values.
- Use an empty string or empty list when something is not in the text.
- document_date: the main date of the report (collection, visit, or issue date) as YYYY-MM-DD, or "" if absent.
- flag: use "high"/"low"/"abnormal" only when the document marks it (e.g. H, L, HIGH, LOW, *), otherwise "".
- summary: 2–4 plain-language sentences describing what the document contains. Do not diagnose or give advice.`;

const MAX_DOCUMENT_CHARS = 6000;

export function buildExtractionMessages(ocrText: string): ChatMessage[] {
  const text = ocrText.length > MAX_DOCUMENT_CHARS ? `${ocrText.slice(0, MAX_DOCUMENT_CHARS)}\n…(truncated)` : ocrText;
  return [
    { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
    { role: 'user', content: `Document text (from on-device OCR; may contain recognition errors):\n"""\n${text}\n"""` },
  ];
}

export const documentTruncated = (ocrText: string) => ocrText.length > MAX_DOCUMENT_CHARS;
