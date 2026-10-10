import { router } from 'expo-router';
import { Text } from 'react-native';

import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, ListItem, LoadingState, Screen } from '@/components/ui/Layout';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useLiveQuery } from '@/hooks/use-live-query';
import { formatDate } from '@/lib/dates';
import { listHmos } from '@/lib/db/repositories/hmos';

export default function HmoScreen() {
  const hmos = useLiveQuery((db, p) => listHmos(db, p));
  return (
    <Screen>
      <Button label="Add HMO / insurance" icon="plus" onPress={() => router.push('/hmo/new')} />
      {hmos.data?.length ? (
        <Button
          label="Nearby accredited facilities"
          icon="map-marker-radius-outline"
          variant="secondary"
          onPress={() => router.push('/facilities/map')}
        />
      ) : null}
      <Text className="text-xs leading-4 text-ink-muted">
        Saved HMO details and facilities are available offline. Coverage and accreditation shown here are what you
        entered — Doc Pawi does not verify them.
      </Text>
      {hmos.error ? <ErrorState message={hmos.error.message} onRetry={hmos.refresh} /> : null}
      {hmos.loading && !hmos.data ? <LoadingState /> : null}
      {hmos.data?.length === 0 ? (
        <EmptyState icon="card-account-details-outline" title="No HMO saved" message="Save your HMO card details, coverage notes, and the clinics or hospitals you use." />
      ) : null}
      {hmos.data?.map((h) => (
        <ListItem
          key={h.id}
          icon="card-account-details-outline"
          title={h.provider_name}
          subtitle={`${h.plan_name ?? 'Plan not recorded'}${h.valid_until ? ` · valid until ${formatDate(h.valid_until)}` : ''} · ${h.facility_count} facilit${h.facility_count === 1 ? 'y' : 'ies'}`}
          right={h.source_type === 'demo' ? <StatusBadge label="Demo" tone="demo" /> : null}
          onPress={() => router.push({ pathname: '/hmo/[id]', params: { id: h.id } })}
        />
      ))}
    </Screen>
  );
}
