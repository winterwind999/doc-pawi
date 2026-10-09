import { useState } from 'react';
import { Linking } from 'react-native';

import { Button } from './ui/Button';
import { ConfirmDialog } from './ui/ConfirmDialog';

/**
 * Optional online feature: hands a saved address to the phone's maps app. Only the address text
 * leaves Doc Pawi — never health records — and the user confirms first.
 */
export function MapHandoffButton({ address, label = 'Open in Maps' }: { address: string; label?: string }) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button label={error ?? label} size="sm" variant="outline" icon="map-marker-outline" onPress={() => setConfirm(true)} />
      <ConfirmDialog
        visible={confirm}
        title="Open this address in your maps app?"
        message={`Only this address will be shared with your maps app: “${address}”. Maps usually need an internet connection. No health information is shared.`}
        confirmLabel="Open maps"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          Linking.openURL(`geo:0,0?q=${encodeURIComponent(address)}`).catch(() => setError('No maps app available'));
        }}
      />
    </>
  );
}
