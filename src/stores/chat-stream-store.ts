import { create } from 'zustand';

/**
 * Text of the assistant message currently being generated. Kept outside the database so
 * streaming tokens re-render only the live bubble; the final text is persisted once at the end.
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

export const useChatStream = create<ChatStreamState>()((set) => ({
  conversationId: null,
  messageId: null,
  text: '',
  start: (conversationId) => set({ conversationId, messageId: null, text: '' }),
  attach: (messageId) => set({ messageId }),
  update: (text) => set({ text }),
  finish: () => set({ conversationId: null, messageId: null, text: '' }),
}));
