import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatDate } from '@/lib/dates';
import type { TreatmentWithEvents } from '@/lib/db/repositories/treatments';
import { EVENT_STATUS_LABELS, EVENT_STATUS_TONE, TREATMENT_KIND_LABELS, TREATMENT_STATUS_LABELS, TREATMENT_STATUS_TONE } from '@/lib/labels';

/** Treatment or vaccine series with a compact event timeline. */
export function TreatmentCard({ treatment, onPress }: { treatment: TreatmentWithEvents; onPress?: () => void }) {
  const t = treatment;
  return (
    <Card
      className="gap-3"
      onPress={onPress ?? (() => router.push({ pathname: '/treatments/[id]', params: { id: t.id } }))}
      accessibilityLabel={`${t.title}, ${TREATMENT_STATUS_LABELS[t.status]}, ${t.events.length} events`}
    >
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1 gap-0.5">
          <Text className="text-base font-semibold text-ink">{t.title}</Text>
          <Text className="text-sm text-ink-muted">
            {TREATMENT_KIND_LABELS[t.kind]}
            {t.start_date ? ` · since ${formatDate(t.start_date)}` : ''}
            {t.source_type === 'demo' ? ' · Demo data' : ''}
          </Text>
        </View>
        <StatusBadge label={TREATMENT_STATUS_LABELS[t.status]} tone={TREATMENT_STATUS_TONE[t.status]} />
      </View>
      {t.events.length ? (
        <View className="gap-2 border-l-2 border-line-strong pl-3">
          {t.events.map((e) => (
            <View key={e.id} className="flex-row items-center justify-between gap-2">
              <View className="flex-1">
                <Text className="text-sm font-semibold text-ink">{e.title}</Text>
                <Text className="text-xs text-ink-muted">
                  {e.status === 'completed'
                    ? formatDate(e.completed_date, 'Completed (date not recorded)')
                    : formatDate(e.scheduled_date, 'No date')}
                </Text>
              </View>
              <StatusBadge label={EVENT_STATUS_LABELS[e.status]} tone={EVENT_STATUS_TONE[e.status]} />
            </View>
          ))}
        </View>
      ) : (
        <Text className="text-sm text-ink-muted">No doses, sessions, or visits recorded yet.</Text>
      )}
    </Card>
  );
}
