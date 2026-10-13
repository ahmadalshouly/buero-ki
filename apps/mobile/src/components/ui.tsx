import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { daysUntil, formatDate } from "@/lib/i18n";
import { isDemo } from "@/lib/supabase";
import { colors, radius, space, type } from "@/lib/theme";

export type IconName = ComponentProps<typeof Ionicons>["name"];

export function Screen({ children, scroll = true, footer }: { children: ReactNode; scroll?: boolean; footer?: ReactNode }) {
  return (
    <SafeAreaView style={styles.screen} edges={["bottom", "left", "right"]}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.column}>{children}</View>
        </ScrollView>
      ) : (
        <View style={[styles.column, { flex: 1 }]}>{children}</View>
      )}
      {footer}
    </SafeAreaView>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

type ButtonVariant = "primary" | "secondary" | "ghost";

export function Button({
  title, onPress, icon, variant = "primary", loading, disabled, style,
}: {
  title: string;
  onPress: () => void;
  icon?: IconName;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const fg = variant === "primary" ? colors.accentInk : colors.accent;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        variant === "primary" && { backgroundColor: colors.accent },
        variant === "secondary" && { backgroundColor: colors.accentSoft },
        variant === "ghost" && { backgroundColor: "transparent" },
        (disabled || loading) && { opacity: 0.5 },
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={20} color={fg} /> : null}
      <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: space(1.5) }}>
      <Text style={type.h3}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} {...props} style={[styles.input, props.multiline && styles.multiline, props.style]} />
    </View>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={type.title}>{children}</Text>;
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <View style={{ gap: space(3) }}>
      <View style={styles.row}>
        <Text style={[type.h2, { flex: 1 }]}>{title}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={type.small}>{children}</Text>;
}

export function Badge({ label, tone = "neutral", icon }: { label: string; tone?: "neutral" | "accent" | "warn" | "danger"; icon?: IconName }) {
  const palette = {
    neutral: { bg: colors.bg, fg: colors.muted },
    accent: { bg: colors.accentSoft, fg: colors.accent },
    warn: { bg: colors.warnSoft, fg: colors.warn },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      {icon && <Ionicons name={icon} size={13} color={palette.fg} />}
      <Text style={[styles.badgeText, { color: palette.fg }]}>{label}</Text>
    </View>
  );
}

export function DueBadge({ date }: { date: string | null }) {
  const { t } = useTranslation();
  if (!date) return null;
  const days = daysUntil(date);
  if (days < 0) return <Badge tone="danger" icon="alert-circle" label={t("due.overdue", { date: formatDate(date) })} />;
  if (days === 0) return <Badge tone="danger" icon="time" label={t("due.today")} />;
  return <Badge tone={days <= 7 ? "warn" : "neutral"} icon="calendar-outline" label={t("due.on", { date: formatDate(date) })} />;
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <Card style={{ backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft }}>
      <Text style={[type.body, { color: colors.danger }]}>{message || t("common.error")}</Text>
      {onRetry && <Button variant="ghost" title={t("common.retry")} onPress={onRetry} style={{ alignSelf: "flex-start" }} />}
    </Card>
  );
}

export function Loading() {
  return (
    <View style={{ padding: space(10), alignItems: "center" }}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

export function DemoBanner() {
  const { t } = useTranslation();
  if (!isDemo) return null;
  return (
    <View style={styles.demo}>
      <Ionicons name="flask-outline" size={16} color={colors.warn} />
      <Text style={[type.small, { color: colors.warn, flex: 1 }]}>{t("common.demo")}</Text>
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.chip, selected && { backgroundColor: colors.accent, borderColor: colors.accent }]}
    >
      <Text style={[styles.chipText, selected && { color: colors.accentInk }]}>{label}</Text>
    </Pressable>
  );
}

export function IconCircle({ name, tone = "accent" }: { name: IconName; tone?: "accent" | "warn" }) {
  const bg = tone === "accent" ? colors.accentSoft : colors.warnSoft;
  const fg = tone === "accent" ? colors.accent : colors.warn;
  return (
    <View style={[styles.iconCircle, { backgroundColor: bg }]}>
      <Ionicons name={name} size={20} color={fg} />
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingBottom: space(10) },
  column: { width: "100%", maxWidth: 640, alignSelf: "center", padding: space(4), gap: space(5) },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space(4),
    gap: space(2),
    borderWidth: 1,
    borderColor: colors.line,
  },
  pressed: { opacity: 0.75 },
  button: {
    minHeight: 50,
    borderRadius: radius.md,
    paddingHorizontal: space(5),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space(2),
  },
  buttonText: { fontSize: 16, fontWeight: "600" },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: space(3.5),
    paddingVertical: space(3),
    fontSize: 16,
    color: colors.ink,
  },
  multiline: { minHeight: 110, textAlignVertical: "top" },
  row: { flexDirection: "row", alignItems: "center", gap: space(3) },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    paddingHorizontal: space(2),
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeText: { fontSize: 13, fontWeight: "600" },
  demo: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(2),
    backgroundColor: colors.warnSoft,
    borderRadius: radius.sm,
    padding: space(3),
  },
  chip: {
    paddingHorizontal: space(3.5),
    paddingVertical: space(2),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  chipText: { fontSize: 15, color: colors.ink },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
