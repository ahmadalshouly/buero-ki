// Toasts and confirmation dialogs that work the same on iOS, Android and web
// (Alert.alert does nothing on web).
import { Ionicons } from "@expo/vector-icons";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Animated, Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { success, warning } from "@/lib/haptics";
import { radius, space, useColors } from "@/lib/theme";
import { Button, Txt } from "./ui";

type ToastTone = "success" | "error" | "info";
interface ConfirmOptions {
  title: string;
  message?: string;
  confirm: string;
  destructive?: boolean;
}

interface Feedback {
  toast: (message: string, tone?: ToastTone) => void;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<Feedback>({ toast: () => {}, confirm: async () => false });
export const useFeedback = () => useContext(FeedbackContext);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const c = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, tone: ToastTone = "success") => {
    if (tone === "success") success();
    if (tone === "error") warning();
    setToast({ message, tone });
    Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setToast(null));
    }, tone === "error" ? 4500 : 2600);
  }, [opacity]);

  const confirm = useCallback((opts: ConfirmOptions) => new Promise<boolean>((resolve) => {
    setDialog({ ...opts, resolve });
  }), []);

  const close = (value: boolean) => {
    dialog?.resolve(value);
    setDialog(null);
  };

  const icon = toast?.tone === "error" ? "alert-circle" : toast?.tone === "info" ? "information-circle" : "checkmark-circle";
  const iconColor = toast?.tone === "error" ? c.danger : c.accent;

  return (
    <FeedbackContext.Provider value={{ toast: showToast, confirm }}>
      {children}
      {toast && (
        <Animated.View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={{ position: "absolute", left: space(4), right: space(4), bottom: insets.bottom + space(20), alignItems: "center", opacity }}
        >
          <View style={{
            flexDirection: "row", alignItems: "center", gap: space(2), maxWidth: 520,
            backgroundColor: c.ink, paddingHorizontal: space(4), paddingVertical: space(3), borderRadius: 999,
          }}>
            <Ionicons name={icon} size={20} color={iconColor} />
            <Txt tone="bg" style={{ flexShrink: 1 }}>{toast.message}</Txt>
          </View>
        </Animated.View>
      )}
      <Modal visible={!!dialog} transparent animationType="fade" onRequestClose={() => close(false)}>
        <Pressable
          onPress={() => close(false)}
          style={{ flex: 1, backgroundColor: c.overlay, alignItems: "center", justifyContent: "center", padding: space(6) }}
        >
          <Pressable
            onPress={() => {}}
            accessibilityRole="alert"
            style={{ backgroundColor: c.solid, borderRadius: radius.lg, borderCurve: "continuous", padding: space(5), gap: space(3), width: "100%", maxWidth: 420 }}
          >
            <Txt variant="h2">{dialog?.title}</Txt>
            {dialog?.message && <Txt tone="muted">{dialog.message}</Txt>}
            <View style={{ flexDirection: "row", gap: space(2), marginTop: space(2) }}>
              <Button style={{ flex: 1 }} variant="secondary" title={t("common.cancel")} onPress={() => close(false)} />
              <Button
                style={{ flex: 1 }}
                variant={dialog?.destructive ? "danger" : "primary"}
                title={dialog?.confirm ?? "OK"}
                onPress={() => close(true)}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </FeedbackContext.Provider>
  );
}
