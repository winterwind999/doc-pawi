import { File } from 'expo-file-system';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import { ZodError } from 'zod';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ChoiceChips } from '@/components/ui/Choice';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DateField } from '@/components/ui/DateField';
import { Icon } from '@/components/ui/Icon';
import { ErrorState, KeyValueRow, LoadingState, Screen, SectionHeader } from '@/components/ui/Layout';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TextField } from '@/components/ui/TextField';
import { useLiveQuery } from '@/hooks/use-live-query';
import { checkSummaryConsistency } from '@/lib/ai/extraction';
import { formatBytes } from '@/lib/ai/model-catalog';
import { formatTimestamp, todayLocal } from '@/lib/dates';
import { RECORD_CATEGORIES, type MedicalDocumentRow } from '@/lib/db/models';
import { getDocument } from '@/lib/db/repositories/documents';
import { listProposalsForDocument } from '@/lib/db/repositories/proposals';
import { CATEGORY_LABELS, DOCUMENT_STATUS_LABELS, DOCUMENT_STATUS_TONE } from '@/lib/labels';
import { runAnalysis, runOcr, useDocumentJobs } from '@/lib/services/document-jobs';
import { decryptForViewing, deleteDocument } from '@/lib/services/document-service';
import {
  confirmProposal,
  readProposalPayload,
  rejectProposal,
  type RecordProposalPayload,
} from '@/lib/services/proposal-service';
import { fieldErrors } from '@/lib/validation/schemas';
import { useModelStore } from '@/stores/model-store';
import { useUnlockedSession } from '@/stores/session-store';
import { colors } from '@/theme/colors';

interface LabRow {
  test: string;
  value: string;
  unit: string;
  reference_range: string;
  flag: string;
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(since);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <Text className="text-xs text-ink-muted">{Math.round((now - since) / 1000)} s elapsed</Text>;
}

function Preview({ doc }: { doc: MedicalDocumentRow }) {
  const { profileId } = useUnlockedSession();
  const [uri, setUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!show || uri) return;
    let file: File | null = null;
    decryptForViewing(profileId, doc).then(
      (f) => {
        file = f;
        setUri(f.uri);
      },
      (e: Error) => setError(e.message),
    );
    return () => {
      // Remove the temporary plaintext copy as soon as the preview closes.
      try {
        if (file?.exists) file.delete();
      } catch {
        // best-effort
      }
    };
  }, [show, uri, doc, profileId]);

  if (doc.mime_type === 'application/pdf') {
    return <Text className="text-sm text-ink-muted">PDF preview is not available in the app; the extracted text is shown below.</Text>;
  }
  if (!show) return <Button label="Show image" size="sm" variant="outline" icon="eye-outline" onPress={() => setShow(true)} />;
  if (error) return <Banner tone="danger">{error}</Banner>;
  if (!uri) return <ActivityIndicator color={colors.primary} />;
  return (
    <Image
      source={{ uri }}
      accessibilityLabel={`Image of ${doc.display_name}`}
      className="w-full rounded-xl bg-surface-sunken"
      style={{ aspectRatio: 0.72 }}
      resizeMode="contain"
    />
  );
}

