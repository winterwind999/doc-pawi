import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ErrorState, KeyValueRow, LoadingState, Screen, SectionHeader } from '@/components/ui/Layout';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useLiveQuery } from '@/hooks/use-live-query';
import { formatDate, formatTimestamp, isValidIsoDate } from '@/lib/dates';
import { getDoctor } from '@/lib/db/repositories/doctors';
import { getDocument } from '@/lib/db/repositories/documents';
import { deleteRecord, getRecord } from '@/lib/db/repositories/records';
import { parseJson } from '@/lib/json';
import { CATEGORY_LABELS, SOURCE_LABELS, SOURCE_TONE } from '@/lib/labels';
import { useUnlockedSession } from '@/stores/session-store';

interface LabRow {
  test?: string;
  value?: string;
  unit?: string;
  reference_range?: string;
  flag?: string;
}

export default function RecordDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db } = useUnlockedSession();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const data = useLiveQuery(
    async (db) => {
      const record = await getRecord(db, id);
      if (!record) return null;
      const [document, doctor] = await Promise.all([
        record.document_id ? getDocument(db, record.document_id) : null,
        record.doctor_id ? getDoctor(db, record.doctor_id) : null,
      ]);
      return { record, document, doctor };
    },
    [id],
  );

  if (data.loading && !data.data) return <LoadingState />;
  if (!data.data) return <ErrorState message="This record no longer exists." />;
  const { record, document, doctor } = data.data;
  const structured = parseJson<Record<string, unknown>>(record.structured_data, {});
  const labs = (Array.isArray(structured.lab_results) ? structured.lab_results : []) as LabRow[];
  const medications = (Array.isArray(structured.medications) ? structured.medications : []) as Record<string, string>[];
  const vaccinations = (Array.isArray(structured.vaccinations) ? structured.vaccinations : []) as Record<string, string>[];
  const diagnoses = (Array.isArray(structured.diagnoses) ? structured.diagnoses : []) as string[];

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: CATEGORY_LABELS[record.category] }} />
      <Card className="gap-2">
        <Text accessibilityRole="header" className="text-xl font-bold text-ink">
          {record.title}
        </Text>
        <StatusBadge label={SOURCE_LABELS[record.source_type]} tone={SOURCE_TONE[record.source_type]} />
        <View>
          <KeyValueRow label="Date" value={formatDate(record.event_date)} />
          <KeyValueRow label="Category" value={CATEGORY_LABELS[record.category]} />
          {record.facility ? <KeyValueRow label="Facility" value={record.facility} /> : null}
          {doctor ? <KeyValueRow label="Doctor" value={doctor.name} /> : null}
          {typeof structured.clinician === 'string' && structured.clinician ? <KeyValueRow label="Clinician (from document)" value={structured.clinician} /> : null}
        </View>
        {record.summary ? <Text selectable className="text-base leading-6 text-ink">{record.summary}</Text> : null}
      </Card>

      {labs.length ? (
        <>
          <SectionHeader title="Results" />
          <Card className="gap-0">
            {labs.map((l, i) => (
              <View key={`${l.test}-${i}`} className="flex-row items-center justify-between gap-3 border-b border-line py-2.5">
                <View className="flex-1">
                  <Text className="text-base font-semibold text-ink">{l.test}</Text>
                  {l.reference_range ? <Text className="text-xs text-ink-muted">Reference: {l.reference_range}</Text> : null}
                </View>
                <View className="items-end gap-1">
                  <Text selectable className="text-lg font-bold text-ink">
                    {l.value} {l.unit ?? ''}
                  </Text>
                  {l.flag && l.flag !== 'normal' ? (
                    <StatusBadge label={`Marked ${l.flag} on report`} tone="pending" />
                  ) : null}
                </View>
              </View>
            ))}
            <Text className="pt-2 text-xs leading-4 text-ink-muted">
              Flags are copied from the document; Doc Pawi does not interpret results. Discuss them with your doctor.
            </Text>
          </Card>
        </>
      ) : null}

      {medications.length || vaccinations.length || diagnoses.length ? (
        <Card className="gap-2">
          {diagnoses.length ? <KeyValueRow label="Diagnoses (as written)" value={diagnoses.join(', ')} /> : null}
          {medications.map((m, i) => (
            <KeyValueRow key={`m${i}`} label="Medication (as written)" value={[m.name, m.strength, m.instructions].filter(Boolean).join(' · ')} />
          ))}
          {vaccinations.map((v, i) => (
            <KeyValueRow
              key={`v${i}`}
              label="Vaccination (as written)"
              value={[v.vaccine, v.dose, isValidIsoDate(v.date) ? formatDate(v.date) : v.date].filter(Boolean).join(' · ')}
            />
          ))}
        </Card>
      ) : null}

      <SectionHeader title="Provenance" />
      <Card className="gap-1">
        <KeyValueRow label="Source" value={SOURCE_LABELS[record.source_type]} />
        <KeyValueRow label="Created" value={formatTimestamp(record.created_at)} />
        <KeyValueRow label="Last updated" value={formatTimestamp(record.updated_at)} />
        {record.source_type === 'document' && !document ? (
          <Banner tone="neutral">The source document was deleted; the record’s data was kept.</Banner>
        ) : null}
        {document ? (
          <Button
            label={`Open source document: ${document.display_name}`}
            variant="ghost"
            icon="file-document-outline"
            onPress={() => router.push({ pathname: '/documents/[id]', params: { id: document.id } })}
          />
        ) : null}
      </Card>

      <View className="flex-row gap-2">
        <Button label="Edit" icon="pencil-outline" variant="outline" className="flex-1" onPress={() => router.push({ pathname: '/records/edit/[id]', params: { id: record.id } })} />
        <Button label="Delete" icon="trash-can-outline" variant="danger" className="flex-1" onPress={() => setConfirmDelete(true)} />
      </View>

      <ConfirmDialog
        visible={confirmDelete}
        title="Delete this record?"
        message="The record will be permanently removed from this phone. A linked source document is kept and can be deleted separately."
        confirmLabel="Delete record"
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void deleteRecord(db, record.id).then(() => router.back());
        }}
      />
    </Screen>
  );
}
