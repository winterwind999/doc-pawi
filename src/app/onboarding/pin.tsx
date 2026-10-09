import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { OnboardingStep } from '@/components/OnboardingStep';
import { Banner } from '@/components/ui/Banner';
import { PinDots, PinPad } from '@/components/ui/PinPad';
import { createPinRecord, PIN_LENGTH } from '@/lib/security/pin';
import { useOnboardingStore } from '@/stores/onboarding-store';

const WEAK = new Set(['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321', '1212']);

export default function PinStep() {
  const update = useOnboardingStore((s) => s.update);
  const [first, setFirst] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onDigit = async (digit: string) => {
    if (busy || pin.length >= PIN_LENGTH) return;
    const next = pin + digit;
    setPin(next);
    setError(null);
    if (next.length < PIN_LENGTH) return;
    if (!first) {
      if (WEAK.has(next)) {
        setError('That PIN is too easy to guess. Choose a less obvious combination.');
        setPin('');
        return;
      }
      setFirst(next);
      setPin('');
      return;
    }
    if (next !== first) {
      setError('The PINs did not match. Start again.');
      setFirst(null);
      setPin('');
      return;
    }
    setBusy(true);
    try {
      update({ pinRecord: await createPinRecord(next) });
      router.push('/onboarding/about-you');
    } catch (e) {
      setError((e as Error).message);
      setFirst(null);
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <OnboardingStep
      step={1}
      title={first ? 'Confirm your PIN' : 'Create a 4-digit PIN'}
      description="Doc Pawi has no accounts: your profile exists only on this phone and works offline. You will use this PIN to unlock it. If you forget the PIN, the data cannot be recovered. After 5 wrong attempts, unlocking is paused for an increasing time."
    >
      <View className="items-center gap-6 py-4">
        <PinDots length={PIN_LENGTH} filled={pin.length} error={!!error} />
        {error ? <Banner tone="danger">{error}</Banner> : null}
        <PinPad onDigit={(d) => void onDigit(d)} onBackspace={() => setPin((p) => p.slice(0, -1))} disabled={busy} />
        <Text className="px-4 text-center text-xs leading-4 text-ink-muted">
          The PIN is an access lock. Your data is encrypted with a separate random 256-bit key protected by the
          Android Keystore.
        </Text>
      </View>
    </OnboardingStep>
  );
}
