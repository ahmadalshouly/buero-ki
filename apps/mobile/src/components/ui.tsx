import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator, Animated, Modal, Pressable, RefreshControl, ScrollView, Switch, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { tap } from "@/lib/haptics";
import { daysUntil, formatDate } from "@/lib/i18n";
import { makeStyles } from "@/lib/styles";
import { isDemo } from "@/lib/supabase";
import { font, type Palette, radius, space, useColors } from "@/lib/theme";

export type IconName = ComponentProps<typeof Ionicons>["name"];
type Tone = "neutral" | "accent" | "warn" | "danger";

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.bg },
  scroll: { paddingBottom: space(12) },
  column: { width: "100%", maxWidth: 680, alignSelf: "center", padding: space(4), gap: space(5) },
  card: {
    backgroundColor: c.card,
    borderRadius: radius.md,
    padding: space(4),
    gap: space(2),
    borderWidth: 1,
    borderColor: c.line,
  },
  pressed: { opacity: 0.72 },
  button: {
    minHeight: 50,
    borderRadius: radius.md,
    paddingHorizontal: space(5),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space(2),
  },
  buttonSmall: { minHeight: 38, paddingHorizontal: space(3.5), borderRadius: radius.sm },
  buttonText: { fontSize: 16, fontWeight: "600" },
  input: {
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: radius.sm,
    paddingHorizontal: space(3.5),
    paddingVertical: space(3),
    fontSize: 16,
    color: c.ink,
  },
  inputError: { borderColor: c.danger },
  multiline: { minHeight: 120, textAlignVertical: "top" },
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
    backgroundColor: c.warnSoft,
    borderRadius: radius.sm,
    padding: space(3),
  },
  chip: {
    paddingHorizontal: space(3.5),
    paddingVertical: space(2),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.line,
    backgroundColor: c.card,
  },
  chipText: { fontSize: 15, color: c.ink },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  segmented: { flexDirection: "row", backgroundColor: c.skeleton, borderRadius: radius.sm, padding: 3, gap: 3 },
  segment: { flex: 1, paddingVertical: space(2), borderRadius: radius.sm - 3, alignItems: "center" },
  segmentOn: { backgroundColor: c.card },
  listRow: { flexDirection: "row", alignItems: "center", gap: space(3), paddingVertical: space(3.5), paddingHorizontal: space(4) },
  group: { backgroundColor: c.card, borderRadius: radius.md, borderWidth: 1, borderColor: c.line, overflow: "hidden" },
  divider: { height: 1, backgroundColor: c.line, marginStart: space(4) },
  sheetBackdrop: { flex: 1, backgroundColor: c.overlay, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: c.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: space(4),
    gap: space(3),
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
  },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: c.line, alignSelf: "center" },
}));

export function Screen({
  children, scroll = true, footer, refreshing, onRefresh, padTop = false,
}: {
  children: ReactNode;
  scroll?: boolean;
  footer?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** For screens without a header: keep content clear of the status bar. */
  padTop?: boolean;
}) {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const top = padTop ? { paddingTop: insets.top + space(2) } : null;
  return (
    <SafeAreaView style={s.screen} edges={["left", "right"]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh
            ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={s.c.accent} colors={[s.c.accent]} />
            : undefined}
        >
          <View style={[s.column, top]}>{children}</View>
        </ScrollView>
      ) : (
        <View style={[s.column, top, { flex: 1 }]}>{children}</View>
      )}
      {footer}
    </SafeAreaView>
  );
}

export function Txt({
  children, variant = "body", tone = "ink", style, numberOfLines, selectable, onPress,
}: {
  onPress?: () => void;
  children: ReactNode;
  variant?: keyof typeof font;
  tone?: keyof Palette;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  selectable?: boolean;
}) {
  const c = useColors();
  return (
    <Text selectable={selectable} numberOfLines={numberOfLines} onPress={onPress} style={[font[variant], { color: c[tone] }, style]}>
      {children}
    </Text>
  );
}

export const Title = ({ children }: { children: ReactNode }) => <Txt variant="title">{children}</Txt>;
export const Muted = ({ children, numberOfLines }: { children: ReactNode; numberOfLines?: number }) => (
  <Txt variant="small" tone="muted" numberOfLines={numberOfLines}>{children}</Txt>
);

