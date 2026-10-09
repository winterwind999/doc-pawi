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
| KV cache | 8-bit (`q8_0`) for K and V | — | Half the memory of f16 and faster generation deep into a prompt (measured below). A quantized V cache needs flash attention, which llama.cpp enables automatically (`flash_attn_type` left at `auto`). |
| CPU threads | llama.rn default (up to 4) or 6 / 8 | — | User setting on the AI model screen; changing it reloads the model |
| Prompt prefill | Static system prompt + tool definitions | — | Evaluated ahead of time when Chats or a conversation opens; llama.rn reuses the matching KV-cache prefix, so a question only processes its own part |
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

Measured on 2026-10-10 on the physical test device — HONOR JDY-LX2, MediaTek Helio G85 (MT6769V/CZ: 2× Cortex-A75 + 6× Cortex-A55), ~6 GB RAM, Android 16 — with the **release APK**, in airplane mode with Wi-Fi off, phone charging, Android thermal status 0 (no throttling reported). Numbers are llama.cpp's own timings as shown in the app; "Send → done" is wall-clock time measured from the tap on Send until the finished answer. Raw results and procedure: [TESTING.md §4](TESTING.md#4-on-device-results).

**Qwen3 1.7B Q4_K_M** (CPU library `rnllama_jni_v8_2_dotprod`, 4,096-token context):

| Measurement | Result |
|---|---|
| Model load | 11.4–13.7 s (release builds); 15.7–19.2 s in the debug build |
| App memory with the model loaded | native heap ≈ 1.43 GB with the q8_0 KV cache (≈ 1.64 GB with f16) |
| llama.cpp benchmark, 128-token prompt / 32 generated (f16 KV) | 4 threads: 16.7 / 5.5 tok/s · 6 threads: 21.1 / 5.3 tok/s · 8 threads: 17.1 / 1.7 tok/s |
| Benchmark at chat depth, 1,024-token prompt / 32 generated, 4 threads | f16 KV: 15.8 / 2.7 tok/s · **q8_0 KV: 13.3 / 3.6 tok/s** |
| Short test prompt ("say hello offline"), 4 threads | 40 prompt tokens at 12.7 tok/s · 9 tokens at 5.5 tok/s |
| Prefill of the static chat prompt (system prompt + tools) | ≈ 30–50 s of background CPU work after opening Chats |

Chat answer to "What medications am I taking?" (synthetic demo data, new conversation, prefill finished):

| KV cache | Threads | Question tokens read | Generation | Send → done |
|---|---|---|---|---|
| f16 | 4 | 234 at 13.2 tok/s | 103 tokens at 2.8 tok/s | 58 s |
| f16 | 6 | 234 at 15.7 tok/s | 96 tokens at 3.3 tok/s | 48 s |
| q8_0 (shipped) | 4 (default) | 234 at 9.9 tok/s | 96 tokens at 3.9 tok/s | 52 s |
| q8_0 (shipped) | 6 | 234 at 11.7 tok/s | 103 tokens at 4.3 tok/s | 47 s |

Before the prefill and KV-cache changes, the first answer in a conversation (debug build, f16, 6 threads) read **1,088** prompt tokens at 17.8 tok/s and took **91 s**. Other measured answers (q8_0, 6 threads): emergency message 83 + 48 tokens in 21 s; dose-change question 225 + 58 tokens in 40 s; flu-shot proposal 266 + 91 tokens in 55 s. Document analysis of the one-page synthetic lab report (866 OCR characters) took about 4 minutes from import to "Ready for review".

Why generation in chat is slower than the 128-token benchmark: chat generates about 1,000 tokens deep into the context, and attention over that context costs time on this CPU (the 1,024-token benchmark shows the same 2.7 tok/s as chat with f16). Streaming, the tool-call grammar, and sampling were measured to add no meaningful time (a non-streaming run gave 2.9 tok/s vs 2.8 streaming).

**Qwen3 0.6B Q8_0:** downloadable and selectable, but **not measured** on the device in this round.

## 6. Limitations

- **Accuracy:** small quantized models can produce wrong facts, misread document values, or misinterpret dates. Every AI output is labelled, user-specific answers are grounded in retrieved records, and extracted values are checked against the OCR text, but users must verify.
- **Speed:** on the test phone a typical answer takes about 20–60 s after the static prompt is prefilled; document analysis takes several minutes.
- **Memory:** with the 1.7B model loaded the app uses about 1.4 GB of native memory; on low-memory phones loading can fail (the app reports this and suggests the 0.6B model).
- **Observed errors on the test phone:** the document summary once called creatinine "elevated" although the report did not flag it (the app now warns when the summary contradicts the extracted flags), and a chat suggestion once filled in a clinic name copied from the user's records instead of the user's words (the app now marks such a facility for checking). Before a prompt change, a flu shot was filed as a "visit" record rather than a vaccination.
- **Language:** best in English; OCR supports Latin script only (no handwriting).
- **Tool calling:** at most one proposal per response is reliably produced by this runtime version.
- **Knowledge cut-off:** the model's general medical knowledge is static and may be outdated.
