import { Paths } from 'expo-file-system';
import { useNetworkState } from 'expo-network';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ChoiceChips } from '@/components/ui/Choice';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { KeyValueRow, ProgressBar, Screen, SectionHeader } from '@/components/ui/Layout';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { describeTimings } from '@/lib/ai/format-text';
import { formatBytes, MODEL_CATALOG, requiredFreeBytes, type ModelSpec } from '@/lib/ai/model-catalog';
import { DocPawiNative } from '@/lib/native';
import { useModelStore } from '@/stores/model-store';

function formatRate(bytesPerSecond: number) {
  return bytesPerSecond > 0 ? `${formatBytes(bytesPerSecond)}/s` : '—';
}

function ModelCard({ spec, offline }: { spec: ModelSpec; offline: boolean }) {
  const store = useModelStore();
  const file = store.files[spec.id];
  const selected = store.selectedModelId === spec.id;
  const download = store.download?.modelId === spec.id ? store.download : null;
  const loaded = store.loadedModelId === spec.id && store.loadState === 'ready';
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const free = Paths.availableDiskSpace;
  const enoughSpace = free >= requiredFreeBytes(spec);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await fn();
    } catch {
      // Errors are surfaced through the store's `error` banner.
    } finally {
      setBusy(null);
    }
  };

  const pct = download && download.totalBytes ? (download.bytesWritten / download.totalBytes) * 100 : 0;
  const etaSeconds =
    download && download.bytesPerSecond > 0 ? (download.totalBytes - download.bytesWritten) / download.bytesPerSecond : null;

  return (
    <Card className={`gap-3 ${selected ? 'border-primary-300' : ''}`}>
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1 gap-0.5">
          <Text className="text-lg font-bold text-ink">{spec.displayName}</Text>
          <Text className="text-sm text-ink-muted">{spec.description}</Text>
        </View>
        {loaded ? (
          <StatusBadge label="Loaded" tone="success" icon="chip" />
        ) : file?.verified ? (
          <StatusBadge label="Installed · verified" tone="info" icon="shield-check-outline" />
        ) : file?.exists ? (
          <StatusBadge label="Incomplete" tone="pending" />
        ) : (
          <StatusBadge label="Not installed" tone="neutral" />
        )}
      </View>
      <View>
        <KeyValueRow label="Download size" value={formatBytes(spec.sizeBytes)} />
        <KeyValueRow label="Quantization" value={spec.quantization} />
        <KeyValueRow label="License" value={spec.license} />
        <KeyValueRow label="Source" value={`${spec.repo}@${spec.revision.slice(0, 7)}`} />
        <KeyValueRow label="SHA-256" value={`${spec.sha256.slice(0, 16)}…`} />
      </View>

      {download ? (
        <View className="gap-2">
          <ProgressBar value={download.phase === 'verifying' ? 100 : pct} tone={download.phase === 'paused' ? 'sand' : 'primary'} />
          <Text className="text-sm text-ink-muted" accessibilityLiveRegion="polite">
            {download.phase === 'verifying'
              ? 'Verifying the SHA-256 checksum on the device…'
              : `${formatBytes(download.bytesWritten)} of ${formatBytes(download.totalBytes)} · ${
                  download.phase === 'paused' ? 'paused' : formatRate(download.bytesPerSecond)
                }${etaSeconds && download.phase === 'active' ? ` · about ${Math.ceil(etaSeconds / 60)} min left` : ''}`}
          </Text>
          {download.phase !== 'verifying' ? (
            <View className="flex-row gap-2">
              {download.phase === 'active' ? (
                <Button label="Pause" size="sm" variant="outline" icon="pause" onPress={() => void store.pauseDownload()} />
              ) : (
                <Button label="Resume" size="sm" icon="play" disabled={offline} onPress={() => void store.resumeDownload()} />
              )}
              <Button label="Cancel" size="sm" variant="ghost" icon="close" onPress={() => void store.cancelDownload()} />
            </View>
          ) : null}
        </View>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {!file?.verified ? (
            <Button
              label={`Download ${formatBytes(spec.sizeBytes)}`}
              icon="download"
              disabled={offline || !enoughSpace || !!store.download}
              onPress={() => void run('download', () => store.startDownload(spec.id))}
            />
          ) : null}
          {file?.verified && !selected ? (
            <Button label="Use this model" variant="secondary" icon="check" onPress={() => void store.selectModel(spec.id)} />
          ) : null}
          {file?.verified && selected && !loaded ? (
            <Button
              label="Load model"
              icon="play-circle-outline"
              loading={store.loadState === 'loading' || busy === 'load'}
              onPress={() => void run('load', () => store.load(spec.id))}
            />
          ) : null}
          {loaded ? <Button label="Unload" variant="outline" icon="eject-outline" onPress={() => void store.unload()} /> : null}
          {file?.exists ? (
            <Button
              label="Verify checksum"
              variant="outline"
              icon="shield-search"
              loading={busy === 'verify'}
              onPress={() => void run('verify', () => store.verify(spec.id))}
            />
          ) : null}
          {file?.exists ? (
            <Button label="Remove model" variant="ghost" icon="delete-outline" onPress={() => setConfirmDelete(true)} />
          ) : null}
        </View>
      )}
      {!file?.verified && !download && !enoughSpace ? (
        <Banner tone="danger">{`Not enough free storage: ${formatBytes(requiredFreeBytes(spec))} needed, ${formatBytes(free)} available.`}</Banner>
      ) : null}
      {store.loadState === 'loading' && selected ? (
        <View className="gap-1.5">
          <ProgressBar value={store.loadProgress} />
          <Text className="text-sm text-ink-muted">Loading into memory… {store.loadProgress}%</Text>
        </View>
      ) : null}
      <ConfirmDialog
        visible={confirmDelete}
        title="Remove the AI model?"
        message={`This deletes the ${formatBytes(spec.sizeBytes)} model file. Your health records, documents, and conversations are not affected. AI features stay unavailable until you download a model again.`}
        confirmLabel="Remove model"
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void store.deleteModel(spec.id);
        }}
      />
    </Card>
  );
}

