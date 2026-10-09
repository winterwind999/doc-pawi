import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState, ErrorState, KeyValueRow, LoadingState, Screen, SectionHeader } from '@/components/ui/Layout';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useLiveQuery } from '@/hooks/use-live-query';
import { formatDate, todayLocal } from '@/lib/dates';
import { deleteEvent, deleteTreatment, getTreatmentWithEvents, updateEvent } from '@/lib/db/repositories/treatments';
import {
  EVENT_STATUS_LABELS,
  EVENT_STATUS_TONE,
  EVENT_TYPE_LABELS,
  SOURCE_LABELS,
  TREATMENT_KIND_LABELS,
  TREATMENT_STATUS_LABELS,
  TREATMENT_STATUS_TONE,
} from '@/lib/labels';
import { treatmentEventInputSchema } from '@/lib/validation/schemas';
import { useUnlockedSession } from '@/stores/session-store';

export default function TreatmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db } = useUnlockedSession();
  const t = useLiveQuery((db) => getTreatmentWithEvents(db, id), [id]);
  const [confirm, setConfirm] = useState<{ type: 'treatment' } | { type: 'event'; eventId: string } | null>(null);

  if (t.loading && !t.data) return <LoadingState />;
  if (!t.data) return <ErrorState message="This treatment no longer exists." />;
  const treatment = t.data;
  const today = todayLocal();

  const markCompleted = async (eventId: string) => {
    const e = treatment.events.find((x) => x.id === eventId);
    if (!e) return;
    const input = treatmentEventInputSchema.parse({
      ...e,
      status: 'completed',
      completed_date: e.scheduled_date && e.scheduled_date <= today ? e.scheduled_date : today,
    });
    await updateEvent(db, e.id, input);
  };

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: TREATMENT_KIND_LABELS[treatment.kind] }} />
      <Card className="gap-2">
        <Text accessibilityRole="header" className="text-xl font-bold text-ink">
          {treatment.title}
        </Text>
        <StatusBadge label={TREATMENT_STATUS_LABELS[treatment.status]} tone={TREATMENT_STATUS_TONE[treatment.status]} />
        <View>
          <KeyValueRow label="Started" value={formatDate(treatment.start_date)} />
          {treatment.end_date ? <KeyValueRow label="Ended" value={formatDate(treatment.end_date)} /> : null}
          {treatment.facility ? <KeyValueRow label="Facility" value={treatment.facility} /> : null}
          <KeyValueRow label="Source" value={SOURCE_LABELS[treatment.source_type]} />
        </View>
        {treatment.notes ? <Text className="text-base leading-6 text-ink">{treatment.notes}</Text> : null}
      </Card>

      <SectionHeader
        title="Timeline"
        actionLabel="Add event"
        onAction={() => router.push({ pathname: '/treatments/event', params: { treatmentId: treatment.id } })}
      />
      {treatment.events.length === 0 ? (
        <EmptyState icon="timeline-outline" title="No events yet" message="Add doses, sessions, or visits — completed or scheduled." />
      ) : null}
      {treatment.events.map((e) => (
        <Card key={e.id} className="gap-2">
          <View className="flex-row items-start justify-between gap-2">
            <View className="flex-1">
              <Text className="text-base font-semibold text-ink">{e.title}</Text>
              <Text className="text-sm text-ink-muted">
                {EVENT_TYPE_LABELS[e.event_type]} ·{' '}
                {e.status === 'completed' ? `Completed ${formatDate(e.completed_date, '(date not recorded)')}` : `Scheduled ${formatDate(e.scheduled_date, '(no date)')}`}
                {e.facility ? ` · ${e.facility}` : ''}
              </Text>
              {e.notes ? <Text className="pt-1 text-sm text-ink">{e.notes}</Text> : null}
            </View>
            <StatusBadge label={EVENT_STATUS_LABELS[e.status]} tone={EVENT_STATUS_TONE[e.status]} />
          </View>
          <View className="flex-row flex-wrap gap-2">
            {e.status === 'scheduled' ? (
              <Button label="Mark completed" size="sm" icon="check" variant="secondary" onPress={() => void markCompleted(e.id)} />
            ) : null}
            <Button label="Edit" size="sm" variant="ghost" icon="pencil-outline" onPress={() => router.push({ pathname: '/treatments/event', params: { treatmentId: treatment.id, eventId: e.id } })} />
            <Button label="Delete" size="sm" variant="ghost" icon="trash-can-outline" onPress={() => setConfirm({ type: 'event', eventId: e.id })} />
          </View>
        </Card>
      ))}

      <View className="flex-row gap-2">
        <Button label="Edit treatment" variant="outline" icon="pencil-outline" className="flex-1" onPress={() => router.push({ pathname: '/treatments/edit/[id]', params: { id: treatment.id } })} />
        <Button label="Delete" variant="danger" icon="trash-can-outline" className="flex-1" onPress={() => setConfirm({ type: 'treatment' })} />
      </View>

      <ConfirmDialog
        visible={confirm !== null}
        title={confirm?.type === 'treatment' ? 'Delete this treatment?' : 'Delete this event?'}
        message={
          confirm?.type === 'treatment'
            ? 'The treatment and all of its events will be permanently deleted. Linked medical records are kept.'
            : 'This event will be permanently deleted.'
        }
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const c = confirm;
          setConfirm(null);
          if (c?.type === 'treatment') void deleteTreatment(db, treatment.id).then(() => router.back());
          else if (c?.type === 'event') void deleteEvent(db, c.eventId);
        }}
      />
    </Screen>
  );
}
