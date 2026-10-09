# Doc Pawi — Model Disclosure

> **Document role:** the exact AI models, runtime, licenses, measured performance, and limitations.
> In-app: Settings → AI model disclosure, and the AI model screen. Related: [Local AI Architecture](LOCAL_AI_ARCHITECTURE.md) · [Privacy](PRIVACY.md) · [Testing](TESTING.md)

## 1. Language models

| | Default | Alternative |
|---|---|---|
| Model | Qwen3 1.7B | Qwen3 0.6B |
| Publisher of weights | Qwen team (Alibaba Cloud) | Qwen team (Alibaba Cloud) |
| GGUF conversion | ggml-org | ggml-org |
| Repository | [`ggml-org/Qwen3-1.7B-GGUF`](https://huggingface.co/ggml-org/Qwen3-1.7B-GGUF) | [`ggml-org/Qwen3-0.6B-GGUF`](https://huggingface.co/ggml-org/Qwen3-0.6B-GGUF) |
| Pinned revision | `daeb8e2d528a760970442092f6bf1e55c3b659eb` | `b5f37287796e5be0ea3dab2e7430873fb3f73e49` |
| File | `Qwen3-1.7B-Q4_K_M.gguf` | `Qwen3-0.6B-Q8_0.gguf` |
| Size | 1,282,439,264 bytes (1.28 GB) | 804,753,632 bytes (0.80 GB) |
| SHA-256 | `d2387ca2dbfee2ffabce7120d3770dadca0b293052bc2f0e138fdc940d9bc7b5` | `361cc68159042c36ebff7715dc5a2e4612153e88f3e9c9c234820849d6dc9e1d` |
| Quantization | Q4_K_M (4-bit) | Q8_0 (8-bit) |
| License | Apache-2.0 | Apache-2.0 |
| Context used by Doc Pawi | 4,096 tokens (model supports 32K) | 4,096 tokens |
| Mode | Non-thinking (`enable_thinking: false`) | Non-thinking |

The checksums above were verified against the Hugging Face LFS metadata and by downloading both files (2026-10-09). The app downloads from `https://huggingface.co/<repo>/resolve/<revision>/<file>` and refuses to load a file whose size or SHA-256 differs.

Note: `ggml-org/Qwen3-0.6B-GGUF` has no Q4_K_M file; Q8_0 was chosen for the small model to limit quality loss.

## 2. Runtime

| Component | Version | License | Notes |
|---|---|---|---|
| llama.cpp | build b10256, commit `6c8dcaa` | MIT | Bundled inside llama.rn's prebuilt Android libraries |
| llama.rn | 0.12.9 | MIT | JSI binding; picks a CPU library variant at runtime (e.g. `armv8.2 + dotprod`) based on `/proc/cpuinfo` |
| Acceleration | CPU only | — | `n_gpu_layers: 0`; OpenCL/Hexagon paths disabled. **No GPU or NPU acceleration is claimed.** |
| Chat template | Model's embedded Jinja template | — | Tool calls in Qwen/Hermes `<tool_call>` format, parsed by llama.cpp |
| Structured output | JSON-schema → grammar | — | Used for document extraction |

## 3. OCR model

Google ML Kit Text Recognition v2, Latin script, **bundled** on-device model (`com.google.mlkit:text-recognition:16.0.1`, ML Kit Terms of Service). Not open source. Images are processed on-device; ML Kit may send anonymous usage metrics when online ([PRIVACY.md](PRIVACY.md#4-network-use)).

## 4. Intended use

- Answer questions about the user's *own recorded* data, using retrieved local records.
- Give general, non-diagnostic health information with safety framing.
- Propose records/events from the user's statements (always requiring confirmation).
- Summarize and extract fields from medical documents for user review.

Not intended for diagnosis, triage, prescribing, dose changes, or emergency assessment.

## 5. Measured performance

Measurements come from the app's own llama.cpp timings on the physical test device (see [TESTING.md §4](TESTING.md#4-on-device-results) for the procedure and raw results).

| Device | Model | Load time | Prompt processing | Generation | Notes |
|---|---|---|---|---|---|
| HONOR JDY-LX2 (MediaTek Helio G85 / MT6769V, 8 cores, ~6 GB RAM, Android 16) | Qwen3 1.7B Q4_K_M | _pending measurement_ | _pending_ | _pending_ | |
| same | Qwen3 0.6B Q8_0 | _pending_ | _pending_ | _pending_ | |

## 6. Limitations

- **Accuracy:** small quantized models can produce wrong facts, misread document values, or misinterpret dates. Every AI output is labelled, user-specific answers are grounded in retrieved records, and extracted values are checked against the OCR text, but users must verify.
- **Speed:** answers on mid-range phones take tens of seconds or more; document analysis can take minutes.
- **Memory:** loading the 1.7B model needs roughly 1.5 GB of free RAM; on low-memory phones loading can fail (the app reports this and suggests the 0.6B model).
- **Language:** best in English; OCR supports Latin script only (no handwriting).
- **Tool calling:** at most one proposal per response is reliably produced by this runtime version.
- **Knowledge cut-off:** the model's general medical knowledge is static and may be outdated.
- **OpenMed:** clinical NER models from OpenMed were evaluated but not integrated (see [TECHNICAL_REQUIREMENTS.md](TECHNICAL_REQUIREMENTS.md#4-compatibility-decisions-and-trade-offs)).
