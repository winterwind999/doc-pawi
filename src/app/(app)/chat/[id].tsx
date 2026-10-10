import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AssistantBubble, UserBubble } from '@/components/chat/MessageBubble';
import { ProposalCard } from '@/components/chat/ProposalCard';
import { useModelStatus } from '@/components/ModelStatusCard';
import { Banner } from '@/components/ui/Banner';
import { Button, IconButton } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Mascot } from '@/components/ui/Layout';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useLiveQuery } from '@/hooks/use-live-query';
import { formatTimestamp } from '@/lib/dates';
import type { MedicalDocumentRow, MessageRow, RecordProposalRow } from '@/lib/db/models';
import { getConversation, listMessageAttachments, listMessages } from '@/lib/db/repositories/conversations';
import { listDocuments } from '@/lib/db/repositories/documents';
import { listProposalsForConversation } from '@/lib/db/repositories/proposals';
import { CHAT_PREFIX, MAX_ATTACHMENTS, sendChatMessage } from '@/lib/services/chat-service';
import { useDocumentJobs } from '@/lib/services/document-jobs';
import { useChatStream } from '@/stores/chat-stream-store';
import { currentModelMetadata, useModelStore } from '@/stores/model-store';
import { useUnlockedSession } from '@/stores/session-store';
import { colors, type Tone } from '@/theme/colors';

const SUGGESTIONS = [
  'When was my last hepatitis B dose?',
  'What medications am I taking?',
  'I had my flu shot today at the city health center.',
  'What does a high WBC count mean in general?',
];

