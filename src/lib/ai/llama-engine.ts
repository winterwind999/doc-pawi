import { BuildInfo, initLlama, type CompletionParams, type LlamaContext, type TokenData } from 'llama.rn';

import { AsyncLock } from '../db/database';
import type { RawToolCall } from './agent-tools';
import type { CompletionRequest, CompletionResult, CompletionTimings } from './llm-types';
import { ModelNotReadyError } from './llm-types';

/**
 * Thin adapter over llama.rn (llama.cpp). Responsibilities:
 * - one context at a time, CPU only (`n_gpu_layers: 0`), explicit `n_ctx`;
 * - every call passes the full sampling set (llama.rn keeps omitted params from the previous call);
 * - operations are serialized because a llama.rn context rejects concurrent work ("Context is busy").
 */
export interface EngineInfo {
  modelDescription: string;
  parameterCount: number;
  modelSizeBytes: number;
  contextTokens: number;
  nativeLibrary: string | null;
  gpu: boolean;
  reasonNoGpu: string;
  systemInfo: string;
  llamaCppBuild: string;
  llamaCppCommit: string;
  loadMs: number;
}

export const ENGINE_NAME = 'llama.cpp via llama.rn 0.12.9';

const THINK_BLOCK = /<think>[\s\S]*?(<\/think>|$)/g;
const TOOL_BLOCK = /<tool_call>[\s\S]*?(<\/tool_call>|$)/g;

/** Removes reasoning and tool-call markup from raw model text (used when parsing was skipped). */
export function cleanRawText(text: string) {
  return text.replace(THINK_BLOCK, '').replace(TOOL_BLOCK, '').replace(/<\|im_end\|>/g, '').trim();
}

function mapTimings(t: Partial<Record<string, number>> | undefined): CompletionTimings | null {
  if (!t) return null;
  return {
    promptTokens: t.prompt_n ?? 0,
    promptMs: t.prompt_ms ?? 0,
    promptTokensPerSecond: t.prompt_per_second ?? 0,
    generatedTokens: t.predicted_n ?? 0,
    generationMs: t.predicted_ms ?? 0,
    generatedTokensPerSecond: t.predicted_per_second ?? 0,
  };
}

export class LlamaEngine {
  private context: LlamaContext | null = null;
  private readonly lock = new AsyncLock();
  private info: EngineInfo | null = null;
  private loadedPath: string | null = null;

  get isLoaded() {
    return this.context !== null;
  }

  get engineInfo() {
    return this.info;
  }

  get modelPath() {
    return this.loadedPath;
  }

  load(path: string, contextTokens: number, onProgress?: (percent: number) => void): Promise<EngineInfo> {
    return this.lock.run(async () => {
      if (this.context && this.loadedPath === path) return this.info!;
      if (this.context) await this.releaseUnlocked();
      const started = Date.now();
      const context = await initLlama(
        {
          model: path,
          n_ctx: contextTokens,
          n_batch: 512,
          n_ubatch: 512,
          n_gpu_layers: 0,
          use_mlock: false,
          use_mmap: true,
          ctx_shift: false,
          cache_type_k: 'f16',
          cache_type_v: 'f16',
        },
        onProgress,
      );
      this.context = context;
      this.loadedPath = path;
      this.info = {
        modelDescription: context.model.desc,
        parameterCount: context.model.nParams,
        modelSizeBytes: context.model.size,
        contextTokens,
        nativeLibrary: context.androidLib ?? null,
        gpu: context.gpu,
        reasonNoGpu: context.reasonNoGPU,
        systemInfo: context.systemInfo,
        llamaCppBuild: BuildInfo.number,
        llamaCppCommit: BuildInfo.commit,
        loadMs: Date.now() - started,
      };
      return this.info;
    });
  }

  private async releaseUnlocked() {
    const ctx = this.context;
    this.context = null;
    this.info = null;
    this.loadedPath = null;
    if (ctx) await ctx.release();
  }

  release(): Promise<void> {
    // Interrupt first so a long generation does not delay unloading.
    this.stop();
    return this.lock.run(() => this.releaseUnlocked());
  }

  /** Requests the running completion to stop; the pending `complete()` resolves with stopReason 'stopped'. */
  stop() {
    try {
      void this.context?.stopCompletion();
    } catch {
      // Nothing is running.
    }
  }

  clearCache(): Promise<void> {
    return this.lock.run(async () => {
      await this.context?.clearCache(false);
    });
  }

  complete(request: CompletionRequest): Promise<CompletionResult> {
    return this.lock.run(async () => {
      const ctx = this.context;
      if (!ctx) throw new ModelNotReadyError();
      const params: CompletionParams = {
        messages: request.messages,
        jinja: true,
        enable_thinking: false,
        reasoning_format: 'auto',
        n_predict: request.maxTokens,
        temperature: request.temperature ?? 0.7,
        top_k: 20,
        top_p: 0.8,
        min_p: 0,
        penalty_last_n: 64,
        penalty_repeat: 1.0,
        penalty_freq: 0,
        penalty_present: request.jsonSchema ? 0 : 0.5,
        stop: [],
      };
      if (request.tools?.length) {
        params.tools = request.tools as object;
        params.tool_choice = 'auto';
      }
      if (request.jsonSchema) {
        params.response_format = { type: 'json_schema', json_schema: { strict: true, schema: request.jsonSchema } };
      }
      let lastEmitted = '';
      const result = await ctx.completion(params, (data: TokenData) => {
        const visible = data.content ?? '';
        if (request.onText && visible !== lastEmitted) {
          lastEmitted = visible;
          request.onText(visible);
        }
      });
      const interrupted = Boolean(result.interrupted);
      const parsed = (result.content ?? '').trim();
      const text = interrupted ? cleanRawText(result.text ?? lastEmitted) : parsed || cleanRawText(result.text ?? '');
      const toolCalls: RawToolCall[] = interrupted
        ? []
        : (result.tool_calls ?? []).map((call) => ({ name: call.function?.name ?? '', arguments: call.function?.arguments ?? '' }));
      return {
        text,
        toolCalls,
        timings: mapTimings(result.timings as unknown as Record<string, number>),
        stopReason: interrupted ? 'stopped' : result.stopped_eos ? 'eos' : result.stopped_limit || result.context_full ? 'length' : 'other',
      };
    });
  }
}

/** Single engine instance for the app process. */
export const llamaEngine = new LlamaEngine();
