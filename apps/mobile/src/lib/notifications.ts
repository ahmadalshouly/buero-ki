// expo-notifications, or null where it cannot load. Since SDK 53 the module
// throws on import inside Expo Go on Android, which would take the whole app
// down, so there it is skipped and reminders are simply unavailable.
// Development and store builds load it as usual.
import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";

type NotificationsModule = typeof import("expo-notifications");

function load(): NotificationsModule | null {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return null;
  if (Platform.OS === "android" && Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-notifications") as NotificationsModule;
  } catch {
    return null;
  }
}

export const Notifications = load();
