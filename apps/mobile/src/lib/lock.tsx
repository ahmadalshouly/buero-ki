// Optional biometric lock. Letters hold residence, health and money details, so
// people sharing a phone can require Face ID, fingerprint or the device PIN.
import { Ionicons } from "@expo/vector-icons";
import * as LocalAuthentication from "expo-local-authentication";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AppState, Platform, View } from "react-native";
import { Button, Txt } from "@/components/ui";
import i18n from "./i18n";
import { getPrefs, setPrefs, usePrefs } from "./prefs";
import { space, useColors } from "./theme";

const RELOCK_AFTER_MS = 30_000;
// Errors that mean the lock can never succeed on this device or build (Expo Go has no Face ID permission).
const UNUSABLE = ["not_available", "not_enrolled", "passcode_not_set", "missing_usage_description"];
export const lockSupported = Platform.OS === "ios" || Platform.OS === "android";

export async function canUseBiometrics(): Promise<boolean> {
  if (!lockSupported) return false;
  return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
}

export async function authenticate(prompt: string): Promise<boolean> {
  const res = await LocalAuthentication.authenticateAsync({ promptMessage: prompt, disableDeviceFallback: false });
  return res.success;
}

export function LockGate({ children }: { children: ReactNode }) {
  const { appLock } = usePrefs();
  const { t } = useTranslation();
  const c = useColors();
  const active = lockSupported && appLock;
  const [locked, setLocked] = useState(() => lockSupported && getPrefs().appLock);
  const leftAt = useRef<number | null>(null);

  const asking = useRef(false);

  // One prompt at a time; repeated calls while the system dialog is up are ignored.
  const unlock = useCallback(async () => {
    if (asking.current) return;
    asking.current = true;
    try {
      // Face ID removed or not available (for example in Expo Go): don't lock the person out.
      if (!(await canUseBiometrics())) {
        setPrefs({ appLock: false });
        setLocked(false);
        return;
      }
      const res = await LocalAuthentication.authenticateAsync({ promptMessage: i18n.t("lock.prompt"), disableDeviceFallback: false });
      if (res.success) setLocked(false);
      else if (UNUSABLE.includes(res.error)) {
        setPrefs({ appLock: false });
        setLocked(false);
      }
    } catch {
      // Stay locked; the Unlock button tries again.
    } finally {
      asking.current = false;
    }
  }, []);

  // Ask once when the app opens locked.
  useEffect(() => {
    if (!lockSupported || !getPrefs().appLock) return;
    const timer = setTimeout(unlock, 0);
    return () => clearTimeout(timer);
  }, [unlock]);

  useEffect(() => {
    if (!active) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") leftAt.current = Date.now();
      if (state === "active" && leftAt.current && Date.now() - leftAt.current > RELOCK_AFTER_MS) {
        leftAt.current = null;
        setLocked(true);
        unlock();
      }
    });
    return () => sub.remove();
  }, [active, unlock]);

  if (!active || !locked) return <>{children}</>;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center", gap: space(4), padding: space(8) }}>
      <Ionicons name="lock-closed" size={48} color={c.accent} />
      <Txt variant="h2" style={{ textAlign: "center" }}>{t("lock.title")}</Txt>
      <Button icon="finger-print" title={t("lock.unlock")} onPress={unlock} />
    </View>
  );
}
