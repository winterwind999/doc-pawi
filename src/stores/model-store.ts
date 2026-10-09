import { Directory, File, Paths, type DownloadTask } from 'expo-file-system';
import { create } from 'zustand';

import { ENGINE_NAME, llamaEngine, type BenchMeasurement, type EngineInfo, type PrefixRequest } from '@/lib/ai/llama-engine';
import type { CompletionRequest, CompletionResult, CompletionTimings } from '@/lib/ai/llm-types';
import { ModelNotReadyError } from '@/lib/ai/llm-types';
import {
  DEFAULT_MODEL_ID,
  downloadUrl,
  formatBytes,
  getModelSpec,
  MODEL_CATALOG,
  requiredFreeBytes,
  type ModelSpec,
} from '@/lib/ai/model-catalog';
import { DocPawiNative, toNativePath } from '@/lib/native';

/**
 * Model lifecycle state. Models are device-level files shared by all local profiles; they contain
 * no personal data. A model is only loadable after its size and SHA-256 match the pinned catalog.
 */
export interface ModelFileState {
  exists: boolean;
  sizeOnDisk: number;
  verified: boolean;
  verifiedAt: string | null;
}

export interface DownloadState {
  modelId: string;
  phase: 'active' | 'paused' | 'verifying';
  bytesWritten: number;
  totalBytes: number;
  bytesPerSecond: number;
}

export type LoadState = 'unloaded' | 'loading' | 'ready' | 'error';
export type ModelJob = 'chat' | 'document' | 'test';

export interface TestRun {
  text: string;
  timings: CompletionTimings | null;
  at: string;
}

interface Manifest {
  v: 1;
  selectedModelId: string;
  verified: Record<string, { sha256: string; sizeBytes: number; verifiedAt: string }>;
  /** CPU threads for inference; null = llama.rn default. Device-level performance setting. */
  threads?: number | null;
}

interface ModelStore {
  initialized: boolean;
  selectedModelId: string;
  files: Record<string, ModelFileState>;
  download: DownloadState | null;
  loadState: LoadState;
  loadProgress: number;
  loadedModelId: string | null;
  engineInfo: EngineInfo | null;
  activeJob: ModelJob | null;
  error: string | null;
  lastTest: TestRun | null;
  threads: number | null;
  lastBench: (BenchMeasurement & { at: string }) | null;
  setThreads(threads: number | null): Promise<void>;
  runBenchmark(): Promise<BenchMeasurement>;

  refresh(): Promise<void>;
  selectModel(modelId: string): Promise<void>;
  startDownload(modelId: string): Promise<void>;
  pauseDownload(): Promise<void>;
  resumeDownload(): Promise<void>;
  cancelDownload(): Promise<void>;
  verify(modelId: string): Promise<boolean>;
  load(modelId?: string): Promise<EngineInfo>;
  unload(): Promise<void>;
  deleteModel(modelId: string): Promise<void>;
  complete(job: ModelJob, request: CompletionRequest): Promise<CompletionResult>;
  prefill(request: PrefixRequest): Promise<void>;
  stop(): void;
  runTestPrompt(): Promise<TestRun>;
  clearError(): void;
}

const modelsDir = () => new Directory(Paths.document, 'models');
const modelFile = (spec: ModelSpec) => new File(modelsDir(), spec.fileName);
const manifestFile = () => new File(modelsDir(), 'manifest.json');

async function readManifest(): Promise<Manifest> {
  try {
    const file = manifestFile();
    if (file.exists) {
      const parsed = JSON.parse(await file.text()) as Manifest;
      if (parsed.v === 1 && parsed.verified) return parsed;
    }
  } catch {
    // Fall through to defaults.
  }
  return { v: 1, selectedModelId: DEFAULT_MODEL_ID, verified: {} };
}

function writeManifest(manifest: Manifest) {
  const dir = modelsDir();
  dir.create({ intermediates: true, idempotent: true });
  const file = manifestFile();
  if (!file.exists) file.create();
  file.write(JSON.stringify(manifest));
}

let task: DownloadTask | null = null;
let lastProgressAt = 0;
let speedSample = { at: 0, bytes: 0 };

