import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { getModelSpec } from '@/lib/ai/model-catalog';
import { useModelStore } from '@/stores/model-store';

import { Button } from './ui/Button';
import { ProgressBar } from './ui/Layout';
import { StatusBadge } from './ui/StatusBadge';

/** Honest one-line model status with a link to model setup. Never reports a missing model as ready. */
export function useModelStatus() {
  const selectedId = useModelStore((s) => s.selectedModelId);
  const file = useModelStore((s) => s.files[s.selectedModelId]);
  const download = useModelStore((s) => s.download);
  const loadState = useModelStore((s) => s.loadState);
  const loadProgress = useModelStore((s) => s.loadProgress);
  const activeJob = useModelStore((s) => s.activeJob);
  const spec = getModelSpec(selectedId);

  if (download) {
    const pct = download.totalBytes ? (download.bytesWritten / download.totalBytes) * 100 : 0;
    return {
      tone: 'pending' as const,
      label: download.phase === 'verifying' ? 'Verifying checksum' : download.phase === 'paused' ? 'Download paused' : 'Downloading',
      detail: download.phase === 'verifying' ? 'Checking SHA-256…' : `${Math.floor(pct)}% downloaded`,
      progress: download.phase === 'verifying' ? null : pct,
      spec,
    };
  }
  if (!file?.verified) {
    return { tone: 'neutral' as const, label: 'Not installed', detail: 'Download the on-device model to use AI features.', progress: null, spec };
  }
  if (loadState === 'loading') return { tone: 'info' as const, label: 'Loading', detail: `${loadProgress}%`, progress: loadProgress, spec };
  if (loadState === 'error') return { tone: 'danger' as const, label: 'Failed to load', detail: 'Open AI model settings for details.', progress: null, spec };
  if (loadState === 'ready') {
    return { tone: 'success' as const, label: activeJob ? 'Working' : 'Ready on device', detail: spec?.displayName ?? '', progress: null, spec };
  }
  return { tone: 'info' as const, label: 'Installed', detail: 'Loads automatically when needed.', progress: null, spec };
}

export function ModelStatusCard({ compact = false }: { compact?: boolean }) {
  const status = useModelStatus();
  return (
    <View className="gap-2.5 rounded-2xl border border-line bg-surface p-4">
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-1">
          <Text className="text-sm font-semibold text-ink-muted">Local AI model</Text>
          <Text className="text-base font-semibold text-ink" numberOfLines={1}>
            {status.spec?.displayName ?? 'None selected'}
          </Text>
        </View>
        <StatusBadge label={status.label} tone={status.tone} icon={status.tone === 'success' ? 'chip' : undefined} />
      </View>
      {status.progress != null ? <ProgressBar value={status.progress} /> : null}
      {!compact ? <Text className="text-sm text-ink-muted">{status.detail}</Text> : null}
      {status.label === 'Not installed' || status.tone === 'danger' ? (
        <Button label="Set up AI model" icon="download" variant="secondary" onPress={() => router.push('/model')} />
      ) : null}
    </View>
  );
}
