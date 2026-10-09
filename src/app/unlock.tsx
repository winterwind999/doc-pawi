import * as LocalAuthentication from 'expo-local-authentication';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner } from '@/components/ui/Banner';
import { Mascot } from '@/components/ui/Layout';
import { PinDots, PinPad } from '@/components/ui/PinPad';
import { PIN_LENGTH, readThrottle } from '@/lib/security/pin';
import { attemptsBeforeLockout, formatDuration, remainingLockMs } from '@/lib/security/throttle';
import { useSession } from '@/stores/session-store';
import { colors } from '@/theme/colors';

export default function UnlockScreen() {
  const profileId = useSession((s) => s.activeProfileId);
  const profile = useSession((s) => s.profiles.find((p) => p.id === s.activeProfileId));
  const biometricEnabled = useSession((s) => s.biometricEnabled);
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState<{ tone: 'danger' | 'pending' | 'info'; text: string } | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);

  useEffect(() => {
    if (!profileId) return;
    void readThrottle(profileId).then((t) => setLockedUntil(t.lockedUntil));
    void (async () => {
      const ok = (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
      setBioAvailable(ok);
    })();
  }, [profileId]);

  useEffect(() => {
    if (!lockedUntil || lockedUntil <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [lockedUntil]);

  const waitMs = lockedUntil ? Math.max(0, lockedUntil - now) : 0;
  const lockedOut = waitMs > 0;

  const submit = async (value: string) => {
    setBusy(true);
    const result = await useSession.getState().unlockWithPin(value);
    setBusy(false);
    setPin('');
    if (result.ok) return;
    if (result.reason === 'locked_out') {
      setLockedUntil(Date.now() + result.retryInMs);
      setNow(Date.now());
      setMessage({ tone: 'pending', text: `Too many incorrect attempts. Try again in ${formatDuration(result.retryInMs)}.` });
    } else if (result.reason === 'wrong_pin') {
      const left = attemptsBeforeLockout(result.state);
      setMessage({
        tone: 'danger',
        text: left > 0 ? `Incorrect PIN. ${left} attempt${left === 1 ? '' : 's'} left before a pause.` : 'Incorrect PIN.',
      });
      if (result.state.lockedUntil) setLockedUntil(result.state.lockedUntil);
    } else if (result.reason === 'open_failed') {
      setMessage({ tone: 'danger', text: result.message });
    } else {
      setMessage({ tone: 'danger', text: 'This profile has no PIN set. It may be damaged.' });
    }
  };

  const onDigit = (digit: string) => {
    if (busy || lockedOut || pin.length >= PIN_LENGTH) return;
    const next = pin + digit;
    setPin(next);
    setMessage(null);
    if (next.length === PIN_LENGTH) void submit(next);
  };

  const biometric = async () => {
    setBusy(true);
    const result = await useSession.getState().unlockWithBiometrics();
    setBusy(false);
    if (!result.ok && result.message) setMessage({ tone: 'danger', text: result.message });
  };

  return (
    <SafeAreaView className="flex-1 bg-surface-muted">
      <ScrollView contentContainerClassName="flex-grow items-center justify-center gap-5 p-6">
        <Mascot size={110} />
        <View className="items-center gap-1">
          <Text accessibilityRole="header" className="text-2xl font-bold text-ink">
            Welcome back{profile ? `, ${profile.displayName.split(' ')[0]}` : ''}
          </Text>
          <Text className="text-center text-base text-ink-muted">Enter your PIN to unlock your health vault.</Text>
        </View>
        <PinDots length={PIN_LENGTH} filled={pin.length} error={message?.tone === 'danger'} />
        {busy ? <ActivityIndicator color={colors.primary} /> : null}
        {lockedOut ? (
          <Banner tone="pending" icon="timer-sand">
            {`Unlocking is paused for ${formatDuration(remainingLockMs({ failures: 0, lockedUntil }, now))} after repeated incorrect PINs.`}
          </Banner>
        ) : message ? (
          <Banner tone={message.tone}>{message.text}</Banner>
        ) : null}
        <PinPad
          onDigit={onDigit}
          onBackspace={() => setPin((p) => p.slice(0, -1))}
          disabled={busy || lockedOut}
          extraKey={
            biometricEnabled && bioAvailable
              ? { icon: 'fingerprint', label: 'Unlock with biometrics', onPress: () => void biometric() }
              : null
          }
        />
        <Pressable
          onPress={() => useSession.getState().showWelcome()}
          accessibilityRole="button"
          accessibilityLabel="Use a different profile"
          className="min-h-[44px] justify-center px-3"
        >
          <Text className="text-sm font-semibold text-primary-700">Not you? Switch profile</Text>
        </Pressable>
        <Text className="text-center text-xs leading-4 text-ink-muted">
          Forgot your PIN? For your privacy, Doc Pawi cannot recover it or bypass it. The only way to start over is
          Android Settings → Apps → Doc Pawi → Clear storage, which erases every profile on this phone.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