export const useModelStore = create<ModelStore>()((set, get) => ({
  initialized: false,
  selectedModelId: DEFAULT_MODEL_ID,
  files: {},
  download: null,
  loadState: 'unloaded',
  loadProgress: 0,
  loadedModelId: null,
  engineInfo: null,
  activeJob: null,
  error: null,
  lastTest: null,
  threads: null,
  lastBench: null,

  async refresh() {
    const manifest = await readManifest();
    const files: Record<string, ModelFileState> = {};
    for (const spec of MODEL_CATALOG) {
      const file = modelFile(spec);
      const exists = file.exists;
      const size = exists ? (file.size ?? 0) : 0;
      const record = manifest.verified[spec.id];
      const verified = Boolean(exists && record && record.sha256 === spec.sha256 && size === spec.sizeBytes);
      files[spec.id] = { exists, sizeOnDisk: size, verified, verifiedAt: verified ? record!.verifiedAt : null };
    }
    const selected = getModelSpec(manifest.selectedModelId)?.id ?? DEFAULT_MODEL_ID;
    set({ files, selectedModelId: selected, threads: manifest.threads ?? null, initialized: true });
  },

  async setThreads(threads) {
    const manifest = await readManifest();
    writeManifest({ ...manifest, threads });
    set({ threads });
    // Thread count is fixed when the context is created, so reload a loaded model.
    if (get().loadState === 'ready') await get().load();
  },

  async runBenchmark() {
    if (get().activeJob) throw new Error('The model is busy. Try again when the current task finishes.');
    if (get().loadState !== 'ready') await get().load();
    set({ activeJob: 'test' });
    try {
      const result = await llamaEngine.bench(128, 32);
      set({ lastBench: { ...result, at: new Date().toISOString() } });
      return result;
    } finally {
      set({ activeJob: null });
    }
  },

  async selectModel(modelId) {
    if (!getModelSpec(modelId)) return;
    const manifest = await readManifest();
    writeManifest({ ...manifest, selectedModelId: modelId });
    set({ selectedModelId: modelId });
    if (get().loadedModelId && get().loadedModelId !== modelId) await get().unload();
  },

  async startDownload(modelId) {
    const spec = getModelSpec(modelId);
    if (!spec) throw new Error('Unknown model.');
    if (get().download) throw new Error('A model download is already in progress.');
    const free = Paths.availableDiskSpace;
    if (free < requiredFreeBytes(spec)) {
      const message = `Not enough free storage. ${spec.displayName} needs ${formatBytes(requiredFreeBytes(spec))} free; this device has ${formatBytes(free)}.`;
      set({ error: message });
      throw new Error(message);
    }
    const dir = modelsDir();
    dir.create({ intermediates: true, idempotent: true });
    const dest = modelFile(spec);
    if (dest.exists) dest.delete();
    const manifest = await readManifest();
    delete manifest.verified[spec.id];
    writeManifest(manifest);

    speedSample = { at: Date.now(), bytes: 0 };
    set({ error: null, download: { modelId, phase: 'active', bytesWritten: 0, totalBytes: spec.sizeBytes, bytesPerSecond: 0 } });
    task = File.createDownloadTask(downloadUrl(spec), dest, {
      onProgress: ({ bytesWritten, totalBytes }) => {
        const now = Date.now();
        if (now - lastProgressAt < 500) return;
        lastProgressAt = now;
        let bytesPerSecond = get().download?.bytesPerSecond ?? 0;
        if (now - speedSample.at >= 2000) {
          bytesPerSecond = ((bytesWritten - speedSample.bytes) * 1000) / (now - speedSample.at);
          speedSample = { at: now, bytes: bytesWritten };
        }
        set({
          download: {
            modelId,
            phase: 'active',
            bytesWritten,
            totalBytes: totalBytes > 0 ? totalBytes : spec.sizeBytes,
            bytesPerSecond,
          },
        });
      },
    });
    await runTask(() => task!.downloadAsync(), spec);
  },

  async pauseDownload() {
    if (!task || get().download?.phase !== 'active') return;
    await task.pauseAsync();
    const d = get().download;
    if (d) set({ download: { ...d, phase: 'paused', bytesPerSecond: 0 } });
  },

  async resumeDownload() {
    const d = get().download;
    const spec = getModelSpec(d?.modelId);
    if (!task || !d || !spec || d.phase !== 'paused') return;
    speedSample = { at: Date.now(), bytes: d.bytesWritten };
    set({ download: { ...d, phase: 'active' }, error: null });
    await runTask(() => task!.resumeAsync(), spec);
  },

  async cancelDownload() {
    const d = get().download;
    try {
      task?.cancel();
    } catch {
      // ignore
    }
    task = null;
    set({ download: null });
    const spec = getModelSpec(d?.modelId);
    if (spec) {
      const file = modelFile(spec);
      if (file.exists) file.delete();
    }
    await get().refresh();
  },

  async verify(modelId) {
    const spec = getModelSpec(modelId);
    if (!spec) return false;
    const file = modelFile(spec);
    if (!file.exists) {
      await get().refresh();
      return false;
    }
    const size = file.size ?? 0;
    set({
      download: { modelId, phase: 'verifying', bytesWritten: size, totalBytes: spec.sizeBytes, bytesPerSecond: 0 },
    });
    try {
      const sha256 = size === spec.sizeBytes ? await DocPawiNative.sha256File(toNativePath(file.uri)) : null;
      const manifest = await readManifest();
      if (sha256 === spec.sha256) {
        manifest.verified[spec.id] = { sha256, sizeBytes: size, verifiedAt: new Date().toISOString() };
        writeManifest(manifest);
        set({ error: null });
        return true;
      }
      delete manifest.verified[spec.id];
      writeManifest(manifest);
      set({
        error:
          size !== spec.sizeBytes
            ? `The model file is incomplete (${formatBytes(size)} of ${formatBytes(spec.sizeBytes)}). Download it again.`
            : 'The model file failed its SHA-256 check and will not be used. Download it again.',
      });
      return false;
    } finally {
      set({ download: null });
      await get().refresh();
    }
  },

  async load(modelId) {
    const id = modelId ?? get().selectedModelId;
    const spec = getModelSpec(id);
    if (!spec) throw new Error('Unknown model.');
    if (
      get().loadState === 'ready' &&
      get().loadedModelId === id &&
      llamaEngine.isLoaded &&
      get().engineInfo?.threads === get().threads
    ) {
      return get().engineInfo!;
    }
    if (!get().initialized) await get().refresh();
    if (!get().files[id]?.verified) {
      throw new ModelNotReadyError(`${spec.displayName} is not installed and verified yet. Download it from Settings → AI model.`);
    }
    set({ loadState: 'loading', loadProgress: 0, error: null });
    try {
      const info = await llamaEngine.load(toNativePath(modelFile(spec).uri), spec.contextTokens, get().threads, (p) =>
        set({ loadProgress: p }),
      );
      set({ loadState: 'ready', loadedModelId: id, engineInfo: info, loadProgress: 100 });
      return info;
    } catch (error) {
      const message = `Could not load ${spec.displayName}: ${(error as Error).message}. The phone may not have enough free memory; close other apps or choose the smaller model.`;
      set({ loadState: 'error', loadedModelId: null, engineInfo: null, error: message });
      throw new Error(message);
    }
  },

  async unload() {
    await llamaEngine.release();
    set({ loadState: 'unloaded', loadedModelId: null, engineInfo: null, loadProgress: 0, activeJob: null });
  },

  async deleteModel(modelId) {
    const spec = getModelSpec(modelId);
    if (!spec) return;
    if (get().loadedModelId === modelId) await get().unload();
    const file = modelFile(spec);
    if (file.exists) file.delete();
    const manifest = await readManifest();
    delete manifest.verified[spec.id];
    writeManifest(manifest);
    await get().refresh();
  },

  async complete(job, request) {
    if (get().activeJob) {
      throw new Error(
        get().activeJob === 'document'
          ? 'Doc Pawi is busy analyzing a document. Please wait for it to finish.'
          : 'Doc Pawi is still answering. Please wait or stop the current response.',
      );
    }
    if (get().loadState !== 'ready') await get().load();
    set({ activeJob: job });
    try {
      return await llamaEngine.complete(request);
    } finally {
      set({ activeJob: null });
    }
  },

  /** Best effort: warms the KV cache with a static prompt prefix while the model is idle. */
  async prefill(request) {
    if (get().loadState !== 'ready' || get().activeJob) return;
    try {
      await llamaEngine.prefill(request);
    } catch {
      // The next completion simply processes the whole prompt.
    }
  },

  stop() {
    llamaEngine.stop();
  },

  async runTestPrompt() {
    const result = await get().complete('test', {
      messages: [
        { role: 'system', content: 'You are a concise assistant.' },
        { role: 'user', content: 'In one short sentence, say hello and confirm you are running offline on this phone.' },
      ],
      maxTokens: 48,
      temperature: 0.7,
    });
    const run = { text: result.text, timings: result.timings, at: new Date().toISOString() };
    set({ lastTest: run });
    return run;
  },

  clearError() {
    set({ error: null });
  },
}));

async function runTask(start: () => Promise<File | null>, spec: ModelSpec) {
  const store = useModelStore;
  try {
    const file = await start();
    if (!file) return; // paused
    task = null;
    set({ download: { modelId: spec.id, phase: 'verifying', bytesWritten: spec.sizeBytes, totalBytes: spec.sizeBytes, bytesPerSecond: 0 } });
    await store.getState().verify(spec.id);
  } catch (error) {
    task = null;
    const aborted = /abort|cancel/i.test(String((error as Error)?.message ?? error));
    store.setState({
      download: null,
      error: aborted ? null : `Model download failed: ${(error as Error).message}. Check your internet connection and try again.`,
    });
    await store.getState().refresh();
  }

  function set(partial: Partial<ModelStore>) {
    store.setState(partial);
  }
}

/** Metadata stored with each AI response so evaluators can see which local model produced it. */
export function currentModelMetadata() {
  const state = useModelStore.getState();
  const spec = getModelSpec(state.loadedModelId ?? state.selectedModelId);
  return {
    modelId: spec?.id ?? 'unknown',
    modelFile: spec?.fileName ?? 'unknown',
    engine: ENGINE_NAME,
  };
}
