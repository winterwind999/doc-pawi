import { MAX_TOOL_CALLS_PER_RESPONSE, TOOL_DEFINITIONS, validateToolCall } from '../ai/agent-tools';
import type { PrefixRequest } from '../ai/llama-engine';
import type { CompletionRequest, CompletionResult, ModelRunMetadata } from '../ai/llm-types';
import { buildChatMessages, CHAT_SYSTEM_PROMPT } from '../ai/prompts';
import { retrieveHealthContext } from '../ai/retrieval';
import { asksAboutDoseChange, assessMessage } from '../ai/safety';
import {
  insertMessage,
  listMessages,
  renameConversation,
  updateMessage,
} from '../db/repositories/conversations';
import { insertProposal } from '../db/repositories/proposals';
import type { Db } from '../db/types';

export type CompleteFn = (request: CompletionRequest) => Promise<CompletionResult>;

/**
 * The static start of every chat prompt (system prompt + tool definitions, no personal data).
 * Prefilling it when a chat opens lets the first answer skip most of the prompt processing. The
 * empty user turn only makes the template render a complete conversation; it is not reused.
 */
export const CHAT_PREFIX: PrefixRequest = {
  messages: [
    { role: 'system', content: CHAT_SYSTEM_PROMPT },
    { role: 'user', content: '' },
  ],
  tools: TOOL_DEFINITIONS,
};

export function titleFromMessage(text: string) {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 42 ? `${clean.slice(0, 41)}…` : clean || 'Conversation';
}

/**
 * Handles one user turn end-to-end:
 * 1. persist the user message;
 * 2. retrieve relevant local records (read-only);
 * 3. run the local model with streaming and the proposal tools;
 * 4. validate tool calls with Zod and store them as *pending* proposals (nothing is written to
 *    records until the user confirms);
 * 5. persist the assistant message with model metadata (model, timings, sources).
 * Generation that is stopped keeps the partial text with status `stopped`; failures are stored
 * with status `error` and an honest message. Nothing falls back to a cloud service.
 */
export async function sendChatMessage(args: {
  db: Db;
  profileId: string;
  conversationId: string;
  text: string;
  complete: CompleteFn;
  model: Pick<ModelRunMetadata, 'modelId' | 'modelFile' | 'engine'>;
  /** A processed document the user attached; its text is given to the model, not shown in the bubble. */
  attachment?: { documentId: string; name: string; text: string } | null;
  onAssistantStarted?: (messageId: string) => void;
  onText?: (text: string) => void;
}) {
  const { db, profileId, conversationId, text, attachment } = args;
  const question = text.trim();
  if (!question) return null;

  const history = await listMessages(db, conversationId);
  await insertMessage(db, {
    conversationId,
    role: 'user',
    content: question,
    attachmentDocumentId: attachment?.documentId ?? null,
  });
  if (history.length === 0) await renameConversation(db, conversationId, titleFromMessage(question));

  const safety = assessMessage(question);
  const doseChangeQuestion = asksAboutDoseChange(question);
  const retrieval = await retrieveHealthContext(db, profileId, question);
  if (attachment) {
    const excerpt = attachment.text.length > 1500 ? `${attachment.text.slice(0, 1500)}…` : attachment.text;
    retrieval.contextText = `Attached document "${attachment.name}" (on-device OCR text or summary; may contain recognition errors):\n${excerpt}\n\n${retrieval.contextText}`;
    retrieval.sources.unshift({ type: 'document', id: attachment.documentId, label: attachment.name });
  }

  const baseMeta: ModelRunMetadata = {
    ...args.model,
    timings: null,
    stopReason: 'other',
    sources: retrieval.sources,
    emergency: safety.emergency,
    doseChangeQuestion,
  };
  const assistant = await insertMessage(db, {
    conversationId,
    role: 'assistant',
    content: '',
    status: 'generating',
    modelMetadata: baseMeta,
  });
  args.onAssistantStarted?.(assistant.id);

  let partial = '';
  let result: CompletionResult;
  try {
    result = await args.complete({
      messages: buildChatMessages({ history, question, retrieval }),
      maxTokens: 400,
      temperature: 0.7,
      tools: TOOL_DEFINITIONS,
      onText: (t) => {
        partial = t;
        args.onText?.(t);
      },
    });
  } catch (error) {
    await updateMessage(db, assistant.id, {
      content: partial
        ? partial
        : `The local AI model could not answer: ${(error as Error).message}`,
      status: partial ? 'stopped' : 'error',
      modelMetadata: baseMeta,
    });
    return { assistantId: assistant.id, status: 'error' as const };
  }

  const outcomes = result.toolCalls.slice(0, MAX_TOOL_CALLS_PER_RESPONSE).map((call) => validateToolCall(call));
  const stopped = result.stopReason === 'stopped';
  let content = result.text.trim();
  if (!content && outcomes.some((o) => o.ok)) {
    content = 'I prepared a suggestion based on what you told me. Please review it below — nothing is saved until you confirm.';
  }
  if (!content && !stopped) content = 'I could not produce an answer. Please try rephrasing your question.';

  const meta: ModelRunMetadata = {
    ...baseMeta,
    timings: result.timings,
    stopReason: result.stopReason,
    toolCalls: outcomes.map((o) => (o.ok ? { name: o.name, ok: true } : { name: o.name, ok: false, error: o.error })),
  };
  await db.transaction(async (tx) => {
    await updateMessage(tx, assistant.id, { content, status: stopped ? 'stopped' : 'complete', modelMetadata: meta });
    if (stopped) return;
    for (const outcome of outcomes) {
      if (!outcome.ok) continue;
      await insertProposal(tx, {
        profileId,
        origin: 'chat',
        proposalType: outcome.payload.kind,
        payload: { ...outcome.payload, warnings: outcome.warnings },
        conversationId,
        messageId: assistant.id,
      });
    }
  });
  return { assistantId: assistant.id, status: stopped ? ('stopped' as const) : ('complete' as const) };
}
