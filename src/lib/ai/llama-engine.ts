import { BuildInfo, initLlama, type CompletionParams, type LlamaContext, type TokenData } from 'llama.rn';

import { AsyncLock } from '../db/database';
import type { RawToolCall } from './agent-tools';
import type { CompletionRequest, CompletionResult, CompletionTimings } from './llm-types';
import { ModelNotReadyError } from './llm-types';

/**
 * Thin adapter over llama.rn (llama.cpp). Responsibilities:
 * - one context at a time, CPU only (`n_gpu_layers: 0`), explicit `n_ctx`;
 * - every call passes the full sampling set (llama.rn keeps omitted params from the previous call);
 * - operations are serialized because a llama.rn context rejects concurrent work ("Context is busy");
 * - llama.rn reuses the KV cache for the longest common token prefix with the previous call, so
 *   `prefill` can evaluate a static prefix (system prompt + tools) before the user asks anything.
 */
export interface EngineInfo {
  modelDescription: string;
  parameterCount: number;
  modelSizeBytes: number;
  contextTokens: number;
  kvCacheType: string;
  /** CPU threads requested (null = llama.rn default: up to 4 of the fastest cores). */
  threads: number | null;
  nativeLibrary: string | null;
  gpu: boolean;
  reasonNoGpu: string;
  systemInfo: string;
  llamaCppBuild: string;
  llamaCppCommit: string;
  loadMs: number;
}

export const ENGINE_NAME = 'llama.cpp via llama.rn 0.12.9';
export const KV_CACHE_TYPE = 'q8_0';

/**
 * Workaround for llama.rn 0.12.9: `completion()` hands `parallel_tool_calls` to native code as the
 * string "true" (via JSON.stringify), but the native side reads only booleans, so every turn was
 * limited to one tool call ("my first shot … my 2nd …" produced one suggestion). llama.rn picks its
 * JSI functions up from `global` once, when first used; this accessor wraps the chat-formatting
 * function as it is installed so the flag arrives as a boolean. If llama.rn changes how it installs
 * the function, the wrapper is simply never used and behaviour falls back to one call per turn.
 */
function passParallelToolCallsAsBoolean() {
  const key = 'llamaGetFormattedChat';
  const g = globalThis as unknown as Record<string, unknown>;
  if (Object.getOwnPropertyDescriptor(g, key)) return;
  let installed: unknown;
  Object.defineProperty(g, key, {
    configurable: true,
    get: () => installed,
    set: (fn: unknown) => {
      installed =
        typeof fn === 'function'
          ? (...args: unknown[]) => {
              const options = args[3] as { parallel_tool_calls?: unknown } | undefined;
              if (options && typeof options.parallel_tool_calls === 'string') {
                options.parallel_tool_calls = options.parallel_tool_calls === 'true';
              }
              return (fn as (...a: unknown[]) => unknown)(...args);
            }
          : fn;
    },
  });
}
passParallelToolCallsAsBoolean();

export interface BenchMeasurement {
  threads: number;
  promptTokens: number;
  promptTokensPerSecond: number;
  generatedTokens: number;
  generatedTokensPerSecond: number;
}

const THINK_BLOCK = /<think>[\s\S]*?(<\/think>|$)/g;
const TOOL_BLOCK = /<tool_call>[\s\S]*?(<\/tool_call>|$)/g;

/** Removes reasoning and tool-call markup from raw model text (used when parsing was skipped). */
export function cleanRawText(text: string) {
  return text.replace(THINK_BLOCK, '').replace(TOOL_BLOCK, '').replace(/<\|im_end\|>/g, '').trim();
}

export type PrefixRequest = Pick<CompletionRequest, 'messages' | 'tools'>;

/** Identifies the static start of a prompt: the system message plus the tool definitions. */
function prefixKey(request: PrefixRequest) {
  const first = request.messages[0];
  const system = first?.role === 'system' ? first.content : '';
  return `${system}\u0000${request.tools?.length ? JSON.stringify(request.tools) : ''}`;
}