export default function ModelScreen() {
  const { onboarding } = useLocalSearchParams<{ onboarding?: string }>();
  const network = useNetworkState();
  const offline = network.isConnected === false || network.isInternetReachable === false;
  const store = useModelStore();
  const device = useMemo(() => DocPawiNative.getDeviceProfile(), []);
  const [testing, setTesting] = useState(false);
  const [benching, setBenching] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  const runBench = async () => {
    setBenching(true);
    setTestError(null);
    try {
      await store.runBenchmark();
    } catch (e) {
      setTestError((e as Error).message);
    } finally {
      setBenching(false);
    }
  };

  useEffect(() => {
    void store.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runTest = async () => {
    setTesting(true);
    setTestError(null);
    try {
      await store.runTestPrompt();
    } catch (e) {
      setTestError((e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  const info = store.engineInfo;
  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: onboarding ? 'On-device AI' : 'AI model' }} />
      {onboarding ? (
        <Banner tone="info" title="Final step: install the on-device AI">
          {`Doc Pawi’s assistant runs a language model on this phone. Download it once (Wi-Fi recommended); after that it works in airplane mode. You can skip this and do it later from Settings — records, meds, doctors, and HMO work without it.`}
        </Banner>
      ) : null}
      {offline ? (
        <Banner tone="pending" icon="wifi-off" title="You are offline">
          Downloading a model needs internet. An installed model works fully offline.
        </Banner>
      ) : null}
      {store.error ? (
        <Banner tone="danger" action={<Button label="Dismiss" size="sm" variant="outline" onPress={store.clearError} />}>
          {store.error}
        </Banner>
      ) : null}

      <SectionHeader title="Models" />
      {MODEL_CATALOG.map((spec) => (
        <ModelCard key={spec.id} spec={spec} offline={offline} />
      ))}

      <SectionHeader title="Inference engine" />
      <Card className="gap-1">
        {info ? (
          <>
            <KeyValueRow label="Status" value="Loaded and ready" />
            <KeyValueRow label="Runtime" value={`llama.cpp b${info.llamaCppBuild} (${info.llamaCppCommit}) via llama.rn 0.12.9`} />
            <KeyValueRow label="Model" value={info.modelDescription} />
            <KeyValueRow label="Parameters" value={`${(info.parameterCount / 1e9).toFixed(2)} B`} />
            <KeyValueRow label="Context window" value={`${info.contextTokens} tokens`} />
            <KeyValueRow label="KV cache" value={`${info.kvCacheType} (8-bit)`} />
            <KeyValueRow label="CPU library" value={info.nativeLibrary ?? 'unknown'} />
            <KeyValueRow label="Threads" value={info.threads ? String(info.threads) : 'Default (up to 4)'} />
            <KeyValueRow label="GPU" value={info.gpu ? 'Yes' : `No (CPU only)`} />
            <KeyValueRow label="Load time" value={`${(info.loadMs / 1000).toFixed(1)} s`} />
          </>
        ) : (
          <Text className="text-sm text-ink-muted">Load a model to see runtime details.</Text>
        )}
      </Card>

      <SectionHeader title="Performance" />
      <Card className="gap-3">
        <ChoiceChips
          label="CPU threads"
          options={[
            { value: 'auto', label: 'Default (4)' },
            ...[6, 8]
              .filter((n) => !device || n <= device.cpuCores)
              .map((n) => ({ value: String(n), label: `${n}` })),
          ]}
          value={store.threads ? String(store.threads) : 'auto'}
          onChange={(v) => v && void store.setThreads(v === 'auto' ? null : Number(v))}
        />
        <Text className="text-xs leading-4 text-ink-muted">
          More threads can speed up reading long prompts on phones with many efficiency cores. Changing this reloads the
          model.
        </Text>
        <Button
          label="Run llama.cpp benchmark"
          icon="speedometer"
          variant="outline"
          loading={benching}
          disabled={!store.files[store.selectedModelId]?.verified}
          onPress={() => void runBench()}
        />
        {store.lastBench ? (
          <Text className="text-sm text-ink">
            {`${store.lastBench.threads} threads · prompt ${store.lastBench.promptTokens} tokens at ${store.lastBench.promptTokensPerSecond.toFixed(1)} tok/s · generation ${store.lastBench.generatedTokens} tokens at ${store.lastBench.generatedTokensPerSecond.toFixed(1)} tok/s`}
          </Text>
        ) : null}
      </Card>

      <SectionHeader title="Test the model" />
      <Card className="gap-3">
        <Text className="text-sm leading-5 text-ink-muted">
          Sends a short prompt to the local model and shows its answer and speed. Try it in airplane mode to confirm
          nothing depends on the internet.
        </Text>
        <Button
          label="Run test prompt"
          icon="flask-outline"
          loading={testing}
          disabled={!store.files[store.selectedModelId]?.verified}
          onPress={() => void runTest()}
        />
        {testError ? <Banner tone="danger">{testError}</Banner> : null}
        {store.lastTest ? (
          <View className="gap-2 rounded-xl bg-ocean-50 p-3">
            <Text selectable className="text-base text-ink">
              {store.lastTest.text || '(empty response)'}
            </Text>
            {store.lastTest.timings ? (
              <Text className="text-xs text-ink-muted">
                {describeTimings(store.lastTest.timings)}
              </Text>
            ) : null}
          </View>
        ) : null}
      </Card>

      <SectionHeader title="This device" />
      <Card className="gap-1">
        {device ? (
          <>
            <KeyValueRow label="Phone" value={`${device.manufacturer} ${device.model}`} />
            <KeyValueRow label="Android" value={`${device.androidVersion} (API ${device.sdkInt})`} />
            <KeyValueRow label="Chipset" value={device.socModel ? `${device.socManufacturer ?? ''} ${device.socModel}`.trim() : device.hardware} />
            <KeyValueRow label="CPU cores" value={String(device.cpuCores)} />
            <KeyValueRow label="RAM" value={`${formatBytes(device.totalRamBytes)} total · ${formatBytes(device.availableRamBytes)} free`} />
            <KeyValueRow label="Free storage" value={formatBytes(Paths.availableDiskSpace)} />
            <KeyValueRow label="ABIs" value={device.supportedAbis.join(', ')} />
          </>
        ) : (
          <Text className="text-sm text-ink-muted">Device details are unavailable in this build.</Text>
        )}
      </Card>

      <View className="flex-row flex-wrap gap-2">
        <Button label="Model disclosure" variant="outline" icon="file-document-outline" onPress={() => router.push('/about/model-disclosure')} />
        <Button
          label="Model on Hugging Face"
          variant="ghost"
          icon="open-in-new"
          onPress={() => void Linking.openURL(`https://huggingface.co/${MODEL_CATALOG[0].repo}`)}
        />
      </View>

      {onboarding ? (
        <Button label="Continue to Home" icon="home-variant" size="lg" onPress={() => router.replace('/')} />
      ) : null}
    </Screen>
  );
}
