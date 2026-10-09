import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ErrorState, KeyValueRow, LoadingState, Screen, SectionHeader } from '@/components/ui/Layout';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useLiveQuery } from '@/hooks/use-live-query';
import { formatDate, formatTimeOfDay } from '@/lib/dates';
import { getDoctor } from '@/lib/db/repositories/doctors';
import { archiveMedication, deleteMedication, getMedication, listDoseHistory, restoreMedication } from '@/lib/db/repositories/medications';
import { MEDICATION_FORM_LABELS, SOURCE_LABELS } from '@/lib/labels';
import { reconcileReminders } from '@/lib/notifications/reminders';
import { useSession, useUnlockedSession } from '@/stores/session-store';

export default function MedicationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, profileId } = useUnlockedSession();
  const settings = useSession((s) => s.settings);
  const [confirm, setConfirm] = useState<'archive' | 'delete' | null>(null);
  const data = useLiveQuery(
    async (db, p) => {
      const med = await getMedication(db, id);
      if (!med) return null;
      const [history, prescriber] = await Promise.all([
        listDoseHistory(db, p, { medicationId: id, limit: 50 }),
        med.prescriber_doctor_id ? getDoctor(db, med.prescriber_doctor_id) : null,
      ]);
      return { med, history, prescriber };
    },
    [id],
  );

  if (data.loading && !data.data) return <LoadingState />;
  if (!data.data) return <ErrorState message="This medication no longer exists." />;
  const { med, history, prescriber } = data.data;
  const taken = history.filter((h) => h.status === 'taken').length;
  const skipped = history.filter((h) => h.status === 'skipped').length;
  const sync = () => reconcileReminders(db, profileId, settings).catch(() => undefined);

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: 'Medication' }} />
      <Card className="gap-2">
        <Text accessibilityRole="header" className="text-xl font-bold text-ink">
          {med.name} {med.strength ?? ''}
        </Text>
        <StatusBadge label={med.status === 'active' ? 'Active' : 'Archived'} tone={med.status === 'active' ? 'success' : 'neutral'} />
        <View>
          {med.form ? <KeyValueRow label="Form" value={MEDICATION_FORM_LABELS[med.form]} /> : null}
          <KeyValueRow label="Dose times" value={med.schedules.length ? med.schedules.map((s) => `${formatTimeOfDay(s.time_of_day)}${s.dose_label ? ` (${s.dose_label})` : ''}`).join('\n') : 'None'} />
          <KeyValueRow label="Start" value={formatDate(med.start_date, 'Not recorded')} />
          {med.end_date ? <KeyValueRow label="End" value={formatDate(med.end_date)} /> : null}
          {prescriber ? <KeyValueRow label="Prescriber" value={prescriber.name} /> : null}
          <KeyValueRow label="Source" value={SOURCE_LABELS[med.source_type]} />
        </View>
        {med.instructions ? <Text className="text-base leading-6 text-ink">{med.instructions}</Text> : null}
      </Card>

      <SectionHeader title={`Dose history (${taken} taken · ${skipped} skipped)`} />
      {history.length ? (
        history.map((h) => (
          <View key={h.id} className="flex-row items-center justify-between rounded-2xl border border-line bg-surface p-3">
            <Text className="text-sm text-ink">
              {formatDate(h.scheduled_for.slice(0, 10))} · {formatTimeOfDay(h.scheduled_for.slice(11))}
            </Text>
            <StatusBadge label={h.status === 'taken' ? 'Taken' : 'Skipped'} tone={h.status === 'taken' ? 'success' : 'neutral'} />
          </View>
        ))
      ) : (
        <Text className="text-sm text-ink-muted">No doses recorded yet.</Text>
      )}

      <View className="gap-2">
        <Button label="Edit" variant="outline" icon="pencil-outline" onPress={() => router.push({ pathname: '/meds/edit/[id]', params: { id: med.id } })} />
        {med.status === 'active' ? (
          <Button label="Archive (stop tracking)" variant="secondary" icon="archive-outline" onPress={() => setConfirm('archive')} />
        ) : (
          <Button label="Restore to active" variant="secondary" icon="archive-arrow-up-outline" onPress={() => void restoreMedication(db, med.id).then(sync)} />
        )}
        <Button label="Delete permanently" variant="danger" icon="trash-can-outline" onPress={() => setConfirm('delete')} />
      </View>

      <ConfirmDialog
        visible={confirm !== null}
        title={confirm === 'archive' ? 'Archive this medication?' : 'Delete this medication permanently?'}
        message={
          confirm === 'archive'
            ? 'Reminders stop and it moves to Archived. Its dose history is kept.'
            : 'The medication, its dose times, and its entire dose history will be permanently deleted. Archive it instead if you want to keep the history.'
        }
        confirmLabel={confirm === 'archive' ? 'Archive' : 'Delete'}
        destructive={confirm === 'delete'}
        requireText={confirm === 'delete' ? 'DELETE' : undefined}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const action = confirm;
          setConfirm(null);
          if (action === 'archive') void archiveMedication(db, med.id).then(sync);
          if (action === 'delete') void deleteMedication(db, med.id).then(sync).then(() => router.back());
        }}
      />
    </Screen>
  );
}