const stoppedResult = (): CompletionResult => ({ text: '', toolCalls: [], timings: null, stopReason: 'stopped' });

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
  /** `prefixKey` of the prompt the KV cache currently starts with, when known. */
  private cachedPrefix: string | null = null;
  /** Incremented by `stop()` so that calls still waiting for the lock are cancelled as well. */
  private stopEpoch = 0;
  /** True while a native completion or benchmark is running. */
  private running = false;

  private async native<T>(work: () => Promise<T>): Promise<T> {
    this.running = true;
    try {
      return await work();
    } finally {
      this.running = false;
    }
  }

  get isLoaded() {
    return this.context !== null;
  }

  get engineInfo() {
    return this.info;
  }

  get modelPath() {
    return this.loadedPath;
  }

  load(
    path: string,
    contextTokens: number,
    threads: number | null,
    onProgress?: (percent: number) => void,
  ): Promise<EngineInfo> {
    return this.lock.run(async () => {
      if (this.context && this.loadedPath === path && this.info?.threads === threads) return this.info!;
      if (this.context) await this.releaseUnlocked();
      const started = Date.now();
      const context = await initLlama(
        {
          model: path,
          n_ctx: contextTokens,
          n_batch: 512,
          n_ubatch: 512,
          ...(threads ? { n_threads: threads } : {}),
          n_gpu_layers: 0,
          use_mlock: false,
          use_mmap: true,
          ctx_shift: false,
          // 8-bit KV cache: half the memory of f16 and faster generation deep into a prompt, which
          // is where chat runs (measured on a Helio G85: 2.7 -> 3.6 tok/s at ~1k tokens). A
          // quantized V cache needs flash attention, which llama.cpp then enables automatically.
          cache_type_k: KV_CACHE_TYPE,
          cache_type_v: KV_CACHE_TYPE,
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
        kvCacheType: KV_CACHE_TYPE,
        threads,
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
    this.cachedPrefix = null;
    if (ctx) await ctx.release();
  }

  release(): Promise<void> {
    // Interrupt first so a long generation does not delay unloading.
    this.stop();
    return this.lock.run(() => this.releaseUnlocked());
  }

  /**
   * Requests the running completion to stop; the pending `complete()` resolves with stopReason
   * 'stopped'. Calls queued behind it (for example a send made during a prefill) are cancelled too.
   */
  stop() {
    this.stopEpoch++;
    // llama.rn keeps the "interrupted" flag until the next completion starts, so only signal
    // native code when something is actually running (an idle stop would spoil a later benchmark).
    if (!this.running) return;
    try {
      void this.context?.stopCompletion();
    } catch {
      // Nothing is running.
    }
  }

  /** llama.cpp's built-in benchmark: prompt-processing and generation speed in tokens/second. */
  bench(promptTokens = 128, generatedTokens = 32): Promise<BenchMeasurement> {
    return this.lock.run(async () => {
      const ctx = this.context;
      if (!ctx) throw new ModelNotReadyError();
      const r = await this.native(async () => {
        // llama.rn's benchmark skips every run while a previous stop's "interrupted" flag is still
        // set; any completion clears it, so run a one-token completion first. Its warm-up decode
        // also starts at position 0 and fails if the KV cache still holds a prompt, so clear it.
        await ctx.completion(this.buildParams({ messages: [{ role: 'user', content: 'Hi' }], maxTokens: 1, temperature: 0 }));
        await ctx.clearCache(false);
        return ctx.bench(promptTokens, generatedTokens, 1, 1);
      });
      // The benchmark reuses the KV cache, so clear it to avoid stale prefix reuse afterwards.
      await ctx.clearCache(false);
      this.cachedPrefix = null;
      if (!(r.speedPp > 0 && r.speedTg > 0)) throw new Error('The benchmark was interrupted. Please run it again.');
      return {
        threads: r.nThreads,
        promptTokens: r.pp,
        promptTokensPerSecond: r.speedPp,
        generatedTokens: r.tg,
        generatedTokensPerSecond: r.speedTg,
      };
    });
  }

  clearCache(): Promise<void> {
    return this.lock.run(async () => {
      await this.context?.clearCache(false);
      this.cachedPrefix = null;
    });
  }

  private buildParams(request: CompletionRequest): CompletionParams {
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
      // Several events in one message need several tool calls (see passParallelToolCallsAsBoolean).
      params.parallel_tool_calls = true as unknown as object;
    }
    if (request.jsonSchema) {
      params.response_format = { type: 'json_schema', json_schema: { strict: true, schema: request.jsonSchema } };
    }
    return params;
  }

  /**
   * Evaluates a prompt's static prefix (system prompt + tools) ahead of time, so the next
   * completion that starts with the same prefix only processes the new part. Does nothing if the
   * KV cache already starts with this prefix. Resolves to true when work was done.
   */
  prefill(request: PrefixRequest): Promise<boolean> {
    const epoch = this.stopEpoch;
    return this.lock.run(async () => {
      const ctx = this.context;
      const key = prefixKey(request);
      if (!ctx || epoch !== this.stopEpoch || this.cachedPrefix === key) return false;
      // n_predict 1: llama.rn decodes the prompt, samples one token, and stops before decoding it,
      // so the cache holds only the prompt. (With 0, llama.cpp would leave its perf counters open
      // and bill the prefill and the idle time after it to the next answer's prompt timings.)
      const result = await this.native(() => ctx.completion(this.buildParams({ ...request, maxTokens: 1 })));
      this.cachedPrefix = result.interrupted ? null : key;
      return !result.interrupted;
    });
  }

  complete(request: CompletionRequest): Promise<CompletionResult> {
    const epoch = this.stopEpoch;
    return this.lock.run(async () => {
      const ctx = this.context;
      if (!ctx) throw new ModelNotReadyError();
      if (epoch !== this.stopEpoch) return stoppedResult();
      const params = this.buildParams(request);
      // Unknown until this call finishes; an interrupted prompt may be only partly in the cache.
      this.cachedPrefix = null;
      let lastEmitted = '';
      const result = await this.native(() =>
        ctx.completion(params, (data: TokenData) => {
          const visible = data.content ?? '';
          if (request.onText && visible !== lastEmitted) {
            lastEmitted = visible;
            request.onText(visible);
          }
        }),
      );
      const interrupted = Boolean(result.interrupted);
      if (!interrupted) this.cachedPrefix = prefixKey(request);
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
