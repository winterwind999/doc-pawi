import { useNetworkState } from 'expo-network';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { OnboardingStep } from '@/components/OnboardingStep';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { GOOGLE_SIGN_IN_ENABLED, signInWithGoogle } from '@/lib/auth/google';
import { findProfileBySubject, readRegistry } from '@/lib/security/profile-registry';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { useSession } from '@/stores/session-store';

export default function SignInStep() {
  const network = useNetworkState();
  const offline = network.isConnected === false || network.isInternetReachable === false;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'danger' | 'info'; text: string } | null>(null);
  const update = useOnboardingStore((s) => s.update);

  const google = async () => {
    setBusy(true);
    setMessage(null);
    const result = await signInWithGoogle();
    setBusy(false);
    if (result.status === 'cancelled') {
      setMessage({ tone: 'info', text: 'Google sign-in was cancelled. You can try again or use a local-only profile.' });
      return;
    }
    if (result.status === 'error') {
      setMessage({ tone: 'danger', text: result.message });
      return;
    }
    const existing = findProfileBySubject(await readRegistry(), 'google', result.identity.subject);
    if (existing) {
      // Never create a second vault for the same Google account; unlock the existing one instead.
      await useSession.getState().chooseProfile(existing.id);
      return;
    }
    update({
      authProvider: 'google',
      authSubject: result.identity.subject,
      email: result.identity.email,
      displayName: result.identity.name ?? result.identity.givenName ?? '',
    });
    router.push('/onboarding/pin');
  };

  const localOnly = () => {
    update({ authProvider: 'local', authSubject: null, email: null });
    router.push('/onboarding/pin');
  };

  return (
    <OnboardingStep
      step={1}
      title="Create your profile"
      description="Sign in once to set up your profile. After that, you unlock Doc Pawi with a PIN on this phone — even offline."
    >
      <Card className="gap-3">
        <Text className="text-base font-semibold text-ink">Continue with Google</Text>
        <Text className="text-sm leading-5 text-ink-muted">
          Google is used only to identify your profile (name and email). Your health data is never uploaded to
          Google or any cloud service.
        </Text>
        {!GOOGLE_SIGN_IN_ENABLED ? (
          <Banner tone="neutral">
            Google sign-in is not configured in this build (it needs the app’s OAuth client in Google Cloud). Use a
            local-only profile below.
          </Banner>
        ) : offline ? (
          <Banner tone="pending" icon="wifi-off">
            You are offline. Google sign-in needs an internet connection for this one-time step.
          </Banner>
        ) : null}
        <Button
          label="Continue with Google"
          icon="google"
          onPress={google}
          loading={busy}
          disabled={!GOOGLE_SIGN_IN_ENABLED || offline}
        />
      </Card>

      <Card className="gap-3">
        <Text className="text-base font-semibold text-ink">Use a local-only profile</Text>
        <Text className="text-sm leading-5 text-ink-muted">
          No account at all. Your profile exists only on this phone. If you forget your PIN, the data cannot be
          recovered.
        </Text>
        <Button label="Continue without an account" variant="outline" icon="cellphone-lock" onPress={localOnly} />
      </Card>

      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      <View />
    </OnboardingStep>
  );
}