export function Card({
  children, style, onPress, accessibilityLabel,
}: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accessibilityLabel?: string }) {
  const s = useStyles();
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [s.card, pressed && s.pressed, style]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[s.card, style]}>{children}</View>;
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  title, onPress, icon, variant = "primary", loading, disabled, style, small,
}: {
  title: string;
  onPress: () => void;
  icon?: IconName;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const s = useStyles();
  const { c } = s;
  const fg = { primary: c.accentInk, secondary: c.accent, ghost: c.accent, danger: c.danger }[variant];
  const bg = { primary: c.accent, secondary: c.accentSoft, ghost: "transparent", danger: c.dangerSoft }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      onPress={() => {
        tap();
        onPress();
      }}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.button,
        small && s.buttonSmall,
        { backgroundColor: bg },
        (disabled || loading) && { opacity: 0.5 },
        pressed && s.pressed,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={small ? 17 : 20} color={fg} /> : null}
      <Text style={[s.buttonText, small && { fontSize: 15 }, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({
  icon, onPress, label, color,
}: { icon: IconName; onPress: () => void; label: string; color?: string }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={12}
      style={({ pressed }) => [{ padding: 4 }, pressed && { opacity: 0.6 }]}>
      <Ionicons name={icon} size={24} color={color ?? c.ink} />
    </Pressable>
  );
}

export function Field({
  label, hint, error, ...props
}: TextInputProps & { label: string; hint?: string; error?: string | null }) {
  const s = useStyles();
  return (
    <View style={{ gap: space(1.5) }}>
      <Txt variant="h3">{label}</Txt>
      <TextInput
        placeholderTextColor={s.c.faint}
        accessibilityLabel={label}
        {...props}
        style={[s.input, props.multiline && s.multiline, error && s.inputError, props.style]}
      />
      {error ? <Txt variant="small" tone="danger">{error}</Txt> : hint ? <Muted>{hint}</Muted> : null}
    </View>
  );
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  const s = useStyles();
  return (
    <View style={{ gap: space(3) }}>
      <View style={s.row}>
        <Txt variant="h2" style={{ flex: 1 }}>{title}</Txt>
        {action}
      </View>
      {children}
    </View>
  );
}

function toneColors(c: Palette, tone: Tone) {
  return {
    neutral: { bg: c.skeleton, fg: c.muted },
    accent: { bg: c.accentSoft, fg: c.accent },
    warn: { bg: c.warnSoft, fg: c.warn },
    danger: { bg: c.dangerSoft, fg: c.danger },
  }[tone];
}

export function Badge({ label, tone = "neutral", icon }: { label: string; tone?: Tone; icon?: IconName }) {
  const s = useStyles();
  const p = toneColors(s.c, tone);
  return (
    <View style={[s.badge, { backgroundColor: p.bg }]}>
      {icon && <Ionicons name={icon} size={13} color={p.fg} />}
      <Text style={[s.badgeText, { color: p.fg }]}>{label}</Text>
    </View>
  );
}

export function DueBadge({ date }: { date: string | null }) {
  const { t } = useTranslation();
  if (!date) return null;
  const days = daysUntil(date);
  if (days < 0) return <Badge tone="danger" icon="alert-circle" label={t("due.overdue", { date: formatDate(date) })} />;
  if (days === 0) return <Badge tone="danger" icon="time" label={t("due.today")} />;
  if (days === 1) return <Badge tone="warn" icon="time-outline" label={t("due.tomorrow")} />;
  return <Badge tone={days <= 7 ? "warn" : "neutral"} icon="calendar-outline" label={t("due.on", { date: formatDate(date) })} />;
}

export function ErrorBox({ message, onRetry }: { message?: string | null; onRetry?: () => void }) {
  const { t } = useTranslation();
  const c = useColors();
  return (
    <Card style={{ backgroundColor: c.dangerSoft, borderColor: c.dangerSoft, flexDirection: "row", alignItems: "flex-start" }}>
      <Ionicons name="alert-circle-outline" size={22} color={c.danger} />
      <View style={{ flex: 1, gap: space(1) }}>
        <Txt tone="danger">{message || t("common.error")}</Txt>
        {onRetry && <Button small variant="ghost" title={t("common.retry")} onPress={onRetry} style={{ alignSelf: "flex-start", paddingHorizontal: 0 }} />}
      </View>
    </Card>
  );
}

export function Loading() {
  const c = useColors();
  return (
    <View style={{ padding: space(10), alignItems: "center" }} accessibilityLabel="Loading">
      <ActivityIndicator color={c.accent} />
    </View>
  );
}

export function Skeleton({ height = 16, width = "100%", style }: { height?: number; width?: number | `${number}%`; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const [pulse] = useState(() => new Animated.Value(0.55));
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.55, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View style={[{ height, width, borderRadius: 8, backgroundColor: c.skeleton, opacity: pulse }, style]} />;
}

/** Placeholder cards shown while a list loads for the first time. */
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <View style={{ gap: space(3) }} accessibilityLabel="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Card key={i}>
          <Skeleton width="60%" height={18} />
          <Skeleton width="85%" />
          <Skeleton width="35%" height={14} />
        </Card>
      ))}
    </View>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: IconName; title: string; text?: string; action?: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ alignItems: "center", gap: space(2), paddingVertical: space(6), paddingHorizontal: space(4) }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c.accentSoft, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={icon} size={30} color={c.accent} />
      </View>
      <Txt variant="h3" style={{ textAlign: "center" }}>{title}</Txt>
      {text && <Txt variant="small" tone="muted" style={{ textAlign: "center", maxWidth: 360 }}>{text}</Txt>}
      {action && <View style={{ marginTop: space(2), alignSelf: "stretch", alignItems: "center" }}>{action}</View>}
    </View>
  );
}

