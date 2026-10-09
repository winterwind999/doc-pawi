import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ModelStatusCard } from '@/components/ModelStatusCard';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Icon } from '@/components/ui/Icon';
import { EmptyState, ErrorState, LoadingState, Screen, SectionHeader } from '@/components/ui/Layout';
import { useLiveQuery } from '@/hooks/use-live-query';
import { formatTimestamp } from '@/lib/dates';
import { createConversation, deleteConversation, listConversations } from '@/lib/db/repositories/conversations';
import { CHAT_PREFIX } from '@/lib/services/chat-service';
import { useModelStore } from '@/stores/model-store';
import { useUnlockedSession } from '@/stores/session-store';
import { colors } from '@/theme/colors';

export default function ChatsScreen() {
  const { db, profileId } = useUnlockedSession();
  const chats = useLiveQuery((db, profileId) => listConversations(db, profileId));
  const [toDelete, setToDelete] = useState<string | null>(null);
  const modelReady = useModelStore((s) => s.loadState === 'ready');
  const activeJob = useModelStore((s) => s.activeJob);

  // Opening Chats signals the user is about to ask something: warm the model's static instructions.
  useFocusEffect(
    useCallback(() => {
      if (modelReady && !activeJob) void useModelStore.getState().prefill(CHAT_PREFIX);
    }, [modelReady, activeJob]),
  );

  const startNew = async () => {
    const conversation = await createConversation(db, profileId);
    router.push({ pathname: '/chat/[id]', params: { id: conversation.id } });
  };

  return (
    <Screen>
      <Button label="New conversation" icon="chat-plus-outline" size="lg" onPress={() => void startNew()} />
      <ModelStatusCard compact />
      <SectionHeader title="Conversations" />
      {chats.error ? <ErrorState message={chats.error.message} onRetry={chats.refresh} /> : null}
      {chats.loading && !chats.data ? <LoadingState /> : null}
      {chats.data && chats.data.length === 0 ? (
        <EmptyState
          showMascot
          title="Ask Doc Pawi anything"
          message="Try “When was my last hepatitis B dose?” or tell it “I had my flu shot today.” Answers are generated on this phone using only your local records."
        />
      ) : null}
      {chats.data?.map((c) => (
        <View key={c.id} className="flex-row items-center rounded-2xl border border-line bg-surface">
          <Pressable
            onPress={() => router.push({ pathname: '/chat/[id]', params: { id: c.id } })}
            accessibilityRole="button"
            accessibilityLabel={`Open conversation ${c.title}`}
            className="min-h-[64px] flex-1 gap-0.5 p-3.5 active:bg-surface-muted"
          >
            <Text className="text-base font-semibold text-ink" numberOfLines={1}>
              {c.title}
            </Text>
            <Text className="text-sm text-ink-muted" numberOfLines={1}>
              {c.last_message ?? 'No messages yet'}
            </Text>
            <Text className="text-xs text-ink-soft">
              {formatTimestamp(c.updated_at)} · {c.message_count} message{c.message_count === 1 ? '' : 's'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setToDelete(c.id)}
            accessibilityRole="button"
            accessibilityLabel={`Delete conversation ${c.title}`}
            className="h-12 w-12 items-center justify-center rounded-full active:bg-coral-50"
          >
            <Icon name="trash-can-outline" size={22} color={colors.coral600} />
          </Pressable>
        </View>
      ))}
      <ConfirmDialog
        visible={toDelete !== null}
        title="Delete this conversation?"
        message="The messages and any unconfirmed suggestions in it will be permanently deleted. Records you already confirmed stay in Records."
        confirmLabel="Delete"
        destructive
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          const id = toDelete;
          setToDelete(null);
          if (id) void deleteConversation(db, id);
        }}
      />
    </Screen>
  );
}
