import { LlamaEngine } from '@/lib/ai/llama-engine';
import { CHAT_PREFIX } from '@/lib/services/chat-service';

/** A fake llama.rn context: only the calls the engine adapter makes. */
const mockCompletion = jest.fn();
const mockStopCompletion = jest.fn();
const mockClearCache = jest.fn();
const mockBench = jest.fn();

jest.mock('llama.rn', () => ({
  BuildInfo: { number: 'test', commit: 'test' },
  initLlama: jest.fn(async () => ({
    model: { desc: 'fake model', nParams: 1, size: 1 },
    androidLib: null,
    gpu: false,
    reasonNoGPU: 'test',
    systemInfo: 'test',
    completion: (...args: unknown[]) => mockCompletion(...args),
    stopCompletion: (...args: unknown[]) => mockStopCompletion(...args),
    clearCache: (...args: unknown[]) => mockClearCache(...args),
    bench: (...args: unknown[]) => mockBench(...args),
    release: async () => undefined,
  })),
}));

const finished = { text: 'Hi', content: 'Hi', tool_calls: [], interrupted: false, stopped_eos: true, timings: {} };

const chatTurn = (question: string) => ({
  messages: [CHAT_PREFIX.messages[0], { role: 'user' as const, content: question }],
  tools: CHAT_PREFIX.tools,
  maxTokens: 50,
});

async function loadedEngine() {
  const engine = new LlamaEngine();
  await engine.load('/models/test.gguf', 4096, null);
  return engine;
}

beforeEach(() => {
  mockCompletion.mockReset().mockResolvedValue(finished);
  mockStopCompletion.mockReset();
  mockClearCache.mockReset();
  mockBench.mockReset();
});

describe('LlamaEngine prompt-prefix cache', () => {
  it('prefills the static chat prefix with a one-token run, then skips while the cache holds it', async () => {
    const engine = await loadedEngine();

    await expect(engine.prefill(CHAT_PREFIX)).resolves.toBe(true);
    expect(mockCompletion).toHaveBeenCalledTimes(1);
    expect(mockCompletion.mock.calls[0][0]).toMatchObject({ n_predict: 1, tool_choice: 'auto', enable_thinking: false });
    await expect(engine.prefill(CHAT_PREFIX)).resolves.toBe(false);

    // A chat answer starts with the same system prompt and tools, so the prefix stays cached.
    await engine.complete(chatTurn('When was my last dose?'));
    await expect(engine.prefill(CHAT_PREFIX)).resolves.toBe(false);
    expect(mockCompletion).toHaveBeenCalledTimes(2);
  });

  it('prefills again after another prompt, a cache clear, or an interrupted answer', async () => {
    const engine = await loadedEngine();
    await engine.prefill(CHAT_PREFIX);

    await engine.complete({ messages: [{ role: 'system', content: 'Extract JSON.' }, { role: 'user', content: 'Doc' }], maxTokens: 50 });
    await expect(engine.prefill(CHAT_PREFIX)).resolves.toBe(true);

    await engine.clearCache();
    await expect(engine.prefill(CHAT_PREFIX)).resolves.toBe(true);

    mockCompletion.mockResolvedValueOnce({ ...finished, interrupted: true });
    await engine.complete(chatTurn('Stop me'));
    await expect(engine.prefill(CHAT_PREFIX)).resolves.toBe(true);
  });

  it('cancels an answer that was waiting behind a prefill when the user taps Stop', async () => {
    const engine = await loadedEngine();
    let finishPrefill: ((value: unknown) => void) | undefined;
    mockCompletion.mockImplementationOnce(() => new Promise((resolve) => (finishPrefill = resolve)));

    const prefill = engine.prefill(CHAT_PREFIX);
    const answer = engine.complete(chatTurn('Question sent during the prefill'));
    while (!finishPrefill) await new Promise((r) => setTimeout(r, 0));

    engine.stop();
    expect(mockStopCompletion).toHaveBeenCalledTimes(1);
    finishPrefill({ ...finished, interrupted: true });

    await expect(prefill).resolves.toBe(false);
    await expect(answer).resolves.toMatchObject({ text: '', stopReason: 'stopped', toolCalls: [] });
    expect(mockCompletion).toHaveBeenCalledTimes(1);

    // Later requests run normally.
    await expect(engine.complete(chatTurn('Next question'))).resolves.toMatchObject({ text: 'Hi', stopReason: 'eos' });
  });
});

describe('LlamaEngine stop and benchmark', () => {
  it('does not signal native code when nothing is running', async () => {
    const engine = await loadedEngine();
    engine.stop();
    expect(mockStopCompletion).not.toHaveBeenCalled();
    // A stop while idle does not cancel the next request either.
    await expect(engine.complete(chatTurn('After an idle stop'))).resolves.toMatchObject({ text: 'Hi' });
  });

  it('clears a stale stop before benchmarking and rejects an interrupted benchmark', async () => {
    const engine = await loadedEngine();
    mockBench.mockResolvedValueOnce({ nThreads: 4, pp: 128, speedPp: 16.7, tg: 32, speedTg: 5.5 });
    await expect(engine.bench()).resolves.toEqual({
      threads: 4,
      promptTokens: 128,
      promptTokensPerSecond: 16.7,
      generatedTokens: 32,
      generatedTokensPerSecond: 5.5,
    });
    expect(mockCompletion).toHaveBeenCalledTimes(1);
    // Order: one-token reset run, cache clear, benchmark, cache clear.
    expect(mockCompletion.mock.invocationCallOrder[0]).toBeLessThan(mockClearCache.mock.invocationCallOrder[0]);
    expect(mockClearCache.mock.invocationCallOrder[0]).toBeLessThan(mockBench.mock.invocationCallOrder[0]);
    expect(mockClearCache).toHaveBeenCalledTimes(2);

    mockBench.mockResolvedValueOnce({ nThreads: 4, pp: 128, speedPp: 0, tg: 32, speedTg: 0 });
    await expect(engine.bench()).rejects.toThrow('interrupted');
  });
});