export function DemoBanner() {
  const { t } = useTranslation();
  const s = useStyles();
  if (!isDemo) return null;
  return (
    <View style={s.demo}>
      <Ionicons name="flask-outline" size={16} color={s.c.warn} />
      <Txt variant="small" tone="warn" style={{ flex: 1 }}>{t("common.demo")}</Txt>
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const s = useStyles();
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[s.chip, selected && { backgroundColor: s.c.accent, borderColor: s.c.accent }]}
    >
      <Text style={[s.chipText, selected && { color: s.c.accentInk }]}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  value, options, onChange,
}: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const s = useStyles();
  return (
    <View style={s.segmented} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              tap();
              onChange(o.value);
            }}
            style={[s.segment, on && s.segmentOn]}
          >
            <Text numberOfLines={1} style={[font.small, { fontWeight: on ? "700" : "500", color: on ? s.c.ink : s.c.muted }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function IconCircle({ name, tone = "accent", size = 40 }: { name: IconName; tone?: Tone; size?: number }) {
  const s = useStyles();
  const p = toneColors(s.c, tone);
  return (
    <View style={[s.iconCircle, { width: size, height: size, borderRadius: size / 2, backgroundColor: p.bg }]}>
      <Ionicons name={name} size={size / 2} color={p.fg} />
    </View>
  );
}

/** A grouped list, like iOS settings. */
export function Group({ children }: { children: ReactNode }) {
  const s = useStyles();
  const items = (Array.isArray(children) ? children : [children]).flat().filter(Boolean);
  return (
    <View style={s.group}>
      {items.map((child, i) => (
        <View key={i}>
          {i > 0 && <View style={s.divider} />}
          {child}
        </View>
      ))}
    </View>
  );
}

export function ListRow({
  icon, title, subtitle, onPress, right, tone = "accent", destructive, chevron = !!onPress,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string | null;
  onPress?: () => void;
  right?: ReactNode;
  tone?: Tone;
  destructive?: boolean;
  chevron?: boolean;
}) {
  const s = useStyles();
  const body = (
    <>
      {icon && <Ionicons name={icon} size={22} color={destructive ? s.c.danger : toneColors(s.c, tone).fg} />}
      <View style={{ flex: 1, gap: 2 }}>
        <Txt tone={destructive ? "danger" : "ink"}>{title}</Txt>
        {subtitle ? <Muted>{subtitle}</Muted> : null}
      </View>
      {right}
      {chevron && <Ionicons name="chevron-forward" size={18} color={s.c.faint} />}
    </>
  );
  if (!onPress) return <View style={s.listRow}>{body}</View>;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.listRow, pressed && { backgroundColor: s.c.raised }]}>
      {body}
    </Pressable>
  );
}

export function SwitchRow({
  icon, title, subtitle, value, onChange, disabled,
}: { icon?: IconName; title: string; subtitle?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const c = useColors();
  return (
    <ListRow
      icon={icon}
      title={title}
      subtitle={subtitle}
      chevron={false}
      right={(
        <Switch
          accessibilityLabel={title}
          value={value}
          disabled={disabled}
          onValueChange={(v) => {
            tap();
            onChange(v);
          }}
          trackColor={{ true: c.accent, false: c.line }}
          thumbColor="#FFFFFF"
        />
      )}
    />
  );
}

/** Bottom sheet for choices and short forms. */
export function Sheet({
  visible, onClose, title, children,
}: { visible: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={s.sheetBackdrop} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={[s.sheet, { paddingBottom: insets.bottom + space(4) }]} onPress={() => {}}>
          <View style={s.grabber} />
          {title && <Txt variant="h2">{title}</Txt>}
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function StatTile({ label, value, tone = "neutral" }: { label: string; value: string; tone?: Tone }) {
  const s = useStyles();
  const p = toneColors(s.c, tone);
  return (
    <View style={[s.card, { flex: 1, minWidth: 96, gap: 2 }]}>
      <Text style={[font.h2, { color: tone === "neutral" ? s.c.ink : p.fg, fontVariant: ["tabular-nums"] }]}>{value}</Text>
      <Muted numberOfLines={2}>{label}</Muted>
    </View>
  );
}
