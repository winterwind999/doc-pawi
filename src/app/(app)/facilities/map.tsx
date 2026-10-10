import { useNetworkState } from 'expo-network';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable, Text, useWindowDimensions, View } from 'react-native';

import { FACILITY_MARKER_COLORS, TileMap } from '@/components/map/TileMap';
import { MapHandoffButton } from '@/components/MapHandoffButton';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SegmentedTabs } from '@/components/ui/Choice';
import { Icon } from '@/components/ui/Icon';
import { EmptyState, ErrorState, LoadingState, Screen, SectionHeader } from '@/components/ui/Layout';
import { useLiveQuery } from '@/hooks/use-live-query';
import { FACILITY_TYPES, type FacilityType } from '@/lib/db/models';
import { listAccreditedFacilities, listHmos, type AccreditedFacility } from '@/lib/db/repositories/hmos';
import { FACILITY_TYPE_LABELS } from '@/lib/labels';
import { distanceKm, formatDistance, type LatLng } from '@/lib/maps/geo';
import { getCurrentCoords, locationPermission, type LocationPermission } from '@/lib/maps/location';
import { colors } from '@/theme/colors';

type Located = AccreditedFacility & { latitude: number; longitude: number; distance: number | null };

function FacilityCard({ facility, selected, onShow }: { facility: Located; selected: boolean; onShow: () => void }) {
  return (
    <Pressable
      onPress={onShow}
      accessibilityRole="button"
      accessibilityHint="Shows this facility on the map"
      className={`gap-2 rounded-2xl border bg-surface p-3.5 active:bg-surface-muted ${selected ? 'border-primary-600' : 'border-line'}`}
    >
      <View className="flex-row items-start gap-2">
        <Icon name="map-marker" size={22} color={FACILITY_MARKER_COLORS[facility.facility_type]} />
        <View className="flex-1 gap-0.5">
          <Text className="text-base font-semibold text-ink">{facility.name}</Text>
          <Text className="text-sm text-ink-muted">
            {FACILITY_TYPE_LABELS[facility.facility_type]}
            {facility.address ? ` · ${facility.address}` : ''}
          </Text>
        </View>
        {facility.distance !== null ? (
          <Text className="text-sm font-semibold text-primary-700">{formatDistance(facility.distance)}</Text>
        ) : null}
      </View>
      <Text className="text-xs leading-4 text-ink-muted">
        {`HMO you linked: ${facility.hmos.map((h) => h.name).join(', ')}`}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        <MapHandoffButton coordinates={facility} name={facility.name} label="Directions" />
        <Button
          label="Edit"
          size="sm"
          variant="ghost"
          icon="pencil-outline"
          onPress={() => router.push({ pathname: '/facilities/edit', params: { facilityId: facility.id } })}
        />
      </View>
    </Pressable>
  );
}

/**
 * Facilities the user linked to their HMOs, nearest first, on an OpenStreetMap map. Accreditation
 * is what the user saved: HMOs publish no shared directory, so Doc Pawi never looks it up or
 * guesses it. Distances are straight-line, computed on the phone.
 */
