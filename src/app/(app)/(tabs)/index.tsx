import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { DoseRow } from '@/components/meds/DoseRow';
import { ModelStatusCard } from '@/components/ModelStatusCard';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, ListItem, LoadingState, Mascot, Screen, SectionHeader } from '@/components/ui/Layout';
import { useLiveQuery } from '@/hooks/use-live-query';
import { addDays, formatDate, formatLongDate, greetingFor, localTimeOfDay, relativeDay, todayLocal } from '@/lib/dates';
import { getDoseSlotsForDate } from '@/lib/db/repositories/medications';
import { getActivitySummary } from '@/lib/db/repositories/stats';
import { listOverdueEvents, listTreatmentsWithEvents, listUpcomingEvents } from '@/lib/db/repositories/treatments';
import { buildHomeMessage } from '@/lib/home-message';
import { TREATMENT_KIND_LABELS } from '@/lib/labels';
import { useSession } from '@/stores/session-store';

export default function HomeScreen() {
  const profile = useSession((s) => s.profile);
  const now = new Date();
  const today = todayLocal(now);

  const home = useLiveQuery(
    async (db, profileId) => {
      const nowLocal = `${today}T${localTimeOfDay(new Date())}`;
      const [slots, upcoming, overdue, ongoing, summary] = await Promise.all([
        getDoseSlotsForDate(db, profileId, today, nowLocal),
        listUpcomingEvents(db, profileId, today, 5),
        listOverdueEvents(db, profileId, today),
        listTreatmentsWithEvents(db, profileId, { statuses: ['ongoing'] }),
        getActivitySummary(db, profileId, `${addDays(today, -6)}T00:00`),
      ]);
      return { slots, upcoming, overdue, ongoing, summary };
    },
    [today],
  );

  const firstName = profile?.display_name.split(' ')[0] ?? '';
  const data = home.data;

  return (
    <Screen>
      <View className="flex-row items-center gap-3 rounded-3xl bg-primary-50 p-4">
        <Mascot size={84} />
        <View className="flex-1 gap-1">
          <Text className="text-xs font-semibold uppercase tracking-wide text-primary-700">{formatLongDate(now)}</Text>
          <Text accessibilityRole="header" className="text-xl font-bold text-ink">
            {greetingFor(now)}, {firstName}!
          </Text>
          <Text className="text-sm leading-5 text-ink" accessibilityLiveRegion="polite">
            {data
              ? buildHomeMessage({ slots: data.slots, upcoming: data.upcoming, overdue: data.overdue, summary: data.summary, today })
              : 'Loading your day…'}
          </Text>
        </View>
      </View>

      {home.error ? <ErrorState message={home.error.message} onRetry={home.refresh} /> : null}
      {home.loading && !data ? <LoadingState /> : null}

      {data ? (
        <>
          {data.summary.demoRows > 0 ? (
            <Banner tone="demo" title="Synthetic demo data is loaded">
              Records marked “Demo” are fictional evaluation data. Remove them in Settings.
            </Banner>
          ) : null}

          <View className="flex-row gap-2">
            <Button label="Ask Doc Pawi" icon="chat-plus-outline" className="flex-1" onPress={() => router.push('/chats')} />
            <Button
              label="Import document"
              icon="file-upload-outline"
              variant="secondary"
              className="flex-1"
              onPress={() => router.push('/documents/import')}
            />
          </View>

          <ModelStatusCard compact />

          <SectionHeader title="Today’s medications" actionLabel="All meds" onAction={() => router.push('/meds')} />
          {data.slots.length ? (
            data.slots.map((slot) => <DoseRow key={`${slot.medication.id}-${slot.scheduledFor}`} slot={slot} />)
          ) : (
            <EmptyState icon="pill" title="No doses scheduled today" message="Add a medication with dose times to see reminders here." />
          )}

          <SectionHeader title="Ongoing treatments" actionLabel="Records" onAction={() => router.push('/records')} />
          {data.ongoing.length ? (
            data.ongoing.map((t) => {
              const next = t.events.find((e) => e.status === 'scheduled' && e.scheduled_date && e.scheduled_date >= today);
              const done = t.events.filter((e) => e.status === 'completed').length;
              return (
                <ListItem
                  key={t.id}
                  icon={t.kind === 'vaccination' ? 'needle' : 'heart-pulse'}
                  title={t.title}
                  subtitle={`${TREATMENT_KIND_LABELS[t.kind]} · ${done} completed${
                    next ? ` · next ${formatDate(next.scheduled_date)}` : ''
                  }`}
                  onPress={() => router.push({ pathname: '/treatments/[id]', params: { id: t.id } })}
                />
              );
            })
          ) : (
            <EmptyState icon="heart-pulse" title="No ongoing treatments" message="Treatment courses and vaccine series you record appear here." />
          )}

          <SectionHeader title="Upcoming events" />
          {data.overdue.length ? (
            <Banner tone="pending" title="Needs an update">
              {`${data.overdue.length} scheduled event${data.overdue.length === 1 ? ' has' : 's have'} passed without being marked completed.`}
            </Banner>
          ) : null}
          {data.upcoming.length ? (
            data.upcoming.map((e) => (
              <ListItem
                key={e.id}
                icon="calendar-clock"
                title={e.title}
                subtitle={`${formatDate(e.scheduled_date)} (${relativeDay(e.scheduled_date!, today)}) · ${e.treatment_title}`}
                onPress={() => router.push({ pathname: '/treatments/[id]', params: { id: e.treatment_id } })}
              />
            ))
          ) : (
            <EmptyState icon="calendar-blank-outline" title="Nothing scheduled" message="Scheduled doses, sessions, and visits will appear here." />
          )}

          <SectionHeader title="Activity" />
          <View className="flex-row flex-wrap gap-2">
            {[
              { label: 'Records', value: data.summary.records },
              { label: 'Documents', value: data.summary.documents },
              { label: 'Chats', value: data.summary.conversations },
              { label: 'Doses taken (7 days)', value: data.summary.dosesTakenLast7Days },
              { label: 'Doses skipped (7 days)', value: data.summary.dosesSkippedLast7Days },
              { label: 'Active meds', value: data.summary.activeMedications },
            ].map((s) => (
              <View
                key={s.label}
                accessible
                accessibilityLabel={`${s.label}: ${s.value}`}
                className="min-w-[30%] flex-1 gap-0.5 rounded-2xl border border-line bg-surface p-3"
              >
                <Text className="text-2xl font-bold text-ink">{s.value}</Text>
                <Text className="text-xs text-ink-muted">{s.label}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}
