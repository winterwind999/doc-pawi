import Constants from 'expo-constants';
import * as LocalAuthentication from 'expo-local-authentication';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Text, View } from 'react-native';

import { ModelStatusCard } from '@/components/ModelStatusCard';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ChoiceChips, ToggleRow } from '@/components/ui/Choice';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { KeyValueRow, ListItem, Screen, SectionHeader } from '@/components/ui/Layout';
import { useLiveQuery } from '@/hooks/use-live-query';
import { deleteAllConversations } from '@/lib/db/repositories/conversations';
import { getActivitySummary } from '@/lib/db/repositories/stats';
import { DemoDataAlreadyLoadedError, loadDemoData, removeDemoData } from '@/lib/demo/synthetic-data';
import { getReminderPermission, reconcileReminders, requestReminderPermission, type ReminderPermission } from '@/lib/notifications/reminders';
import { useSession, useUnlockedSession } from '@/stores/session-store';

type Confirm = 'conversations' | 'vault' | 'signout' | 'demo-remove' | null;

export default function SettingsScreen() {
  const { db, profileId } = useUnlockedSession();
  const settings = useSession((s) => s.settings);
  const biometricEnabled = useSession((s) => s.biometricEnabled);
  const cipherVersion = useSession((s) => s.cipherVersion);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [permission, setPermission] = useState<ReminderPermission | null>(null);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const summary = useLiveQuery((db, p) => getActivitySummary(db, p, '0000-00-00T00:00'));
  const update = useSession.getState().updateSettings;

  useFocusEffect(
    useCallback(() => {
      void getReminderPermission().then(setPermission);
      void (async () => setBioAvailable((await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync())))();
    }, []),
  );

  const run = async (label: string, fn: () => Promise<string | void>) => {
    setBusy(label);
    setMessage(null);
    try {
      const text = await fn();
      if (text) setMessage({ tone: 'success', text });
    } catch (e) {
      setMessage({ tone: 'danger', text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: 'Settings' }} />
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}

      <SectionHeader title="On-device AI" />
      <ModelStatusCard />
      <Button label="Manage AI model" variant="outline" icon="chip" onPress={() => router.push('/model')} />
      <Card className="px-4 py-1">
        <ToggleRow
          label="Load the model after unlocking"
          description="Faster first answer; uses about 1.5 GB of memory while loaded."
          value={settings.autoLoadModel}
          onChange={(v) => void update({ autoLoadModel: v })}
        />
      </Card>

      <SectionHeader title="Security" />
      <Card className="gap-1 px-4 py-2">
        <ListItem icon="form-textbox-password" title="Change PIN" chevron onPress={() => router.push('/change-pin')} />
        <ToggleRow
          label="Unlock with fingerprint or face"
          description={bioAvailable ? 'Your PIN always works as a fallback.' : 'No enrolled biometrics on this device.'}
          value={biometricEnabled}
          disabled={!bioAvailable}
          onChange={(v) =>
            void run('bio', async () => {
              await useSession.getState().setBiometricEnabled(v);
              return v ? 'Biometric unlock is on.' : 'Biometric unlock is off.';
            })
          }
        />
        <ChoiceChips
          label="Lock automatically after inactivity"
          options={[1, 2, 5, 10, 15].map((m) => ({ value: String(m), label: `${m} min` }))}
          value={String(settings.idleLockMinutes)}
          onChange={(v) => v && void update({ idleLockMinutes: Number(v) })}
        />
        <View className="py-2">
          <Button label="Lock now" variant="outline" icon="lock-outline" onPress={() => void useSession.getState().lock()} />
        </View>
      </Card>

      <SectionHeader title="Medication reminders" />
      <Card className="gap-1 px-4 py-2">
        <ToggleRow
          label="Reminders"
          description="Local notifications at your scheduled dose times."
          value={settings.remindersEnabled}
          onChange={(v) => void update({ remindersEnabled: v })}
        />
        <ToggleRow
          label="Show medication names in notifications"
          description="Off by default so names do not appear on your lock screen."
          value={settings.showMedicationNamesInNotifications}
          onChange={(v) => void update({ showMedicationNamesInNotifications: v })}
        />
        <KeyValueRow label="Notification permission" value={permission === 'granted' ? 'Allowed' : permission === 'denied' ? 'Blocked' : 'Not asked yet'} />
        <View className="flex-row flex-wrap gap-2 py-2">
          {permission === 'undetermined' ? (
            <Button
              label="Allow notifications"
              size="sm"
              onPress={() =>
                void run('perm', async () => {
                  const p = await requestReminderPermission();
                  setPermission(p);
                  if (p === 'granted') await reconcileReminders(db, profileId, settings);
                })
              }
            />
          ) : null}
          <Button label="Android notification settings" size="sm" variant="outline" icon="open-in-new" onPress={() => void Linking.openSettings()} />
        </View>
        <Text className="pb-2 text-xs leading-4 text-ink-muted">
          Without the “Alarms & reminders” permission (Android app settings), Android may deliver reminders a few
          minutes late to save battery. Reminders never record a dose for you.
        </Text>
      </Card>

      <SectionHeader title="Synthetic demo data" />
      <Card className="gap-2">
        <Text className="text-sm leading-5 text-ink-muted">
          Loads fictional records, vaccinations, medications, a doctor, and an HMO for evaluation (see the Panelist Testing
          Guide). Everything is labelled “Demo” and can be removed without touching your own entries.
        </Text>
        {summary.data && summary.data.demoRows > 0 ? (
          <Button label="Remove demo data" variant="outline" icon="flask-remove-outline" loading={busy === 'demo'} onPress={() => setConfirm('demo-remove')} />
        ) : (
          <Button
            label="Load synthetic demo data"
            variant="secondary"
            icon="flask-outline"
            loading={busy === 'demo'}
            onPress={() =>
              void run('demo', async () => {
                try {
                  await loadDemoData(db, profileId);
                } catch (e) {
                  if (e instanceof DemoDataAlreadyLoadedError) return e.message;
                  throw e;
                }
                await reconcileReminders(db, profileId, settings).catch(() => undefined);
                return 'Synthetic demo data loaded. Look for items marked “Demo”.';
              })
            }
          />
        )}
      </Card>

      <SectionHeader title="Privacy and information" />
      <ListItem icon="shield-lock-outline" title="Privacy" subtitle="What is stored, where, and what uses the network" onPress={() => router.push('/about/privacy')} />
      <ListItem icon="chip" title="AI model disclosure" subtitle="Model, runtime, licenses, and limitations" onPress={() => router.push('/about/model-disclosure')} />
      <ListItem icon="doctor" title="Medical disclaimer" onPress={() => router.push('/about/disclaimer')} />
      <ListItem icon="palette-outline" title="Style check" subtitle="NativeWind rendering verification screen" onPress={() => router.push('/dev/style-check')} />
      <Card className="gap-1">
        <KeyValueRow label="App version" value={Constants.expoConfig?.version ?? '—'} />
        <KeyValueRow label="Database encryption" value={cipherVersion ? `SQLCipher ${cipherVersion}` : 'Unknown'} />
        <KeyValueRow label="Profile" value="Local-only" />
      </Card>

      <SectionHeader title="Account and data" />
      <View className="gap-2">
        <Button label="Sign out" variant="outline" icon="logout" onPress={() => setConfirm('signout')} />
        <Button label="Delete all conversations" variant="outline" icon="chat-remove-outline" onPress={() => setConfirm('conversations')} />
        <Button label="Delete health vault" variant="danger" icon="delete-forever-outline" onPress={() => setConfirm('vault')} />
        <Text className="text-xs leading-4 text-ink-muted">
          Removing the AI model is done from Manage AI model and does not touch your health data.
        </Text>
      </View>

      <ConfirmDialog
        visible={confirm === 'signout'}
        title="Sign out?"
        message="Your encrypted vault is closed and stays on this phone. You can unlock it again with your PIN, even offline."
        confirmLabel="Sign out"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          void useSession.getState().signOut();
        }}
      />
      <ConfirmDialog
        visible={confirm === 'conversations'}
        title="Delete all conversations?"
        message="Every chat message and every unconfirmed AI suggestion will be permanently deleted. Records you confirmed are kept."
        confirmLabel="Delete conversations"
        destructive
        requireText="DELETE"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          void run('conv', async () => `${await deleteAllConversations(db, profileId)} conversation(s) deleted.`);
        }}
      />
      <ConfirmDialog
        visible={confirm === 'demo-remove'}
        title="Remove demo data?"
        message="All items marked “Demo” (records, treatments, medications, doctors, HMOs, facilities) are deleted. Your own entries stay."
        confirmLabel="Remove demo data"
        destructive
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          void run('demo', async () => {
            await removeDemoData(db, profileId);
            await reconcileReminders(db, profileId, settings).catch(() => undefined);
            return 'Demo data removed.';
          });
        }}
      />
      <ConfirmDialog
        visible={confirm === 'vault'}
        title="Delete your entire health vault?"
        message="This permanently erases this profile’s encrypted database (records, medications, conversations), all imported documents, reminders, and encryption keys. It cannot be undone. Other profiles and the AI model file are not affected."
        confirmLabel="Delete everything"
        destructive
        requireText="DELETE"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          void useSession.getState().deleteVault();
        }}
      />
    </Screen>
  );
}
