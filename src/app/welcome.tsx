import { router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ListItem, Mascot } from '@/components/ui/Layout';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { useSession } from '@/stores/session-store';

export default function WelcomeScreen() {
  const profiles = useSession((s) => s.profiles);
  const bootError = useSession((s) => s.bootError);

  const startOnboarding = () => {
    useOnboardingStore.getState().reset();
    router.push('/onboarding/pin');
  };

  return (
    <SafeAreaView className="flex-1 bg-primary-50">
      <ScrollView contentContainerClassName="flex-grow justify-between gap-6 p-6">
        <View className="items-center gap-4 pt-6">
          <Mascot size={180} />
          <Text accessibilityRole="header" className="text-center text-3xl font-bold text-ink">
            Doc Pawi
          </Text>
          {/* self-stretch: inside items-center, Android measured this semibold line slightly too narrow and
              clipped "Assistant" (seen on a Honor phone); the full width leaves room for it. */}
          <Text className="self-stretch text-center text-base font-semibold text-primary-700">AI Medical Assistant</Text>
          <Text className="text-center text-base leading-6 text-ink-muted">
            Your private health companion. Records, documents, and the AI assistant stay on this phone — and keep
            working without internet.
          </Text>
        </View>

        <View className="gap-3">
          {bootError ? <Banner tone="danger">{bootError}</Banner> : null}
          {profiles.length ? (
            <View className="gap-2">
              <Text className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Profiles on this phone</Text>
              {profiles.map((p) => (
                <ListItem
                  key={p.id}
                  icon="account-lock-outline"
                  title={p.displayName}
                  subtitle="Local-only profile"
                  accessibilityHint="Unlock this profile with its PIN"
                  onPress={() => void useSession.getState().chooseProfile(p.id)}
                />
              ))}
            </View>
          ) : null}
          <Button
            label={profiles.length ? 'Add a new profile' : 'Get started'}
            icon="arrow-right"
            size="lg"
            variant={profiles.length ? 'outline' : 'primary'}
            onPress={startOnboarding}
          />
          <Text className="text-center text-xs leading-4 text-ink-muted">
            Doc Pawi provides health information and record keeping. It is not a substitute for a licensed
            healthcare professional.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
