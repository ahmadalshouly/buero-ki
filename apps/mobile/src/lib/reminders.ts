// Local deadline reminders. They are scheduled on the device, so they work
// offline and no letter content leaves the phone for push delivery.
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { Task } from "./types";

export const supported = Platform.OS === "ios" || Platform.OS === "android";
const MAX_SCHEDULED = 60; // iOS keeps at most 64 pending local notifications.
const CHANNEL = "deadlines";

export interface PlannedReminder {
  taskId: string;
  caseId: string;
  date: Date;
  kind: "soon" | "today";
  title: string;
}

/** Plans a reminder three days before (09:00) and on the due day (08:00) for each open task. */
export function planReminders(tasks: Task[], now = new Date()): PlannedReminder[] {
  const out: PlannedReminder[] = [];
  for (const task of tasks) {
    if (task.done || !task.due_date) continue;
    const [y, m, d] = task.due_date.split("-").map(Number);
    const soon = new Date(y, m - 1, d - 3, 9, 0, 0);
    const today = new Date(y, m - 1, d, 8, 0, 0);
    if (soon > now) out.push({ taskId: task.id, caseId: task.case_id, date: soon, kind: "soon", title: task.title });
    if (today > now) out.push({ taskId: task.id, caseId: task.case_id, date: today, kind: "today", title: task.title });
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, MAX_SCHEDULED);
}

export async function ensurePermission(): Promise<boolean> {
  if (!supported) return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

let lastSignature = "";

export async function syncReminders(
  tasks: Task[],
  enabled: boolean,
  text: (r: PlannedReminder) => { title: string; body: string },
): Promise<void> {
  if (!supported) return;
  const plan = enabled ? planReminders(tasks) : [];
  const signature = plan.map((r) => `${r.taskId}:${r.kind}:${r.date.getTime()}:${r.title}`).join("|");
  if (signature === lastSignature) return;
  lastSignature = signature;

  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!plan.length) return;
  const granted = (await Notifications.getPermissionsAsync()).granted;
  if (!granted) return;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: "Deadlines",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  for (const r of plan) {
    await Notifications.scheduleNotificationAsync({
      content: { ...text(r), data: { caseId: r.caseId, taskId: r.taskId } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.date, channelId: CHANNEL },
    });
  }
}

if (supported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}
