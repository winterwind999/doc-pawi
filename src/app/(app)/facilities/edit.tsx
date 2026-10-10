import { useNetworkState } from 'expo-network';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { FACILITY_MARKER_COLORS, TileMap } from '@/components/map/TileMap';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ChoiceChips } from '@/components/ui/Choice';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Screen, SectionHeader } from '@/components/ui/Layout';
import { TextField } from '@/components/ui/TextField';
import { FACILITY_TYPES, type FacilityType } from '@/lib/db/models';
import { createFacility, getFacility, updateFacility } from '@/lib/db/repositories/hmos';
import { FACILITY_TYPE_LABELS } from '@/lib/labels';
import { formatCoordinates, parseCoordinates, type LatLng } from '@/lib/maps/geo';
import { geocodeAddress, getCurrentCoords } from '@/lib/maps/location';
import { facilityInputSchema, fieldErrors } from '@/lib/validation/schemas';
import { useUnlockedSession } from '@/stores/session-store';

export default function FacilityEditScreen() {
  const { hmoId, facilityId } = useLocalSearchParams<{ hmoId?: string; facilityId?: string }>();
  const { db, profileId } = useUnlockedSession();
  const network = useNetworkState();
  const online = !(network.isConnected === false || network.isInternetReachable === false);
  const [name, setName] = useState('');
  const [type, setType] = useState<FacilityType | null>('clinic');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [coords, setCoords] = useState<LatLng | null>(null);
  const [coordsText, setCoordsText] = useState('');
  const [focus, setFocus] = useState<(LatLng & { zoom?: number }) | null>(null);
  const [locating, setLocating] = useState<'gps' | 'address' | null>(null);
  const [locationNote, setLocationNote] = useState<{ text: string; error: boolean } | null>(null);
  const [confirmLookup, setConfirmLookup] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!facilityId) return;
    void getFacility(db, facilityId).then((f) => {
      if (!f) return;
      setName(f.name);
      setType(f.facility_type);
      setAddress(f.address ?? '');
      setPhone(f.phone ?? '');
      setNotes(f.notes ?? '');
      if (f.latitude !== null && f.longitude !== null) {
        const point = { latitude: f.latitude, longitude: f.longitude };
        setCoords(point);
        setCoordsText(formatCoordinates(point));
      }
    });
  }, [db, facilityId]);

  const place = (point: LatLng | null, note: string | null, recenter = true) => {
    setCoords(point);
    setCoordsText(point ? formatCoordinates(point) : '');
    setErrors(({ latitude: _dropped, ...rest }) => rest);
    setLocationNote(note ? { text: note, error: false } : null);
    if (point && recenter) setFocus(point);
  };

  const placeAtCurrentLocation = async () => {
    setLocating('gps');
    const result = await getCurrentCoords({ precise: true });
    setLocating(null);
    if (!result.ok) {
      setLocationNote({ text: result.message, error: true });
      return;
    }
    const accuracy = result.accuracyMeters ? ` (accurate to about ${Math.round(result.accuracyMeters)} m)` : '';
    place(result.coords, `Set from where you are now${accuracy}. Use this when you are at the facility.`);
  };

  const lookUpAddress = async () => {
    setLocating('address');
    try {
      const found = await geocodeAddress(address.trim());
      if (found) place(found, 'Found from the address. Check the pin and tap the map to move it if needed.');
      else setLocationNote({ text: 'No place was found for this address. Add the barangay or city, or use another option.', error: true });
    } catch (e) {
      setLocationNote({ text: `Could not look up the address: ${(e as Error).message}`, error: true });
    } finally {
      setLocating(null);
    }
  };

  /** Reads the coordinates field; returns false when it holds something that is not a position. */
  const readCoordsText = () => {
    if (!coordsText.trim()) {
      if (coords) place(null, null);
      return true;
    }
    const parsed = parseCoordinates(coordsText);
    if (!parsed) {
      setErrors((e) => ({ ...e, latitude: 'Enter latitude, then longitude, e.g. 14.5995, 120.9842' }));
      return false;
    }
    if (!coords || parsed.latitude !== coords.latitude || parsed.longitude !== coords.longitude) {
      place(parsed, 'Set from the coordinates you entered.');
    }
    return true;
  };

  const save = async () => {
    if (!readCoordsText()) return;
    const point = coordsText.trim() ? parseCoordinates(coordsText) : null;
    const parsed = facilityInputSchema.safeParse({
      name,
      facility_type: type,
      address,
      phone,
      notes,
      latitude: point?.latitude ?? null,
      longitude: point?.longitude ?? null,
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setSaving(true);
    try {
      if (facilityId) await updateFacility(db, facilityId, parsed.data);
      else await createFacility(db, { profileId, input: parsed.data, sourceType: 'manual', linkHmoId: hmoId ?? null });
      router.back();
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen edges={['bottom']} footer={<Button label="Save facility" icon="content-save-outline" loading={saving} onPress={() => void save()} />}>
      <Stack.Screen options={{ title: facilityId ? 'Edit facility' : 'Add facility' }} />
      <TextField label="Facility name" value={name} onChangeText={setName} required error={errors.name} />
      <ChoiceChips label="Type" options={FACILITY_TYPES.map((v) => ({ value: v, label: FACILITY_TYPE_LABELS[v] }))} value={type} onChange={setType} error={errors.facility_type} />
      <TextField label="Address" value={address} onChangeText={setAddress} multiline error={errors.address} />
      <TextField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" error={errors.phone} />
      <TextField label="Notes" value={notes} onChangeText={setNotes} multiline error={errors.notes} hint="e.g. what your HMO said is covered here (user-reported)." />

      <SectionHeader title="Location on the map" />
      <Text className="text-sm leading-5 text-ink-muted">
        Optional. With a location, this facility appears on the Nearby facilities map, sorted by distance. It is saved
        only on this phone.
      </Text>
      <View className="flex-row flex-wrap gap-2">
        <Button
          label="Use my current location"
          size="sm"
          variant="secondary"
          icon="crosshairs-gps"
          loading={locating === 'gps'}
          disabled={!!locating}
          onPress={() => void placeAtCurrentLocation()}
        />
        <Button
          label="Find from address"
          size="sm"
          variant="outline"
          icon="map-search-outline"
          loading={locating === 'address'}
          disabled={!!locating || !address.trim() || !online}
          onPress={() => setConfirmLookup(true)}
        />
        {coords ? <Button label="Clear" size="sm" variant="ghost" icon="close" onPress={() => place(null, null)} /> : null}
      </View>
      {!online && address.trim() ? (
        <Text className="text-xs leading-4 text-ink-muted">Finding an address needs internet. The other options work offline.</Text>
      ) : null}
      <TextField
        label="Coordinates (latitude, longitude)"
        value={coordsText}
        onChangeText={(t) => {
          setCoordsText(t);
          setErrors(({ latitude: _dropped, ...rest }) => rest);
        }}
        onBlur={() => void readCoordsText()}
        keyboardType="numbers-and-punctuation"
        autoCapitalize="none"
        autoCorrect={false}
        error={errors.latitude ?? errors.longitude}
        hint="Paste from a maps app, e.g. 14.5995, 120.9842"
      />
      {locationNote ? (
        <Text className={`text-sm leading-5 ${locationNote.error ? 'text-coral-600' : 'text-ink-muted'}`}>{locationNote.text}</Text>
      ) : null}
      <TileMap
        markers={coords ? [{ id: 'facility', ...coords, label: name.trim() || 'This facility', color: FACILITY_MARKER_COLORS[type ?? 'other'] }] : []}
        interactive={false}
        onPressMap={(point, zoom) => {
          // Each tap zooms in around the tapped spot until street level, so the preview can be
          // "walked" to the right place without dragging (it sits inside a scrolling form).
          place(point, zoom < 15 ? 'Pin placed. Tap again to zoom in and place it more exactly.' : 'Moved the pin to where you tapped.', false);
          setFocus({ ...point, zoom: zoom < 15 ? Math.min(16, zoom + 3) : zoom });
        }}
        focus={focus}
        online={online}
        height={220}
      />
      <Text className="text-xs leading-4 text-ink-muted">
        Tap the map to place or move the pin; each tap zooms in until street level, and + and − zoom too. Map images
        come from OpenStreetMap while you are online.
      </Text>
      {failure ? <Banner tone="danger">{failure}</Banner> : null}

      <ConfirmDialog
        visible={confirmLookup}
        title="Look up this address online?"
        message={`Your phone’s location service (Google on most Android phones) receives the address text “${address.trim()}” to find it on the map. No health information is sent.`}
        confirmLabel="Look up"
        onCancel={() => setConfirmLookup(false)}
        onConfirm={() => {
          setConfirmLookup(false);
          void lookUpAddress();
        }}
      />
    </Screen>
  );
}
