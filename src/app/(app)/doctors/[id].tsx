import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Linking, Text, View } from 'react-native';

import { MapHandoffButton } from '@/components/MapHandoffButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ErrorState, KeyValueRow, ListItem, LoadingState, Screen, SectionHeader } from '@/components/ui/Layout';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useLiveQuery } from '@/hooks/use-live-query';
import { deleteDoctor, getDoctor } from '@/lib/db/repositories/doctors';
import { parseStringArray } from '@/lib/json';
import { SOURCE_LABELS } from '@/lib/labels';
import { useUnlockedSession } from '@/stores/session-store';

export default function DoctorDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db } = useUnlockedSession();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const doctor = useLiveQuery((db) => getDoctor(db, id), [id]);

  if (doctor.loading && !doctor.data) return <LoadingState />;
  if (!doctor.data) return <ErrorState message="This doctor no longer exists." />;
  const d = doctor.data;
  const phones = parseStringArray(d.phones);
  const emails = parseStringArray(d.emails);

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: 'Doctor' }} />
      <Card className="items-center gap-2">
        {d.photo_path ? <Image source={{ uri: d.photo_path }} accessibilityLabel={`Photo of ${d.name}`} className="rounded-full" style={{ width: 88, height: 88 }} /> : null}
        <Text accessibilityRole="header" className="text-center text-xl font-bold text-ink">
          {d.name}
        </Text>
        {d.specialty ? <Text className="text-base text-ink-muted">{d.specialty}</Text> : null}
        {d.source_type === 'demo' ? <StatusBadge label="Synthetic demo data" tone="demo" /> : null}
      </Card>
      <Card className="gap-1">
        {d.organization ? <KeyValueRow label="Clinic / hospital" value={d.organization} /> : null}
        {d.address ? <KeyValueRow label="Address" value={d.address} /> : null}
        <KeyValueRow label="Source" value={SOURCE_LABELS[d.source_type]} />
        {d.notes ? <Text className="pt-2 text-base text-ink">{d.notes}</Text> : null}
      </Card>
      <View className="flex-row flex-wrap gap-2">
        {phones.map((p) => (
          <Button key={p} label={`Call ${p}`} size="sm" variant="secondary" icon="phone-outline" onPress={() => void Linking.openURL(`tel:${p.replace(/[^0-9+]/g, '')}`)} />
        ))}
        {emails.map((e) => (
          <Button key={e} label={e} size="sm" variant="outline" icon="email-outline" onPress={() => void Linking.openURL(`mailto:${e}`)} />
        ))}
        {d.address ? <MapHandoffButton address={d.address} /> : null}
      </View>
      <SectionHeader title="HMOs (user-reported)" />
      {d.hmos.length ? (
        d.hmos.map((h) => (
          <ListItem key={h.id} icon="card-account-details-outline" title={h.provider_name} subtitle={h.plan_name ?? 'Accepted according to your notes — not verified'} onPress={() => router.push({ pathname: '/hmo/[id]', params: { id: h.id } })} />
        ))
      ) : (
        <Text className="text-sm text-ink-muted">No HMOs linked.</Text>
      )}
      <View className="flex-row gap-2">
        <Button label="Edit" variant="outline" icon="pencil-outline" className="flex-1" onPress={() => router.push({ pathname: '/doctors/edit/[id]', params: { id: d.id } })} />
        <Button label="Delete" variant="danger" icon="trash-can-outline" className="flex-1" onPress={() => setConfirmDelete(true)} />
      </View>
      <ConfirmDialog
        visible={confirmDelete}
        title="Delete this doctor?"
        message="The doctor is removed from this phone. Records, treatments, and medications that mention them are kept but unlinked."
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void deleteDoctor(db, d.id).then(() => router.back());
        }}
      />
    </Screen>
  );
}