function ReviewForm({ proposalId, initial, docText }: { proposalId: string; initial: RecordProposalPayload; docText: string }) {
  const { db, profileId } = useUnlockedSession();
  const [payload, setPayload] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'confirm' | 'reject' | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const r = payload.record;
  const labs = ((r.structured_data.lab_results as LabRow[] | undefined) ?? []).slice();
  const unverified = new Set(payload.unverified_fields);
  // Re-checked as the user edits, so the warning clears once the summary is corrected.
  const summaryWarnings = checkSummaryConsistency(r.summary ?? '', labs);
  const set = (patch: Partial<RecordProposalPayload['record']>) => setPayload({ ...payload, record: { ...r, ...patch } });
  const removeLab = (i: number) => {
    const next = labs.filter((_, idx) => idx !== i);
    set({ structured_data: { ...r.structured_data, lab_results: next } });
    // Re-index unverified paths after removal.
    setPayload((p) => ({
      ...p,
      record: { ...p.record, structured_data: { ...p.record.structured_data, lab_results: next } },
      unverified_fields: p.unverified_fields
        .filter((f) => !f.startsWith(`lab_results.${i}.`))
        .map((f) => {
          const m = /^lab_results\.(\d+)\.(.+)$/.exec(f);
          return m && Number(m[1]) > i ? `lab_results.${Number(m[1]) - 1}.${m[2]}` : f;
        }),
    }));
  };

  const confirm = async () => {
    setBusy('confirm');
    setErrors({});
    setFailure(null);
    try {
      const result = await confirmProposal(db, { profileId, proposalId, editedPayload: payload });
      router.replace({ pathname: '/records/[id]', params: { id: result.id } });
    } catch (e) {
      if (e instanceof ZodError) {
        setErrors(fieldErrors(e));
        setFailure('Please fix the highlighted fields.');
      } else setFailure((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View className="gap-3">
      <Banner tone="pending" title="Review the AI suggestion">
        Values marked “Verify” were not found word-for-word in the recognized text. Check them against the original
        document. Nothing is saved until you confirm.
      </Banner>
      {payload.unverified_fields.includes('document_date') && !r.event_date ? (
        <Text className="text-xs text-sand-700">The document date could not be confirmed from the text — enter it if you know it.</Text>
      ) : null}
      <ChoiceChips
        label="Category"
        options={RECORD_CATEGORIES.map((v) => ({ value: v, label: CATEGORY_LABELS[v] }))}
        value={r.category}
        onChange={(v) => v && set({ category: v })}
        error={errors.category}
      />
      <TextField label="Title" value={r.title} onChangeText={(title) => set({ title })} error={errors.title} required />
      <DateField label="Document date" value={r.event_date ?? ''} onChange={(v) => set({ event_date: v || null })} error={errors.event_date} maxDate={todayLocal()} />
      <TextField
        label={`Facility${unverified.has('facility') ? ' (verify)' : ''}`}
        value={r.facility ?? ''}
        onChangeText={(v) => set({ facility: v || null })}
        error={errors.facility}
      />
      <TextField
        label={`Summary (AI-generated — ${summaryWarnings.length ? 'check before saving' : 'edit as needed'})`}
        value={r.summary ?? ''}
        onChangeText={(v) => set({ summary: v || null })}
        multiline
        error={errors.summary}
      />
      {summaryWarnings.map((w) => (
        <View key={w} className="flex-row gap-2 rounded-xl bg-sand-50 p-2.5">
          <Icon name="alert-outline" size={16} color={colors.sand700} />
          <Text className="flex-1 text-xs leading-4 text-sand-700">{w}</Text>
        </View>
      ))}
      {labs.length ? (
        <View className="gap-2">
          <Text className="text-sm font-semibold text-ink">Extracted values</Text>
          {labs.map((l, i) => {
            const flagged = ['test', 'value', 'unit', 'reference_range'].some((k) => unverified.has(`lab_results.${i}.${k}`));
            return (
              <View key={`${l.test}-${i}`} className={`flex-row items-center gap-2 rounded-xl border p-2.5 ${flagged ? 'border-sand-300 bg-sand-50' : 'border-line bg-surface'}`}>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-ink">{l.test}</Text>
                  <Text className="text-base font-bold text-ink">
                    {l.value} {l.unit}
                  </Text>
                  {l.reference_range ? <Text className="text-xs text-ink-muted">Ref: {l.reference_range}{l.flag ? ` · marked ${l.flag}` : ''}</Text> : null}
                </View>
                <StatusBadge label={flagged ? 'Verify' : 'Found in text'} tone={flagged ? 'pending' : 'success'} />
                <Pressable onPress={() => removeLab(i)} accessibilityRole="button" accessibilityLabel={`Remove ${l.test}`} className="h-10 w-10 items-center justify-center rounded-full active:bg-surface-sunken">
                  <Icon name="close" size={18} color={colors.inkMuted} />
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : null}
      {failure ? <Banner tone="danger">{failure}</Banner> : null}
      <View className="flex-row gap-2">
        <Button label="Confirm & save" icon="check" className="flex-1" loading={busy === 'confirm'} disabled={busy !== null} onPress={() => void confirm()} />
        <Button
          label="Reject"
          icon="close"
          variant="outline"
          loading={busy === 'reject'}
          disabled={busy !== null}
          onPress={() => {
            setBusy('reject');
            void rejectProposal(db, proposalId).finally(() => setBusy(null));
          }}
        />
      </View>
      <Text className="text-xs text-ink-muted">{docText ? `Checked against ${docText.length} characters of recognized text.` : ''}</Text>
    </View>
  );
}

export default function DocumentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, profileId } = useUnlockedSession();
  const job = useDocumentJobs((s) => s.running[id]);
  const jobError = useDocumentJobs((s) => s.lastError[id]);
  const modelInstalled = useModelStore((s) => !!s.files[s.selectedModelId]?.verified);
  const [showText, setShowText] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const data = useLiveQuery(
    async (db) => {
      const doc = await getDocument(db, id);
      const proposals = doc ? await listProposalsForDocument(db, id) : [];
      return { doc, proposals };
    },
    [id],
  );

  if (data.loading && !data.data) return <LoadingState />;
  const doc = data.data?.doc;
  if (!doc) return <ErrorState message="This document no longer exists." />;
  const pending = data.data?.proposals.find((p) => p.status === 'pending');
  const confirmed = data.data?.proposals.find((p) => p.status === 'confirmed');
  const pendingPayload = pending ? readProposalPayload(pending) : null;
  const reviewLabs =
    pendingPayload?.kind === 'medical_record' ? ((pendingPayload.record.structured_data.lab_results as LabRow[] | undefined) ?? []) : [];
  const summaryWarnings = doc.summary ? checkSummaryConsistency(doc.summary, reviewLabs) : [];

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: 'Document' }} />
      <Card className="gap-2">
        <Text accessibilityRole="header" className="text-lg font-bold text-ink">
          {doc.display_name}
        </Text>
        <StatusBadge label={DOCUMENT_STATUS_LABELS[doc.processing_status]} tone={DOCUMENT_STATUS_TONE[doc.processing_status]} />
        <View>
          <KeyValueRow label="Type" value={doc.mime_type === 'application/pdf' ? 'PDF' : doc.mime_type.replace('image/', '').toUpperCase()} />
          <KeyValueRow label="Size" value={formatBytes(doc.file_size)} />
          <KeyValueRow label="Imported" value={formatTimestamp(doc.imported_at)} />
          <KeyValueRow label="Storage" value="Encrypted (AES-256-GCM, Android Keystore key)" />
          {doc.source_type === 'demo' ? <KeyValueRow label="Origin" value="Synthetic sample (fictional)" /> : null}
        </View>
        <Preview doc={doc} />
      </Card>

      {job ? (
        <Card className="flex-row items-center gap-3">
          <ActivityIndicator color={colors.primary} />
          <View className="flex-1">
            <Text className="text-base font-semibold text-ink">
              {job.step === 'ocr' ? 'Reading text on this phone…' : 'Analyzing with the local AI model…'}
            </Text>
            <Text className="text-xs text-ink-muted">
              {job.step === 'ai' ? 'This can take 1–3 minutes on mid-range phones. You can leave this screen.' : 'On-device OCR'}
            </Text>
            <Elapsed since={job.startedAt} />
          </View>
          {job.step === 'ai' ? <Button label="Stop" size="sm" variant="outline" onPress={() => useModelStore.getState().stop()} /> : null}
        </Card>
      ) : null}

      {jobError ? <Banner tone="danger">{jobError}</Banner> : null}
      {doc.error_message && !job ? <Banner tone={doc.processing_status === 'failed' ? 'danger' : 'pending'}>{doc.error_message}</Banner> : null}

      {!job && (doc.processing_status === 'imported' || (doc.processing_status === 'failed' && !doc.extracted_text)) ? (
        <Button label="Read text on device" icon="text-recognition" onPress={() => void runOcr(db, profileId, doc.id)} />
      ) : null}

      {!job && doc.extracted_text && !pending && doc.processing_status !== 'confirmed' ? (
        modelInstalled ? (
          <Button label={doc.summary ? 'Analyze again with local AI' : 'Analyze with local AI'} icon="creation-outline" onPress={() => void runAnalysis(db, profileId, doc.id)} />
        ) : (
          <Banner tone="pending" title="AI analysis needs the on-device model" action={<Button label="Set up AI model" size="sm" onPress={() => router.push('/model')} />}>
            The text was read successfully. Install the model to get a summary and suggested record, or add a record manually.
          </Banner>
        )
      ) : null}

      {doc.summary ? (
        <>
          <SectionHeader title="AI summary" />
          <Card className="gap-1 border-ocean-200 bg-ocean-50">
            <Text selectable className="text-base leading-6 text-ink">
              {doc.summary}
            </Text>
            <Text className="text-xs text-ocean-600">Generated on this phone by the local model. May contain errors — not medical advice.</Text>
            {summaryWarnings.map((w) => (
              <Text key={w} className="text-xs font-semibold text-sand-700">
                {w}
              </Text>
            ))}
          </Card>
        </>
      ) : null}

      {pending && pendingPayload?.kind === 'medical_record' && !job ? (
        <ReviewForm key={pending.id} proposalId={pending.id} initial={pendingPayload} docText={doc.extracted_text ?? ''} />
      ) : null}

      {confirmed?.result_entity_id ? (
        <Banner tone="success" title="Saved to your records" action={<Button label="Open record" size="sm" variant="outline" onPress={() => router.push({ pathname: '/records/[id]', params: { id: confirmed.result_entity_id! } })} />}>
          You confirmed the extracted information.
        </Banner>
      ) : null}

      {doc.extracted_text ? (
        <>
          <SectionHeader title="Recognized text" actionLabel={showText ? 'Hide' : 'Show'} onAction={() => setShowText((v) => !v)} />
          {showText ? (
            <Card>
              <Text selectable className="font-mono text-xs leading-5 text-ink">
                {doc.extracted_text}
              </Text>
            </Card>
          ) : (
            <Text className="text-xs text-ink-muted">
              {doc.extracted_text.length} characters recognized with {doc.ocr_engine ?? 'on-device OCR'}
              {doc.page_count ? ` from ${doc.page_count} page${doc.page_count === 1 ? '' : 's'}` : ''}.
            </Text>
          )}
        </>
      ) : null}

      <View className="flex-row gap-2">
        <Button label="Add record manually" variant="outline" icon="plus" className="flex-1" onPress={() => router.push('/records/new')} />
        <Button label="Delete" variant="danger" icon="trash-can-outline" onPress={() => setConfirmDelete(true)} />
      </View>
      <ConfirmDialog
        visible={confirmDelete}
        title="Delete this document?"
        message="The encrypted file and its extracted text will be permanently deleted. Records you already saved from it are kept (their link to the document is removed)."
        confirmLabel="Delete document"
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void deleteDocument(db, doc.id).then(() => router.back());
        }}
      />
    </Screen>
  );
}
