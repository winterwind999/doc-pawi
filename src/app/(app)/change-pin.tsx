import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Screen } from '@/components/ui/Layout';
import { PinDots, PinPad } from '@/components/ui/PinPad';
import { formatDuration } from '@/lib/security/throttle';
import { checkPin, createPinRecord, PIN_LENGTH, savePinRecord } from '@/lib/security/pin';
import { useUnlockedSession } from '@/stores/session-store';

type Stage = 'current' | 'new' | 'confirm';

export default function ChangePinScreen() {
  const { profileId } = useUnlockedSession();
  const [stage, setStage] = useState<Stage>('current');
  const [pin, setPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const complete = async (value: string) => {
    setBusy(true);
    setPin('');
    try {
      if (stage === 'current') {
        const result = await checkPin(profileId, value);
        if (result.ok) {
          setStage('new');
          setError(null);
        } else if (result.reason === 'locked_out') {
          setError(`Too many incorrect attempts. Try again in ${formatDuration(result.retryInMs)}.`);
        } else {
          setError('That is not your current PIN.');
        }
      } else if (stage === 'new') {
        setNewPin(value);
        setStage('confirm');
        setError(null);
      } else if (value !== newPin) {
        setError('The new PINs did not match. Enter the new PIN again.');
        setStage('new');
      } else {
        await savePinRecord(profileId, await createPinRecord(value));
        router.back();
      }
    } finally {
      setBusy(false);
    }
  };

  const title = stage === 'current' ? 'Enter your current PIN' : stage === 'new' ? 'Choose a new 4-digit PIN' : 'Confirm the new PIN';
  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: 'Change PIN' }} />
      <View className="items-center gap-5 py-6">
        <Text accessibilityRole="header" className="text-xl font-bold text-ink">
          {title}
        </Text>
        <PinDots length={PIN_LENGTH} filled={pin.length} error={!!error} />
        {error ? <Banner tone="danger">{error}</Banner> : null}
        <PinPad
          disabled={busy}
          onBackspace={() => setPin((p) => p.slice(0, -1))}
          onDigit={(d) => {
            if (pin.length >= PIN_LENGTH) return;
            const next = pin + d;
            setPin(next);
            if (next.length === PIN_LENGTH) void complete(next);
          }}
        />
        <Text className="px-6 text-center text-xs leading-4 text-ink-muted">
          Changing the PIN does not re-encrypt your data; the database key stays protected by the Android Keystore.
        </Text>
      </View>
    </Screen>
  );
}
