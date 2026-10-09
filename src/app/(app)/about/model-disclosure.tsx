import { InfoPage } from '@/components/InfoPage';
import { formatBytes, MODEL_CATALOG } from '@/lib/ai/model-catalog';
import { useModelStore } from '@/stores/model-store';

export default function ModelDisclosureScreen() {
  const info = useModelStore((s) => s.engineInfo);
  return (
    <InfoPage
      title="AI model disclosure"
      intro="Doc Pawi’s AI features run entirely on this phone. These are the exact models and software used."
      sections={[
        ...MODEL_CATALOG.map((m) => ({
          heading: m.displayName,
          body: [
            `Source: huggingface.co/${m.repo} at commit ${m.revision}.`,
            `File: ${m.fileName} (${formatBytes(m.sizeBytes)}, ${m.quantization}). SHA-256: ${m.sha256}. The app refuses to load a file whose checksum does not match.`,
            `License: ${m.license} (Qwen3 by the Qwen team, Alibaba Cloud; GGUF conversion by ggml-org).`,
            `Used with a ${m.contextTokens}-token context window and thinking mode disabled.`,
          ],
        })),
        {
          heading: 'Inference runtime',
          body: [
            'llama.cpp build b10256 (commit 6c8dcaa) through the llama.rn 0.12.9 React Native library (MIT licenses). Inference runs on the phone’s CPU; GPU and NPU acceleration are not used. The attention cache (KV cache) is stored in 8-bit (q8_0) form to save memory.',
            info
              ? `Currently loaded: ${info.modelDescription}, native library ${info.nativeLibrary ?? 'unknown'}, ${info.contextTokens}-token context, ${info.kvCacheType} KV cache, ${info.threads ? `${info.threads} CPU threads` : 'default CPU threads (up to 4)'}.`
              : 'No model is loaded right now.',
          ],
        },
        {
          heading: 'Text recognition',
          body: [
            'Google ML Kit Text Recognition v2 (Latin script, bundled on-device model, com.google.mlkit:text-recognition 16.0.1). Handwriting and non-Latin scripts are not supported. Recognition errors are possible, which is why extracted values are checked against the recognized text and must be reviewed by you.',
          ],
        },
        {
          heading: 'What the AI does',
          body: [
            'Answers questions using only the local records retrieved for your question, plus general health information.',
            'Suggests records or vaccine/treatment events from what you tell it. Suggestions are validated and are never saved without your confirmation.',
            'Summarizes documents and extracts candidate fields (dates, facility, test values) for your review.',
          ],
        },
        {
          heading: 'Limitations',
          body: [
            'Small on-device models make mistakes: they can misread values, mix up dates, or state incorrect general information. Always check against the original document and ask a clinician.',
            'Responses are slower than cloud AI. On the tested mid-range phone, answers take tens of seconds to a few minutes (see the measured speeds on the AI model screen).',
            'The model does not diagnose, prescribe, or adjust doses, and it cannot assess emergencies.',
            'OpenMed clinical models were evaluated but are not included in this version (see the project documentation for the reasons).',
          ],
        },
      ]}
    />
  );
}