export default function FacilityMapScreen() {
  const { hmoId } = useLocalSearchParams<{ hmoId?: string }>();
  const network = useNetworkState();
  const online = !(network.isConnected === false || network.isInternetReachable === false);
  const { height: windowHeight } = useWindowDimensions();
  const data = useLiveQuery(async (db, profileId) => {
    const [facilities, hmos] = await Promise.all([listAccreditedFacilities(db, profileId), listHmos(db, profileId)]);
    return { facilities, hmos };
  });
  const [hmoFilter, setHmoFilter] = useState<string>(hmoId ?? 'all');
  const [typeFilter, setTypeFilter] = useState<FacilityType | 'all'>('all');
  const [here, setHere] = useState<LatLng | null>(null);
  const [permission, setPermission] = useState<LocationPermission | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<LatLng | null>(null);

  const locate = async () => {
    setLocating(true);
    setLocationError(null);
    const result = await getCurrentCoords({ maxAgeMs: 5 * 60_000 });
    setLocating(false);
    if (result.ok) {
      setHere(result.coords);
      setPermission('granted');
    } else {
      setLocationError(result.message);
      if (result.reason === 'blocked') setPermission('blocked');
    }
  };

  // Use the location right away only if the user already allowed it; otherwise they choose below.
  useEffect(() => {
    void locationPermission().then((p) => {
      setPermission(p);
      if (p === 'granted') void locate();
    });
  }, []);

  if (data.error) return <ErrorState message={data.error.message} onRetry={data.refresh} />;
  if (!data.data) return <LoadingState />;

  const { facilities, hmos } = data.data;
  const types = FACILITY_TYPES.filter((t) => facilities.some((f) => f.facility_type === t));
  const visible = facilities.filter(
    (f) => (hmoFilter === 'all' || f.hmos.some((h) => h.id === hmoFilter)) && (typeFilter === 'all' || f.facility_type === typeFilter),
  );
  const located: Located[] = visible
    .flatMap((f) => (f.latitude !== null && f.longitude !== null ? [{ ...f, latitude: f.latitude, longitude: f.longitude }] : []))
    .map((f) => ({ ...f, distance: here ? distanceKm(here, f) : null }))
    .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0) || a.name.localeCompare(b.name));
  const unlocated = visible.filter((f) => f.latitude === null || f.longitude === null);
  const markers = located.map((f) => ({
    id: f.id,
    latitude: f.latitude,
    longitude: f.longitude,
    label: f.name,
    color: FACILITY_MARKER_COLORS[f.facility_type],
  }));
  const show = (f: Located) => {
    setSelectedId(f.id);
    setFocus({ latitude: f.latitude, longitude: f.longitude });
  };

  if (!facilities.length) {
    return (
      <Screen edges={['bottom']}>
        <Stack.Screen options={{ title: 'Nearby facilities' }} />
        <EmptyState
          icon="map-marker-radius-outline"
          title="No facilities linked to your HMOs"
          message="Open an HMO and add the clinics, hospitals, and laboratories it covers, with their location. They will show here, nearest first."
          actionLabel="Back to HMO"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  const locationCard = here ? (
    <View className="flex-row items-center gap-2">
      <Icon name="crosshairs-gps" size={16} color={colors.ocean600} />
      <Text className="flex-1 text-sm text-ink-muted">Nearest first, by straight-line distance from where you are.</Text>
      <Button label="Update" size="sm" variant="ghost" icon="refresh" loading={locating} onPress={() => void locate()} />
    </View>
  ) : locating ? (
    <View className="flex-row items-center gap-2" accessibilityLiveRegion="polite">
      <ActivityIndicator size="small" color={colors.primary} />
      <Text className="text-sm text-ink-muted">Finding your location…</Text>
    </View>
  ) : permission === 'blocked' ? (
    <Banner
      tone="pending"
      title="Location permission is off"
      action={<Button label="Open settings" size="sm" variant="outline" onPress={() => void Linking.openSettings()} />}
    >
      Allow location for Doc Pawi to sort facilities by distance. The map and list still work without it.
    </Banner>
  ) : (
    <Card className="gap-2">
      <Text className="text-base font-semibold text-ink">See which facility is nearest</Text>
      <Text className="text-sm leading-5 text-ink-muted">
        Doc Pawi uses your location only on this phone, to sort these facilities by distance. It is not saved or sent
        anywhere. GPS works without internet.
      </Text>
      {locationError ? <Text className="text-sm text-coral-600">{locationError}</Text> : null}
      <Button label="Use my location" icon="crosshairs-gps" onPress={() => void locate()} />
    </Card>
  );

  return (
    <Screen scroll={false} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Nearby facilities' }} />
      <View className="gap-2 px-4 pt-3">
        {hmos.length > 1 ? (
          <SegmentedTabs
            options={[{ value: 'all', label: 'All HMOs' }, ...hmos.map((h) => ({ value: h.id, label: h.provider_name }))]}
            value={hmoFilter}
            onChange={setHmoFilter}
          />
        ) : null}
        {types.length > 1 ? (
          <SegmentedTabs<FacilityType | 'all'>
            options={[{ value: 'all', label: 'All types' }, ...types.map((t) => ({ value: t, label: FACILITY_TYPE_LABELS[t] }))]}
            value={typeFilter}
            onChange={setTypeFilter}
          />
        ) : null}
        <TileMap
          markers={markers}
          user={here}
          selectedId={selectedId}
          onSelect={setSelectedId}
          focus={focus}
          online={online}
          height={Math.round(Math.min(340, Math.max(220, windowHeight * 0.34)))}
        />
      </View>
      <FlatList
        data={located}
        keyExtractor={(f) => f.id}
        contentContainerClassName="gap-3 p-4 pb-10"
        ListHeaderComponent={
          <View className="gap-3">
            {locationCard}
            <Text className="text-xs leading-4 text-ink-muted">
              These are the facilities you linked to your HMOs. Accreditation is what you saved; Doc Pawi does not
              verify it, so confirm with your HMO before a visit. Map images come from OpenStreetMap while you are
              online, which shares only the map area on screen, never your health data.
            </Text>
          </View>
        }
        renderItem={({ item }) => <FacilityCard facility={item} selected={item.id === selectedId} onShow={() => show(item)} />}
        ListEmptyComponent={
          <Text className="text-sm text-ink-muted">
            {visible.length ? 'None of these facilities has a location yet. Add one below.' : 'No facilities match this filter.'}
          </Text>
        }
        ListFooterComponent={
          unlocated.length ? (
            <View className="mt-3 gap-3">
              <SectionHeader title={`No location saved (${unlocated.length})`} />
              {unlocated.map((f) => (
                <Card key={f.id} className="gap-2">
                  <Text className="text-base font-semibold text-ink">{f.name}</Text>
                  <Text className="text-sm text-ink-muted">
                    {FACILITY_TYPE_LABELS[f.facility_type]} · HMO you linked: {f.hmos.map((h) => h.name).join(', ')}
                  </Text>
                  <Button
                    label="Add location"
                    size="sm"
                    variant="outline"
                    icon="map-marker-plus-outline"
                    onPress={() => router.push({ pathname: '/facilities/edit', params: { facilityId: f.id } })}
                  />
                </Card>
              ))}
            </View>
          ) : null
        }
      />
    </Screen>
  );
}
