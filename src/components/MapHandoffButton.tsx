import { useState } from 'react';
import { Linking } from 'react-native';

import type { LatLng } from '@/lib/maps/geo';

import { Button } from './ui/Button';
import { ConfirmDialog } from './ui/ConfirmDialog';

/**
 * Optional online feature: hands a saved place to the phone's maps app (for directions). Only the
 * position and name, or the address text, leave Doc Pawi — never health records — and the user
 * confirms first.
 */
export function MapHandoffButton({
  address,
  coordinates,
  name,
  label = 'Open in Maps',
}: {
  address?: string | null;
  coordinates?: LatLng | null;
  name?: string;
  label?: string;
}) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = coordinates
    ? `geo:0,0?q=${coordinates.latitude},${coordinates.longitude}(${encodeURIComponent(name ?? 'Saved place')})`
    : address
      ? `geo:0,0?q=${encodeURIComponent(address)}`
      : null;
  if (!url) return null;
  const shared = coordinates ? `the map position${name ? ` of “${name}”` : ''}` : `this address: “${address}”`;
  return (
    <>
      <Button label={error ?? label} size="sm" variant="outline" icon="map-marker-outline" onPress={() => setConfirm(true)} />
      <ConfirmDialog
        visible={confirm}
        title="Open in your maps app?"
        message={`Only ${shared} will be shared with your maps app. Maps usually need an internet connection. No health information is shared.`}
        confirmLabel="Open maps"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          Linking.openURL(url).catch(() => setError('No maps app available'));
        }}
      />
    </>
  );
}
