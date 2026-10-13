// Optional biometric lock. Letters hold residence, health and money details, so
// people sharing a phone can require Face ID, fingerprint or the device PIN.
import { Ionicons } from "@expo/vector-icons";
import * as LocalAuthentication from "expo-local-authentication";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AppState, Platform, View } from "react-native";
import { Button, Txt } from "@/components/ui";
import { getPrefs, usePrefs } from "./prefs";
import { space, useColors } from "./theme";

const RELOCK_AFTER_MS = 30_000;
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

  const unlock = useCallback(() => {
    authenticate(t("lock.prompt")).then((ok) => ok && setLocked(false), () => {});
  }, [t]);

  // Ask right away when the app opens locked.
  useEffect(() => {
    if (lockSupported && getPrefs().appLock) unlock();
  }, [unlock]);

  useEffect(() => {
    if (!active) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") leftAt.current = Date.now();
      if (state === "active" && leftAt.current && Date.now() - leftAt.current > RELOCK_AFTER_MS) {
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
