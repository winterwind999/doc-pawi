import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Text, View } from 'react-native';

import { DoseRow } from '@/components/meds/DoseRow';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { SegmentedTabs } from '@/components/ui/Choice';
import { EmptyState, ErrorState, ListItem, LoadingState, Screen, SectionHeader } from '@/components/ui/Layout';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useLiveQuery } from '@/hooks/use-live-query';
import { addDays, formatDate, formatTimeOfDay, localTimeOfDay, todayLocal } from '@/lib/dates';
import { getDoseSlotsForDate, listDoseHistory, listMedications } from '@/lib/db/repositories/medications';
import { MEDICATION_FORM_LABELS } from '@/lib/labels';
import {
  getReminderPermission,
  reconcileReminders,
  requestReminderPermission,
  type ReminderPermission,
} from '@/lib/notifications/reminders';
import { useSession } from '@/stores/session-store';

type Segment = 'today' | 'active' | 'archived' | 'history';

export default function MedsScreen() {
  const [segment, setSegment] = useState<Segment>('today');
  const [permission, setPermission] = useState<ReminderPermission | null>(null);
  const remindersEnabled = useSession((s) => s.settings.remindersEnabled);
  const today = todayLocal();
  const tomorrow = addDays(today, 1);

  useFocusEffect(
    useCallback(() => {
      void getReminderPermission().then(setPermission);
    }, []),
  );

  const data = useLiveQuery(
    async (db, p) => {
      const nowLocal = `${today}T${localTimeOfDay(new Date())}`;
      const [todaySlots, tomorrowSlots, meds, history] = await Promise.all([
        getDoseSlotsForDate(db, p, today, nowLocal),
        getDoseSlotsForDate(db, p, tomorrow, nowLocal),
        listMedications(db, p),
        listDoseHistory(db, p, { limit: 60 }),
      ]);
      return { todaySlots, tomorrowSlots, meds, history };
    },
    [today],
  );

  const askPermission = async () => {
    const result = await requestReminderPermission();
    setPermission(result);
    const { db, activeProfileId, settings } = useSession.getState();
    if (result === 'granted' && db && activeProfileId) {
      await reconcileReminders(db, activeProfileId, settings);
    }
  };

  const active = data.data?.meds.filter((m) => m.status === 'active') ?? [];
  const archived = data.data?.meds.filter((m) => m.status === 'archived') ?? [];

  return (
    <Screen>
      <Button label="Add medication" icon="plus" onPress={() => router.push('/meds/new')} />
      {remindersEnabled && permission && permission !== 'granted' && active.length ? (
        <Banner
          tone="pending"
          title="Reminders are off"
          action={
            permission === 'undetermined' ? (
              <Button label="Allow notifications" size="sm" onPress={() => void askPermission()} />
            ) : (
              <Button label="Open app settings" size="sm" variant="outline" onPress={() => void Linking.openSettings()} />
            )
          }
        >
          Doc Pawi needs notification permission to remind you of doses. You can still record doses here.
        </Banner>
      ) : null}
      <SegmentedTabs<Segment>
        options={[
          { value: 'today', label: 'Today' },
          { value: 'active', label: `Active (${active.length})` },
          { value: 'archived', label: 'Archived' },
          { value: 'history', label: 'History' },
        ]}
        value={segment}
        onChange={setSegment}
      />
      {data.error ? <ErrorState message={data.error.message} onRetry={data.refresh} /> : null}
      {data.loading && !data.data ? <LoadingState /> : null}

      {data.data && segment === 'today' ? (
        <>
          <SectionHeader title={`Today · ${formatDate(today)}`} />
          {data.data.todaySlots.length ? (
            data.data.todaySlots.map((s) => <DoseRow key={`${s.medication.id}-${s.scheduledFor}`} slot={s} />)
          ) : (
            <EmptyState icon="pill" title="No doses scheduled today" message="Add a medication with daily dose times to build your schedule." />
          )}
          <SectionHeader title="Upcoming · tomorrow" />
          {data.data.tomorrowSlots.length ? (
            data.data.tomorrowSlots.map((s) => (
              <ListItem
                key={`${s.medication.id}-${s.scheduledFor}`}
                icon="clock-outline"
                title={`${s.medication.name}${s.medication.strength ? ` ${s.medication.strength}` : ''}`}
                subtitle={`${formatTimeOfDay(s.schedule.time_of_day)}${s.schedule.dose_label ? ` · ${s.schedule.dose_label}` : ''}`}
              />
            ))
          ) : (
            <Text className="text-sm text-ink-muted">Nothing scheduled for tomorrow.</Text>
          )}
          <Text className="text-xs leading-4 text-ink-muted">
            Doc Pawi records only what you tap. A reminder notification never marks a dose as taken.
          </Text>
        </>
      ) : null}

      {data.data && segment === 'active' ? (
        active.length ? (
          active.map((m) => (
            <ListItem
              key={m.id}
              icon="pill"
              title={`${m.name}${m.strength ? ` ${m.strength}` : ''}`}
              subtitle={`${m.form ? `${MEDICATION_FORM_LABELS[m.form]} · ` : ''}${
                m.schedules.length ? m.schedules.map((s) => formatTimeOfDay(s.time_of_day)).join(', ') : 'No dose times'
              }`}
              right={m.source_type === 'demo' ? <StatusBadge label="Demo" tone="demo" /> : null}
              onPress={() => router.push({ pathname: '/meds/[id]', params: { id: m.id } })}
            />
          ))
        ) : (
          <EmptyState icon="pill" title="No active medications" actionLabel="Add medication" onAction={() => router.push('/meds/new')} />
        )
      ) : null}

      {data.data && segment === 'archived' ? (
        archived.length ? (
          archived.map((m) => (
            <ListItem
              key={m.id}
              icon="archive-outline"
              title={`${m.name}${m.strength ? ` ${m.strength}` : ''}`}
              subtitle={`Archived ${formatDate(m.archived_at?.slice(0, 10))}`}
              onPress={() => router.push({ pathname: '/meds/[id]', params: { id: m.id } })}
            />
          ))
        ) : (
          <EmptyState icon="archive-outline" title="No archived medications" message="Archived medications keep their dose history." />
        )
      ) : null}

      {data.data && segment === 'history' ? (
        data.data.history.length ? (
          <View className="gap-2">
            {data.data.history.map((h) => (
              <View key={h.id} className="flex-row items-center justify-between gap-2 rounded-2xl border border-line bg-surface p-3">
                <View className="flex-1">
                  <Text className="text-base font-semibold text-ink">{h.medication_name}</Text>
                  <Text className="text-xs text-ink-muted">
                    Scheduled {formatDate(h.scheduled_for.slice(0, 10))} {formatTimeOfDay(h.scheduled_for.slice(11))} · recorded{' '}
                    {new Date(h.event_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </Text>
                </View>
                <StatusBadge label={h.status === 'taken' ? 'Taken' : 'Skipped'} tone={h.status === 'taken' ? 'success' : 'neutral'} />
              </View>
            ))}
          </View>
        ) : (
          <EmptyState icon="history" title="No dose history yet" message="Doses you mark Taken or Skipped appear here." />
        )
      ) : null}
    </Screen>
  );
}
