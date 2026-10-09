import { router } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { EmptyState, ErrorState, ListItem, LoadingState, Screen } from '@/components/ui/Layout';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useLiveQuery } from '@/hooks/use-live-query';
import { listDoctors } from '@/lib/db/repositories/doctors';
import { colors } from '@/theme/colors';

export default function DoctorsScreen() {
  const [search, setSearch] = useState('');
  const doctors = useLiveQuery((db, p) => listDoctors(db, p, search), [search]);
  return (
    <Screen>
      <Button label="Add doctor" icon="account-plus-outline" onPress={() => router.push('/doctors/new')} />
      <View className="min-h-[48px] flex-row items-center gap-2 rounded-xl border border-line-strong bg-surface px-3">
        <Icon name="magnify" size={20} color={colors.inkMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, specialty, or clinic"
          placeholderTextColor={colors.inkSoft}
          accessibilityLabel="Search doctors"
          className="flex-1 py-2.5 text-base text-ink"
        />
      </View>
      {doctors.error ? <ErrorState message={doctors.error.message} onRetry={doctors.refresh} /> : null}
      {doctors.loading && !doctors.data ? <LoadingState /> : null}
      {doctors.data?.length === 0 ? (
        <EmptyState
          icon="stethoscope"
          title={search ? 'No matching doctors' : 'No doctors saved'}
          message="Save your doctors’ details so they are available offline."
        />
      ) : null}
      {doctors.data?.map((d) => (
        <ListItem
          key={d.id}
          icon="doctor"
          title={d.name}
          subtitle={[d.specialty, d.organization].filter(Boolean).join(' · ') || 'No specialty recorded'}
          right={d.source_type === 'demo' ? <StatusBadge label="Demo" tone="demo" /> : null}
          onPress={() => router.push({ pathname: '/doctors/[id]', params: { id: d.id } })}
        />
      ))}
    </Screen>
  );
}
