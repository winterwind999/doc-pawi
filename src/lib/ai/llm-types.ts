import type { RawToolCall } from './agent-tools';
import type { ChatMessage } from './prompts';

/** Engine-neutral completion contract implemented by the llama.rn adapter (llama-engine.ts). */
export interface CompletionRequest {
  messages: ChatMessage[];
  maxTokens: number;
  temperature?: number;
  /** Constrain output to this JSON schema (grammar-constrained decoding). */
  jsonSchema?: object;
  /** OpenAI-style tool definitions the model may call. */
  tools?: readonly object[];
  /** Receives the accumulated visible text while streaming. */
  onText?: (text: string) => void;
}

export interface CompletionTimings {
  promptTokens: number;
  promptMs: number;
  promptTokensPerSecond: number;
  generatedTokens: number;
  generationMs: number;
  generatedTokensPerSecond: number;
}

export interface CompletionResult {
  /** Final visible text (tool-call markup and reasoning removed). */
  text: string;
  toolCalls: RawToolCall[];
  timings: CompletionTimings | null;
  stopReason: 'eos' | 'length' | 'stopped' | 'other';
}

export interface ModelRunMetadata {
  modelId: string;
  modelFile: string;
  engine: string;
  timings: CompletionTimings | null;
  stopReason: CompletionResult['stopReason'];
  /** Local records used as context (chat only). */
  sources?: { type: string; id: string; label: string }[];
  toolCalls?: { name: string; ok: boolean; error?: string }[];
  emergency?: boolean;
  doseChangeQuestion?: boolean;
}

export class ModelNotReadyError extends Error {
  constructor(message = 'The local AI model is not loaded. Open Settings → AI model to install or load it.') {
    super(message);
  }
}

export class GenerationStoppedError extends Error {
  constructor() {
    super('Generation was stopped.');
  }
}
