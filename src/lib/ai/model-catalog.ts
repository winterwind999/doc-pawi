/**
 * Locally runnable models. Each entry is pinned to an exact Hugging Face commit, byte size,
 * and SHA-256 (the LFS object id), verified through the Hugging Face API on 2026-10-09.
 * A downloaded file is only marked ready after its size and SHA-256 match.
 * See docs/MODEL_DISCLOSURE.md.
 */
export interface ModelSpec {
  id: string;
  displayName: string;
  family: string;
  parameters: string;
  quantization: string;
  repo: string;
  revision: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  license: string;
  licenseUrl: string;
  /** Context window used by Doc Pawi (the model supports more; kept small for memory). */
  contextTokens: number;
  recommended: boolean;
  description: string;
}

export const MODEL_CATALOG: readonly ModelSpec[] = [
  {
    id: 'qwen3-1.7b-q4_k_m',
    displayName: 'Qwen3 1.7B (Q4_K_M)',
    family: 'Qwen3',
    parameters: '1.7B',
    quantization: 'Q4_K_M (4-bit)',
    repo: 'ggml-org/Qwen3-1.7B-GGUF',
    revision: 'daeb8e2d528a760970442092f6bf1e55c3b659eb',
    fileName: 'Qwen3-1.7B-Q4_K_M.gguf',
    sizeBytes: 1_282_439_264,
    sha256: 'd2387ca2dbfee2ffabce7120d3770dadca0b293052bc2f0e138fdc940d9bc7b5',
    license: 'Apache-2.0',
    licenseUrl: 'https://huggingface.co/Qwen/Qwen3-1.7B/blob/main/LICENSE',
    contextTokens: 4096,
    recommended: true,
    description: 'Best answer quality. Recommended for phones with 4 GB of RAM or more.',
  },
  {
    id: 'qwen3-0.6b-q8_0',
    displayName: 'Qwen3 0.6B (Q8_0)',
    family: 'Qwen3',
    parameters: '0.6B',
    quantization: 'Q8_0 (8-bit)',
    repo: 'ggml-org/Qwen3-0.6B-GGUF',
    revision: 'b5f37287796e5be0ea3dab2e7430873fb3f73e49',
    fileName: 'Qwen3-0.6B-Q8_0.gguf',
    sizeBytes: 804_753_632,
    sha256: '361cc68159042c36ebff7715dc5a2e4612153e88f3e9c9c234820849d6dc9e1d',
    license: 'Apache-2.0',
    licenseUrl: 'https://huggingface.co/Qwen/Qwen3-0.6B/blob/main/LICENSE',
    contextTokens: 4096,
    recommended: false,
    description: 'Faster and smaller, but noticeably less accurate. For low-memory phones.',
  },
];

export const DEFAULT_MODEL_ID = MODEL_CATALOG.find((m) => m.recommended)!.id;

export function getModelSpec(id: string | null | undefined): ModelSpec | null {
  return MODEL_CATALOG.find((m) => m.id === id) ?? null;
}

export function downloadUrl(spec: ModelSpec) {
  return `https://huggingface.co/${spec.repo}/resolve/${spec.revision}/${spec.fileName}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
}

/** Free space required to download a model: file size plus a safety margin for the database and documents. */
export const requiredFreeBytes = (spec: ModelSpec) => spec.sizeBytes + 300 * 1024 * 1024;
