import * as Notifications from 'expo-notifications';

import { listActiveSchedules, setScheduleNotificationId } from '../db/repositories/medications';
import type { ProfileSettings } from '../db/repositories/settings';
import type { Db } from '../db/types';

/**
 * Local medication reminders (Android AlarmManager via expo-notifications; no push service).
 * - A notification never records a dose; the user must tap Taken or Skipped in the app.
 * - By default the text does not name the medication (lock-screen privacy).
 * - Without the "Alarms & reminders" special access, Android may deliver reminders a few
 *   minutes late (inexact alarms). See docs/PRIVACY.md and docs/APP_FLOW.md.
 */
export const REMINDER_CHANNEL_ID = 'medication-reminders';

export type ReminderPermission = 'granted' | 'denied' | 'undetermined';

let handlerInstalled = false;
export function installNotificationHandler() {
  if (handlerInstalled) return;
  handlerInstalled = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function ensureReminderChannel() {
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
    name: 'Medication reminders',
    description: 'Reminders for medication doses you scheduled in Doc Pawi.',
    importance: Notifications.AndroidImportance.HIGH,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    vibrationPattern: [0, 250, 250, 250],
  });
}

export async function getReminderPermission(): Promise<ReminderPermission> {
  const status = await Notifications.getPermissionsAsync();
  if (status.granted) return 'granted';
  return status.canAskAgain ? 'undetermined' : 'denied';
}

/** Creates the channel first (required before Android 13+ shows the permission prompt). */
export async function requestReminderPermission(): Promise<ReminderPermission> {
  await ensureReminderChannel();
  const status = await Notifications.requestPermissionsAsync();
  if (status.granted) return 'granted';
  return status.canAskAgain ? 'undetermined' : 'denied';
}

interface ScheduleInfo {
  id: string;
  time_of_day: string;
  dose_label: string | null;
  medication_name: string;
  strength: string | null;
}

export function reminderContent(schedule: ScheduleInfo, showNames: boolean, profileId: string) {
  const title = showNames ? `Time for ${schedule.medication_name}` : 'Doc Pawi reminder';
  const body = showNames
    ? [schedule.dose_label, schedule.strength].filter(Boolean).join(' · ') || 'Scheduled dose'
    : 'You have a scheduled medication dose. Open Doc Pawi to record it.';
  return { title, body, data: { url: '/meds', profileId, scheduleId: schedule.id } };
}

export async function scheduleReminder(schedule: ScheduleInfo, showNames: boolean, profileId: string) {
  const [hour, minute] = schedule.time_of_day.split(':').map(Number);
  return Notifications.scheduleNotificationAsync({
    content: reminderContent(schedule, showNames, profileId),
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      channelId: REMINDER_CHANNEL_ID,
    },
  });
}

async function cancelProfileReminders(profileId: string) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const request of scheduled) {
    const data = request.content.data as { profileId?: string } | undefined;
    if (data?.profileId === profileId) {
      await Notifications.cancelScheduledNotificationAsync(request.identifier);
    }
  }
}

/**
 * Makes the OS schedule match the database: cancels this profile's reminders and schedules one
 * DAILY notification per active, enabled dose time. Returns the number scheduled.
 */
export async function reconcileReminders(db: Db, profileId: string, settings: ProfileSettings) {
  await cancelProfileReminders(profileId);
  const schedules = await listActiveSchedules(db, profileId);
  const permission = await getReminderPermission();
  let scheduled = 0;
  for (const s of schedules) {
    if (settings.remindersEnabled && permission === 'granted' && s.reminder_enabled === 1) {
      const id = await scheduleReminder(s, settings.showMedicationNamesInNotifications, profileId);
      await setScheduleNotificationId(db, s.id, id);
      scheduled += 1;
    } else if (s.notification_id) {
      await setScheduleNotificationId(db, s.id, null);
    }
  }
  return { scheduled, permission };
}

/** Cancels every reminder belonging to a profile (used when deleting its vault). */
export async function removeAllReminders(profileId: string) {
  await cancelProfileReminders(profileId);
}
