import { router } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { TreatmentCard } from '@/components/records/TreatmentCard';
import { Button } from '@/components/ui/Button';
import { ChoiceChips, SegmentedTabs } from '@/components/ui/Choice';
import { Icon, type IconName } from '@/components/ui/Icon';
import { EmptyState, ErrorState, ListItem, LoadingState, Screen } from '@/components/ui/Layout';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useLiveQuery } from '@/hooks/use-live-query';
import { formatDate, formatTimestamp } from '@/lib/dates';
import { RECORD_CATEGORIES, type RecordCategory } from '@/lib/db/models';
import { listDocuments } from '@/lib/db/repositories/documents';
import { listRecords } from '@/lib/db/repositories/records';
import { listTreatmentsWithEvents } from '@/lib/db/repositories/treatments';
import {
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUS_TONE,
  SOURCE_LABELS,
  SOURCE_TONE,
} from '@/lib/labels';
import { colors } from '@/theme/colors';

type Segment = 'records' | 'vaccinations' | 'treatments' | 'documents';

export default function RecordsScreen() {
  const [segment, setSegment] = useState<Segment>('records');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<RecordCategory | null>(null);

  const records = useLiveQuery((db, p) => listRecords(db, p, { search, category }), [search, category]);
  const vaccines = useLiveQuery((db, p) => listTreatmentsWithEvents(db, p, { kind: 'vaccination' }));
  const treatments = useLiveQuery((db, p) => listTreatmentsWithEvents(db, p, { excludeKind: 'vaccination' }));
  const documents = useLiveQuery((db, p) => listDocuments(db, p));

  return (
    <Screen>
      <SegmentedTabs<Segment>
        options={[
          { value: 'records', label: 'Records' },
          { value: 'vaccinations', label: 'Vaccinations' },
          { value: 'treatments', label: 'Treatments' },
          { value: 'documents', label: 'Documents' },
        ]}
        value={segment}
        onChange={setSegment}
      />

      {segment === 'records' ? (
        <>
          <View className="flex-row gap-2">
            <Button label="Add record" icon="plus" className="flex-1" onPress={() => router.push('/records/new')} />
            <Button label="Import document" icon="file-upload-outline" variant="secondary" className="flex-1" onPress={() => router.push('/documents/import')} />
          </View>
          <View className="min-h-[48px] flex-row items-center gap-2 rounded-xl border border-line-strong bg-surface px-3">
            <Icon name="magnify" size={20} color={colors.inkMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search records"
              placeholderTextColor={colors.inkSoft}
              accessibilityLabel="Search records"
              className="flex-1 py-2.5 text-base text-ink"
            />
          </View>
          <ChoiceChips
            options={RECORD_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] }))}
            value={category}
            onChange={setCategory}
            allowDeselect
          />
          {records.error ? <ErrorState message={records.error.message} onRetry={records.refresh} /> : null}
          {records.loading && !records.data ? <LoadingState /> : null}
          {records.data?.length === 0 ? (
            <EmptyState
              icon="folder-heart-outline"
              title={search || category ? 'No matching records' : 'No records yet'}
              message="Add a record yourself, import a document, or confirm an AI suggestion from a chat."
            />
          ) : null}
          {records.data?.map((r) => (
            <ListItem
              key={r.id}
              icon={CATEGORY_ICONS[r.category] as IconName}
              title={r.title}
              subtitle={`${CATEGORY_LABELS[r.category]} · ${formatDate(r.event_date)}${r.facility ? ` · ${r.facility}` : ''}`}
              right={r.source_type !== 'manual' ? <StatusBadge label={r.source_type === 'demo' ? 'Demo' : r.source_type === 'document' ? 'Doc' : 'AI'} tone={SOURCE_TONE[r.source_type]} /> : null}
              accessibilityHint={SOURCE_LABELS[r.source_type]}
              onPress={() => router.push({ pathname: '/records/[id]', params: { id: r.id } })}
            />
          ))}
        </>
      ) : null}

      {segment === 'vaccinations' ? (
        <>
          <Button label="Add vaccine series or dose" icon="needle" onPress={() => router.push({ pathname: '/treatments/new', params: { kind: 'vaccination' } })} />
          {vaccines.loading && !vaccines.data ? <LoadingState /> : null}
          {vaccines.data?.length === 0 ? (
            <EmptyState icon="needle" title="No vaccinations recorded" message="Record vaccine doses here, or tell Doc Pawi in a chat (for example “I got my 2nd hepatitis B dose today”)." />
          ) : null}
          {vaccines.data?.map((t) => <TreatmentCard key={t.id} treatment={t} />)}
        </>
      ) : null}

      {segment === 'treatments' ? (
        <>
          <Button label="Add treatment" icon="plus" onPress={() => router.push('/treatments/new')} />
          {treatments.loading && !treatments.data ? <LoadingState /> : null}
          {treatments.data?.length === 0 ? (
            <EmptyState icon="heart-pulse" title="No treatments recorded" message="Track courses such as physical therapy, a medication course, or a series of procedures." />
          ) : null}
          {treatments.data?.map((t) => <TreatmentCard key={t.id} treatment={t} />)}
        </>
      ) : null}

      {segment === 'documents' ? (
        <>
          <Button label="Import document" icon="file-upload-outline" onPress={() => router.push('/documents/import')} />
          <Text className="text-xs leading-4 text-ink-muted">Documents are encrypted on this phone (AES-256-GCM) and read with on-device text recognition.</Text>
          {documents.data?.length === 0 ? (
            <EmptyState icon="file-document-outline" title="No documents" message="Import a photo or PDF of a lab result, prescription, or vaccination card." />
          ) : null}
          {documents.data?.map((d) => (
            <ListItem
              key={d.id}
              icon={d.mime_type === 'application/pdf' ? 'file-pdf-box' : 'file-image-outline'}
              title={d.display_name}
              subtitle={`Imported ${formatTimestamp(d.imported_at)}`}
              right={<StatusBadge label={DOCUMENT_STATUS_LABELS[d.processing_status]} tone={DOCUMENT_STATUS_TONE[d.processing_status]} />}
              onPress={() => router.push({ pathname: '/documents/[id]', params: { id: d.id } })}
            />
          ))}
        </>
      ) : null}
    </Screen>
  );
}
