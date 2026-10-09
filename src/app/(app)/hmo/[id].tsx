import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Text, View } from 'react-native';

import { MapHandoffButton } from '@/components/MapHandoffButton';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ErrorState, KeyValueRow, ListItem, LoadingState, Screen, SectionHeader } from '@/components/ui/Layout';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useLiveQuery } from '@/hooks/use-live-query';
import { formatDate, todayLocal } from '@/lib/dates';
import { deleteHmo, getHmo, unlinkFacility } from '@/lib/db/repositories/hmos';
import { FACILITY_TYPE_LABELS, SOURCE_LABELS } from '@/lib/labels';
import { useUnlockedSession } from '@/stores/session-store';

export default function HmoDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db } = useUnlockedSession();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const hmo = useLiveQuery((db) => getHmo(db, id), [id]);

  if (hmo.loading && !hmo.data) return <LoadingState />;
  if (!hmo.data) return <ErrorState message="This HMO no longer exists." />;
  const h = hmo.data;
  const expired = h.valid_until ? h.valid_until < todayLocal() : false;

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: 'HMO' }} />
      <Card className="gap-2">
        <Text accessibilityRole="header" className="text-xl font-bold text-ink">
          {h.provider_name}
        </Text>
        {h.source_type === 'demo' ? <StatusBadge label="Synthetic demo data" tone="demo" /> : null}
        <View>
          {h.plan_name ? <KeyValueRow label="Plan" value={h.plan_name} /> : null}
          {h.member_id ? <KeyValueRow label="Member ID" value={h.member_id} emphasize /> : null}
          {h.valid_until ? <KeyValueRow label="Valid until" value={formatDate(h.valid_until)} /> : null}
          {h.hotline ? <KeyValueRow label="Hotline" value={h.hotline} /> : null}
          <KeyValueRow label="Source" value={SOURCE_LABELS[h.source_type]} />
        </View>
        {expired ? <Banner tone="pending">The validity date you saved has passed. Check with your HMO.</Banner> : null}
        {h.hotline ? <Button label={`Call ${h.hotline}`} size="sm" variant="secondary" icon="phone-outline" onPress={() => void Linking.openURL(`tel:${h.hotline!.replace(/[^0-9+]/g, '')}`)} /> : null}
      </Card>
      {h.coverage_notes ? (
        <Card className="gap-1">
          <Text className="text-sm font-semibold text-ink-muted">Coverage notes (as you entered them)</Text>
          <Text selectable className="text-base leading-6 text-ink">
            {h.coverage_notes}
          </Text>
        </Card>
      ) : null}

      <SectionHeader title="Saved facilities" actionLabel="Add facility" onAction={() => router.push({ pathname: '/facilities/edit', params: { hmoId: h.id } })} />
      <Text className="text-xs leading-4 text-ink-muted">User-reported. Doc Pawi does not verify accreditation; confirm with your HMO before a visit.</Text>
      {h.facilities.length ? (
        h.facilities.map((f) => (
          <Card key={f.id} className="gap-2">
            <Text className="text-base font-semibold text-ink">{f.name}</Text>
            <Text className="text-sm text-ink-muted">
              {FACILITY_TYPE_LABELS[f.facility_type]}
              {f.address ? ` · ${f.address}` : ''}
              {f.phone ? ` · ${f.phone}` : ''}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {f.address ? <MapHandoffButton address={f.address} /> : null}
              <Button label="Edit" size="sm" variant="ghost" icon="pencil-outline" onPress={() => router.push({ pathname: '/facilities/edit', params: { hmoId: h.id, facilityId: f.id } })} />
              <Button label="Unlink" size="sm" variant="ghost" icon="link-variant-off" onPress={() => void unlinkFacility(db, h.id, f.id)} />
            </View>
          </Card>
        ))
      ) : (
        <Text className="text-sm text-ink-muted">No facilities saved for this HMO.</Text>
      )}

      <SectionHeader title="Doctors you linked" />
      {h.doctors.length ? (
        h.doctors.map((d) => (
          <ListItem key={d.id} icon="doctor" title={d.name} subtitle={d.specialty ?? undefined} onPress={() => router.push({ pathname: '/doctors/[id]', params: { id: d.id } })} />
        ))
      ) : (
        <Text className="text-sm text-ink-muted">Link doctors from their profile in the Doctors tab.</Text>
      )}

      <Banner tone="neutral" icon="wifi-off">
        Finding new accredited facilities online is not available in this version; all information here works offline.
      </Banner>

      <View className="flex-row gap-2">
        <Button label="Edit" variant="outline" icon="pencil-outline" className="flex-1" onPress={() => router.push({ pathname: '/hmo/edit/[id]', params: { id: h.id } })} />
        <Button label="Delete" variant="danger" icon="trash-can-outline" className="flex-1" onPress={() => setConfirmDelete(true)} />
      </View>
      <ConfirmDialog
        visible={confirmDelete}
        title="Delete this HMO?"
        message="The HMO and its links to facilities and doctors are deleted. The facilities and doctors themselves are kept."
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void deleteHmo(db, h.id).then(() => router.back());
        }}
      />
    </Screen>
  );
}
