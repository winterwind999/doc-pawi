import { create } from 'zustand';

/**
 * Text of the assistant message currently being generated. Kept outside the database so
 * streaming tokens re-render only the live bubble; the final text is persisted once at the end.
 * Updates are coalesced to a few renders per second so the JS and UI threads leave the CPU cores
 * to the on-device model.
 */
interface ChatStreamState {
  conversationId: string | null;
  messageId: string | null;
  text: string;
  start(conversationId: string): void;
  attach(messageId: string): void;
  update(text: string): void;
  finish(): void;
}

const FLUSH_INTERVAL_MS = 120;
let pendingText: string | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function cancelFlush() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  pendingText = null;
}

export const useChatStream = create<ChatStreamState>()((set) => ({
  conversationId: null,
  messageId: null,
  text: '',
  start: (conversationId) => {
    cancelFlush();
    set({ conversationId, messageId: null, text: '' });
  },
  attach: (messageId) => set({ messageId }),
  update: (text) => {
    pendingText = text;
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      if (pendingText !== null) set({ text: pendingText });
      pendingText = null;
    }, FLUSH_INTERVAL_MS);
  },
  finish: () => {
    cancelFlush();
    set({ conversationId: null, messageId: null, text: '' });
  },
}));
