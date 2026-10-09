import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Icon } from '@/components/ui/Icon';
import type { ModelRunMetadata } from '@/lib/ai/llm-types';
import { getModelSpec } from '@/lib/ai/model-catalog';
import { assessMessage, DOSE_CHANGE_NOTE, EMERGENCY_MESSAGE, EMERGENCY_NUMBER } from '@/lib/ai/safety';
import { formatTimestamp } from '@/lib/dates';
import type { MessageRow } from '@/lib/db/models';
import { parseJson } from '@/lib/json';
import { useChatStream } from '@/stores/chat-stream-store';
import { colors } from '@/theme/colors';

export function UserBubble({ message, attachmentName }: { message: MessageRow; attachmentName?: string | null }) {
  const safety = assessMessage(message.content);
  return (
    <View className="items-end gap-2">
      <View className="max-w-[85%] gap-1 rounded-2xl rounded-br-md bg-primary-600 px-4 py-3">
        {attachmentName ? (
          <View className="flex-row items-center gap-1.5">
            <Icon name="paperclip" size={14} color={colors.white} />
            <Text className="text-xs font-semibold text-white" numberOfLines={1}>
              {attachmentName}
            </Text>
          </View>
        ) : null}
        <Text selectable className="text-base leading-6 text-white">
          {message.content}
        </Text>
      </View>
      {safety.emergency ? (
        <Banner
          tone="danger"
          title="Possible emergency"
          className="w-full"
          action={
            <Pressable
              onPress={() => void Linking.openURL(`tel:${EMERGENCY_NUMBER}`)}
              accessibilityRole="button"
              accessibilityLabel={`Call ${EMERGENCY_NUMBER}`}
              className="min-h-[44px] flex-row items-center gap-2 rounded-xl bg-coral-600 px-4 active:bg-coral-700"
            >
              <Icon name="phone" size={18} color={colors.white} />
              <Text className="font-bold text-white">Call {EMERGENCY_NUMBER}</Text>
            </Pressable>
          }
        >
          {EMERGENCY_MESSAGE}
        </Banner>
      ) : null}
    </View>
  );
}

function Sources({ meta }: { meta: ModelRunMetadata }) {
  const [open, setOpen] = useState(false);
  const sources = meta.sources ?? [];
  return (
    <View className="gap-1">
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${sources.length} local records used. ${open ? 'Hide' : 'Show'} details`}
        className="min-h-[32px] flex-row items-center gap-1"
      >
        <Icon name="database-lock-outline" size={14} color={colors.inkMuted} />
        <Text className="text-xs font-semibold text-ink-muted">
          {sources.length ? `Used ${sources.length} local record${sources.length === 1 ? '' : 's'}` : 'No personal records were needed'}
        </Text>
        {sources.length ? <Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.inkMuted} /> : null}
      </Pressable>
      {open
        ? sources.map((s) => (
            <Text key={`${s.type}-${s.id}`} className="pl-5 text-xs text-ink-muted">
              • {s.label} ({s.type})
            </Text>
          ))
        : null}
    </View>
  );
}

export function AssistantBubble({ message }: { message: MessageRow }) {
  const streamId = useChatStream((s) => s.messageId);
  const streamText = useChatStream((s) => s.text);
  const live = message.status === 'generating' && streamId === message.id;
  const meta = parseJson<ModelRunMetadata | null>(message.model_metadata, null);
  const text = live ? streamText : message.content;
  const spec = getModelSpec(meta?.modelId);
  const timings = meta?.timings;

  return (
    <View className="items-start gap-1.5">
      <View
        className={`max-w-[92%] gap-2 rounded-2xl rounded-bl-md border px-4 py-3 ${
          message.status === 'error' ? 'border-coral-200 bg-coral-50' : 'border-line bg-surface'
        }`}
      >
        {text ? (
          <Text selectable className="text-base leading-6 text-ink">
            {text}
          </Text>
        ) : message.status === 'generating' ? (
          <View className="flex-row items-center gap-2" accessibilityLiveRegion="polite">
            <ActivityIndicator size="small" color={colors.primary} />
            <Text className="text-sm text-ink-muted">Reading your local records and thinking on-device…</Text>
          </View>
        ) : null}
        {message.status === 'stopped' ? <Text className="text-xs font-semibold text-sand-700">Stopped — response incomplete</Text> : null}
        {meta?.doseChangeQuestion ? (
          <View className="flex-row gap-2 rounded-xl bg-sand-50 p-2.5">
            <Icon name="pill-off" size={16} color={colors.sand700} />
            <Text className="flex-1 text-xs leading-4 text-sand-700">{DOSE_CHANGE_NOTE}</Text>
          </View>
        ) : null}
      </View>
      {meta && message.status !== 'generating' ? (
        <View className="max-w-[92%] gap-0.5 px-1">
          <Sources meta={meta} />
          <Text className="text-[11px] leading-4 text-ink-soft">
            AI-generated on this phone by {spec?.displayName ?? meta.modelId}
            {timings ? ` · ${timings.generatedTokensPerSecond.toFixed(1)} tok/s` : ''} · {formatTimestamp(message.created_at)} · Not
            medical advice
          </Text>
          {meta.toolCalls?.filter((t) => !t.ok).map((t) => (
            <Text key={t.name + t.error} className="text-[11px] text-coral-600">
              An invalid AI suggestion was discarded ({t.error}).
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
