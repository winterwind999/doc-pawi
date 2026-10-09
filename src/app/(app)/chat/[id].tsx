import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AssistantBubble, UserBubble } from '@/components/chat/MessageBubble';
import { ProposalCard } from '@/components/chat/ProposalCard';
import { useModelStatus } from '@/components/ModelStatusCard';
import { Banner } from '@/components/ui/Banner';
import { Button, IconButton } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Mascot } from '@/components/ui/Layout';
import { useLiveQuery } from '@/hooks/use-live-query';
import type { MessageRow, RecordProposalRow } from '@/lib/db/models';
import { getConversation, listMessages } from '@/lib/db/repositories/conversations';
import { listDocuments } from '@/lib/db/repositories/documents';
import { listProposalsForConversation } from '@/lib/db/repositories/proposals';
import { sendChatMessage } from '@/lib/services/chat-service';
import { useChatStream } from '@/stores/chat-stream-store';
import { currentModelMetadata, useModelStore } from '@/stores/model-store';
import { useUnlockedSession } from '@/stores/session-store';
import { colors } from '@/theme/colors';

const SUGGESTIONS = [
  'When was my last hepatitis B dose?',
  'What medications am I taking?',
  'I had my flu shot today at the city health center.',
  'What does a high WBC count mean in general?',
];

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, profileId } = useUnlockedSession();
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState<{ id: string; name: string } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const listRef = useRef<FlatList<MessageRow>>(null);
  const activeJob = useModelStore((s) => s.activeJob);
  const streamConversation = useChatStream((s) => s.conversationId);
  const generatingHere = streamConversation === id;
  const modelStatus = useModelStatus();

  const data = useLiveQuery(
    async (db) => {
      const [conversation, messages, proposals, documents] = await Promise.all([
        getConversation(db, id),
        listMessages(db, id),
        listProposalsForConversation(db, id),
        listDocuments(db, profileId, 20),
      ]);
      return { conversation, messages, proposals, documents };
    },
    [id],
  );

  const messages = data.data?.messages ?? [];
  const proposalsByMessage = new Map<string, RecordProposalRow[]>();
  for (const p of data.data?.proposals ?? []) {
    if (!p.message_id) continue;
    proposalsByMessage.set(p.message_id, [...(proposalsByMessage.get(p.message_id) ?? []), p]);
  }
  const docName = (docId: string | null) => data.data?.documents.find((d) => d.id === docId)?.display_name ?? null;

  useEffect(() => {
    if (messages.length) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
  }, [messages.length]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || generatingHere || activeJob) return;
    setDraft('');
    setSendError(null);
    const attached = attachment;
    setAttachment(null);
    const stream = useChatStream.getState();
    stream.start(id);
    try {
      const doc = attached ? data.data?.documents.find((d) => d.id === attached.id) : null;
      const docText = doc ? [doc.summary ? `Summary: ${doc.summary}` : '', doc.extracted_text ?? ''].filter(Boolean).join('\n') : '';
      await sendChatMessage({
        db,
        profileId,
        conversationId: id,
        text: question,
        attachment: attached && docText ? { documentId: attached.id, name: attached.name, text: docText } : null,
        complete: (request) => useModelStore.getState().complete('chat', request),
        model: currentModelMetadata(),
        onAssistantStarted: (messageId) => useChatStream.getState().attach(messageId),
        onText: (t) => useChatStream.getState().update(t),
      });
    } catch (e) {
      setSendError((e as Error).message);
    } finally {
      useChatStream.getState().finish();
    }
  };

  const notInstalled = modelStatus.label === 'Not installed';

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-surface-muted">
      <Stack.Screen options={{ title: data.data?.conversation?.title ?? 'Conversation' }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerClassName="gap-4 p-4"
          ListHeaderComponent={
            <View className="gap-3">
              {notInstalled ? (
                <Banner
                  tone="pending"
                  title="The on-device AI model is not installed"
                  action={<Button label="Set up AI model" size="sm" onPress={() => router.push('/model')} />}
                >
                  Doc Pawi answers with a language model that runs on this phone. Download it once to start chatting.
                </Banner>
              ) : null}
              {modelStatus.tone === 'danger' ? (
                <Banner tone="danger" action={<Button label="Open AI model" size="sm" variant="outline" onPress={() => router.push('/model')} />}>
                  The local model failed to load. Answers are unavailable until it loads.
                </Banner>
              ) : null}
              {messages.length === 0 ? (
                <View className="items-center gap-3 py-4">
                  <Mascot size={96} />
                  <Text className="text-center text-base text-ink-muted">
                    Ask about your recorded health history, or tell me about a new vaccine dose, test, or visit and I will
                    suggest a record for you to confirm.
                  </Text>
                  <View className="w-full gap-2">
                    {SUGGESTIONS.map((s) => (
                      <Pressable
                        key={s}
                        onPress={() => setDraft(s)}
                        accessibilityRole="button"
                        accessibilityLabel={`Use suggestion: ${s}`}
                        className="min-h-[44px] justify-center rounded-xl border border-line bg-surface px-3.5 active:bg-primary-50"
                      >
                        <Text className="text-sm text-ink">{s}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
          }
          renderItem={({ item }) =>
            item.role === 'user' ? (
              <UserBubble message={item} attachmentName={docName(item.attachment_document_id)} />
            ) : (
              <View className="gap-2">
                <AssistantBubble message={item} />
                {(proposalsByMessage.get(item.id) ?? []).map((p) => (
                  <ProposalCard key={p.id} proposal={p} />
                ))}
              </View>
            )
          }
          ListFooterComponent={sendError ? <Banner tone="danger">{sendError}</Banner> : null}
        />

        {pickerOpen ? (
          <View className="max-h-64 gap-2 border-t border-line bg-surface p-3">
            <Text className="text-sm font-semibold text-ink">Attach a processed document</Text>
            {(data.data?.documents ?? []).filter((d) => d.extracted_text).slice(0, 6).map((d) => (
              <Pressable
                key={d.id}
                onPress={() => {
                  setAttachment({ id: d.id, name: d.display_name });
                  setPickerOpen(false);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Attach ${d.display_name}`}
                className="min-h-[44px] flex-row items-center gap-2 rounded-xl px-2 active:bg-surface-sunken"
              >
                <Icon name="file-document-outline" size={20} color={colors.ocean600} />
                <Text className="flex-1 text-sm text-ink" numberOfLines={1}>
                  {d.display_name}
                </Text>
              </Pressable>
            ))}
            <Button
              label="Import a new document"
              size="sm"
              variant="outline"
              icon="file-upload-outline"
              onPress={() => {
                setPickerOpen(false);
                router.push('/documents/import');
              }}
            />
          </View>
        ) : null}

        <View className="gap-2 border-t border-line bg-surface p-3">
          {attachment ? (
            <View className="flex-row items-center gap-2 self-start rounded-full bg-ocean-50 px-3 py-1.5">
              <Icon name="paperclip" size={14} color={colors.ocean600} />
              <Text className="max-w-[220px] text-xs font-semibold text-ocean-600" numberOfLines={1}>
                {attachment.name}
              </Text>
              <Pressable onPress={() => setAttachment(null)} accessibilityRole="button" accessibilityLabel="Remove attachment" hitSlop={8}>
                <Icon name="close" size={14} color={colors.ocean600} />
              </Pressable>
            </View>
          ) : null}
          <View className="flex-row items-end gap-2">
            <IconButton icon="paperclip" label="Attach a document" onPress={() => setPickerOpen((v) => !v)} />
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={activeJob === 'document' ? 'Doc Pawi is analyzing a document…' : 'Ask about your health records…'}
              placeholderTextColor={colors.inkSoft}
              multiline
              maxLength={1000}
              accessibilityLabel="Message to Doc Pawi"
              className="max-h-32 min-h-[44px] flex-1 rounded-2xl border border-line-strong bg-surface-muted px-3.5 py-2.5 text-base text-ink"
            />
            {generatingHere ? (
              <IconButton icon="stop-circle" label="Stop generating" color={colors.coral600} onPress={() => useModelStore.getState().stop()} />
            ) : (
              <IconButton
                icon="send-circle"
                label="Send message"
                color={colors.primary600}
                disabled={!draft.trim() || !!activeJob || notInstalled}
                onPress={() => void send(draft)}
              />
            )}
          </View>
          <Text className="text-center text-[11px] text-ink-soft">
            Runs entirely on this phone · Can be wrong · Not a substitute for professional care
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