/** Whether a document can be attached yet, and how to describe its processing state. */
function documentState(d: MedicalDocumentRow, job: { step: 'ocr' | 'ai' } | undefined): { label: string; tone: Tone; attachable: boolean } {
  if (job?.step === 'ocr' || d.processing_status === 'extracting_text') return { label: 'Reading text…', tone: 'info', attachable: false };
  if (!d.extracted_text) {
    return d.processing_status === 'failed'
      ? { label: 'No text found', tone: 'danger', attachable: false }
      : { label: 'Text not read yet', tone: 'neutral', attachable: false };
  }
  if (job?.step === 'ai' || d.processing_status === 'analyzing') return { label: 'Text ready · AI summary running', tone: 'info', attachable: true };
  return { label: 'Ready', tone: 'success', attachable: true };
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, profileId } = useUnlockedSession();
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<{ id: string; name: string }[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const listRef = useRef<FlatList<MessageRow>>(null);
  const activeJob = useModelStore((s) => s.activeJob);
  const modelReady = useModelStore((s) => s.loadState === 'ready');
  const streamConversation = useChatStream((s) => s.conversationId);
  const runningJobs = useDocumentJobs((s) => s.running);
  const generatingHere = streamConversation === id;
  const modelStatus = useModelStatus();
  const headerHeight = useHeaderHeight();

  const data = useLiveQuery(
    async (db) => {
      const [conversation, messages, proposals, documents, attached] = await Promise.all([
        getConversation(db, id),
        listMessages(db, id),
        listProposalsForConversation(db, id),
        listDocuments(db, profileId, 20),
        listMessageAttachments(db, id),
      ]);
      return { conversation, messages, proposals, documents, attached };
    },
    [id],
  );

  const messages = data.data?.messages ?? [];
  const proposalsByMessage = new Map<string, RecordProposalRow[]>();
  for (const p of data.data?.proposals ?? []) {
    if (!p.message_id) continue;
    proposalsByMessage.set(p.message_id, [...(proposalsByMessage.get(p.message_id) ?? []), p]);
  }
  const attachmentNames = new Map<string, string[]>();
  for (const a of data.data?.attached ?? []) {
    attachmentNames.set(a.message_id, [...(attachmentNames.get(a.message_id) ?? []), a.display_name]);
  }

  const scrollToEnd = () => setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 250);

  useEffect(() => {
    if (messages.length) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
  }, [messages.length]);

  // While the user reads or types, evaluate the static instructions so the answer starts sooner.
  // A no-op when the model's cache already holds them (for example right after a previous answer).
  useEffect(() => {
    if (modelReady && !activeJob) void useModelStore.getState().prefill(CHAT_PREFIX);
  }, [modelReady, activeJob]);

  const toggleAttachment = (doc: MedicalDocumentRow) => {
    setAttachments((list) => {
      if (list.some((a) => a.id === doc.id)) return list.filter((a) => a.id !== doc.id);
      if (list.length >= MAX_ATTACHMENTS) return list;
      return [...list, { id: doc.id, name: doc.display_name }];
    });
  };

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || generatingHere || activeJob) return;
    setDraft('');
    setSendError(null);
    const attached = attachments;
    setAttachments([]);
    setPickerOpen(false);
    const stream = useChatStream.getState();
    stream.start(id);
    try {
      const docs = attached
        .map((a) => {
          const doc = data.data?.documents.find((d) => d.id === a.id);
          const docText = doc ? [doc.summary ? `Summary: ${doc.summary}` : '', doc.extracted_text ?? ''].filter(Boolean).join('\n') : '';
          return docText ? { documentId: a.id, name: a.name, text: docText } : null;
        })
        .filter((d): d is NonNullable<typeof d> => d !== null);
      await sendChatMessage({
        db,
        profileId,
        conversationId: id,
        text: question,
        attachments: docs,
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
  const documents = data.data?.documents ?? [];

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-surface-muted">
      <Stack.Screen options={{ title: data.data?.conversation?.title ?? 'Conversation' }} />
      {/* Android 15+ draws edge to edge, so the window does not shrink for the keyboard: this view
          adds bottom padding for the part of the keyboard that covers it. The offset is the header
          (with the status bar) above the screen; the library's automaticOffset measured 0 on the
          test phone and left the composer behind the keyboard. */}
      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={headerHeight} style={{ flex: 1 }}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerClassName="gap-4 p-4"
          keyboardShouldPersistTaps="handled"
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
              <UserBubble message={item} attachmentNames={attachmentNames.get(item.id) ?? []} />
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
          <View className="max-h-80 gap-2 border-t border-line bg-surface p-3">
            <View className="flex-row items-center justify-between gap-2">
              <Text className="flex-1 text-sm font-semibold text-ink">Attach documents (up to {MAX_ATTACHMENTS})</Text>
              <Button label="Done" size="sm" variant="ghost" onPress={() => setPickerOpen(false)} />
            </View>
            <ScrollView className="max-h-52" keyboardShouldPersistTaps="handled" contentContainerClassName="gap-1">
              {documents.length === 0 ? <Text className="text-sm text-ink-muted">No documents imported yet.</Text> : null}
              {documents.map((d) => {
                const state = documentState(d, runningJobs[d.id]);
                const selected = attachments.some((a) => a.id === d.id);
                const full = !selected && attachments.length >= MAX_ATTACHMENTS;
                const disabled = !state.attachable || full;
                return (
                  <Pressable
                    key={d.id}
                    onPress={disabled ? undefined : () => toggleAttachment(d)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected, disabled }}
                    accessibilityLabel={`${d.display_name}, imported ${formatTimestamp(d.imported_at)}, ${state.label}`}
                    className={`min-h-[52px] flex-row items-center gap-2 rounded-xl px-2 py-1.5 ${disabled ? 'opacity-50' : 'active:bg-surface-sunken'}`}
                  >
                    <Icon
                      name={selected ? 'checkbox-marked' : 'checkbox-blank-outline'}
                      size={22}
                      color={selected ? colors.primary600 : colors.inkSoft}
                    />
                    <View className="flex-1 gap-1">
                      <Text className="text-sm text-ink" numberOfLines={1}>
                        {d.display_name}
                      </Text>
                      {/* The import time tells apart documents with the same file name. */}
                      <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
                        <StatusBadge label={state.label} tone={state.tone} />
                        <Text className="text-xs text-ink-muted">{formatTimestamp(d.imported_at)}</Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
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
          {attachments.length ? (
            <View className="flex-row flex-wrap gap-2">
              {attachments.map((a) => (
                <View key={a.id} className="flex-row items-center gap-2 rounded-full bg-ocean-50 px-3 py-1.5">
                  <Icon name="paperclip" size={14} color={colors.ocean600} />
                  <Text className="max-w-[200px] text-xs font-semibold text-ocean-600" numberOfLines={1}>
                    {a.name}
                  </Text>
                  <Pressable
                    onPress={() => setAttachments((list) => list.filter((x) => x.id !== a.id))}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove attachment ${a.name}`}
                    hitSlop={8}
                  >
                    <Icon name="close" size={14} color={colors.ocean600} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
          <View className="flex-row items-end gap-2">
            <IconButton icon="paperclip" label="Attach documents" onPress={() => setPickerOpen((v) => !v)} />
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onFocus={scrollToEnd}
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
