import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator, Animated, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useDirection, useIconFlip, useInputDir, useLtrText, useTextDir } from "@/lib/direction";
import { tap } from "@/lib/haptics";
import { daysUntil, formatDate } from "@/lib/i18n";
import { makeStyles } from "@/lib/styles";
import { isDemo } from "@/lib/supabase";
import { curve, font, lift, type Palette, radius, space, useColors } from "@/lib/theme";
import { Backdrop, GlassFill, glassSurface } from "./glass";

export type IconName = ComponentProps<typeof Ionicons>["name"];
type Tone = "neutral" | "accent" | "warn" | "danger";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.bg },
  screen: { flex: 1 },
  scroll: { paddingBottom: Platform.OS === "web" ? space(24) : space(12) },
  column: { width: "100%", maxWidth: 680, alignSelf: "center", padding: space(4), gap: space(5) },
  card: { ...glassSurface(c), padding: space(4), gap: space(2) },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  button: {
    minHeight: 50,
    borderRadius: 999,
    paddingHorizontal: space(5),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space(2),
  },
  buttonSmall: { minHeight: 36, paddingHorizontal: space(3.5) },
  buttonText: { fontSize: 17, fontWeight: "600", letterSpacing: -0.41 },
  input: {
    backgroundColor: c.glassFill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.line,
    borderRadius: radius.sm,
    ...curve,
    paddingHorizontal: space(3.5),
    paddingVertical: space(3),
    fontSize: 17,
    color: c.ink,
  },
  inputError: { borderColor: c.danger, borderWidth: 1 },
  multiline: { minHeight: 120, textAlignVertical: "top" },
  row: { flexDirection: "row", alignItems: "center", gap: space(3) },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    paddingHorizontal: space(2.5),
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
    ...curve,
    padding: space(3),
  },
  chip: {
    paddingHorizontal: space(3.5),
    paddingVertical: space(2),
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.glassEdge,
    backgroundColor: c.glassFill,
  },
  chipText: { fontSize: 15, color: c.ink, letterSpacing: -0.24 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  segmented: { flexDirection: "row", backgroundColor: c.raised, borderRadius: 999, padding: 3, gap: 3 },
  segment: { flex: 1, paddingVertical: space(2), borderRadius: 999, alignItems: "center" },
  segmentOn: { backgroundColor: c.segment, ...lift(c), shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  listRow: { flexDirection: "row", alignItems: "center", gap: space(3), paddingVertical: space(3), paddingHorizontal: space(4), minHeight: 52 },
  rowIcon: { width: 30, height: 30, borderRadius: 8, ...curve, alignItems: "center", justifyContent: "center" },
  group: glassSurface(c),
  groupClip: { borderRadius: radius.md, ...curve, overflow: "hidden" },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: c.line, marginStart: space(4) },
  sheetBackdrop: { flex: 1, backgroundColor: c.overlay, justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    ...curve,
    backgroundColor: Platform.OS === "android" ? c.solid : c.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    borderColor: c.glassEdge,
    padding: space(4),
    gap: space(3),
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
  },
  grabber: { width: 36, height: 5, borderRadius: 3, backgroundColor: c.faint, opacity: 0.5, alignSelf: "center" },
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
  // On iOS the scroll view insets itself for the status bar, translucent
  // header and tab bar, so content scrolls under the glass.
  const top = padTop ? { paddingTop: (scroll && Platform.OS === "ios" ? 0 : insets.top) + space(2) } : null;
  return (
    <View style={s.root}>
    <Backdrop />
    <SafeAreaView style={s.screen} edges={["left", "right"]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={s.scroll}
          contentInsetAdjustmentBehavior="automatic"
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
    </View>
  );
}

/** A glass bar pinned under a screen's content, for its main action. */
export function Footer({ children }: { children: ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={{
      paddingHorizontal: space(4), paddingTop: space(3), paddingBottom: Math.max(insets.bottom, space(3)),
      backgroundColor: Platform.OS === "android" ? c.glassFill : undefined,
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line,
    }}>
      <GlassFill round={0} material="chrome" />
      <View style={{ width: "100%", maxWidth: 680, alignSelf: "center" }}>{children}</View>
    </View>
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
  const dir = useTextDir(children);
  return (
    <Text selectable={selectable} numberOfLines={numberOfLines} onPress={onPress} style={[font[variant], { color: c[tone] }, dir, style]}>
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
  // A card given its own colour (e.g. the accent "next step" card) is solid, not glass.
  const solid = !!StyleSheet.flatten(style)?.backgroundColor;
  const fill = solid ? null : <GlassFill />;
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [s.card, style, pressed && s.pressed]}
      >
        {fill}
        {children}
      </Pressable>
    );
  }
  return <View style={[s.card, style]}>{fill}{children}</View>;
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
  const dir = useTextDir(title);
  const flip = useIconFlip(icon);
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
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={small ? 17 : 20} color={fg} style={flip} /> : null}
      <Text style={[s.buttonText, small && { fontSize: 15 }, { color: fg }, dir]}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({
  icon, onPress, label, color,
}: { icon: IconName; onPress: () => void; label: string; color?: string }) {
  const c = useColors();
  const flip = useIconFlip(icon);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={12}
      style={({ pressed }) => [{ padding: 4 }, pressed && { opacity: 0.6 }]}>
      <Ionicons name={icon} size={24} color={color ?? c.accent} style={flip} />
    </Pressable>
  );
}

/** A round glass button, for actions floating over content (e.g. search on Today). */
export function GlassIconButton({ icon, onPress, label }: { icon: IconName; onPress: () => void; label: string }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        tap();
        onPress();
      }}
      hitSlop={8}
      style={({ pressed }) => [
        glassSurface(c, 22),
        { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
        pressed && { opacity: 0.75, transform: [{ scale: 0.94 }] },
      ]}
    >
      <GlassFill round={22} />
      <Ionicons name={icon} size={20} color={c.ink} />
    </Pressable>
  );
}

export function Field({
  label, hint, error, ltr, ...props
}: TextInputProps & {
  label: string;
  hint?: string;
  error?: string | null;
  /** Keep typed text left-to-right whatever the UI language (emails, passwords, German text). */
  ltr?: boolean;
}) {
  const s = useStyles();
  const dir = useInputDir();
  const ltrText = useLtrText();
  return (
    <View style={{ gap: space(1.5) }}>
      <Txt variant="small" tone="muted" style={{ fontWeight: "600", marginStart: space(1) }}>{label}</Txt>
      <TextInput
        placeholderTextColor={s.c.faint}
        accessibilityLabel={label}
        {...props}
        style={[s.input, props.multiline && s.multiline, error && s.inputError, ltr ? ltrText : dir, props.style]}
      />
      {error ? <Txt variant="small" tone="danger" style={{ marginStart: space(1) }}>{error}</Txt> : hint ? <View style={{ marginStart: space(1) }}><Muted>{hint}</Muted></View> : null}
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
  const dir = useTextDir(label);
  const p = toneColors(s.c, tone);
  return (
    <View style={[s.badge, { backgroundColor: p.bg }]}>
      {icon && <Ionicons name={icon} size={13} color={p.fg} />}
      <Text style={[s.badgeText, { color: p.fg }, dir]}>{label}</Text>
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
  const dir = useTextDir(label);
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
      <Text style={[s.chipText, selected && { color: s.c.accentInk }, dir]}>{label}</Text>
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
      <GlassFill />
      <View style={s.groupClip}>
        {items.map((child, i) => (
          <View key={i}>
            {i > 0 && <View style={s.divider} />}
            {child}
          </View>
        ))}
      </View>
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
  const flip = useIconFlip("chevron-forward");
  const body = (
    <>
      {icon && (
        <View style={[s.rowIcon, { backgroundColor: destructive ? s.c.danger : tone === "neutral" ? s.c.faint : toneColors(s.c, tone).fg }]}>
          <Ionicons name={icon} size={18} color="#FFFFFF" />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Txt tone={destructive ? "danger" : "ink"}>{title}</Txt>
        {subtitle ? <Muted>{subtitle}</Muted> : null}
      </View>
      {right}
      {chevron && <Ionicons name="chevron-forward" size={17} color={s.c.faint} style={[{ opacity: 0.7 }, flip]} />}
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
          {...Platform.OS === "ios" ? null : { trackColor: { true: c.accent, false: c.line }, thumbColor: "#FFFFFF" }}
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
  const direction = useDirection();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[s.sheetBackdrop, direction]} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={[s.sheet, { paddingBottom: insets.bottom + space(4) }]} onPress={() => {}}>
          <GlassFill round={radius.lg} material="thick" />
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
  const dir = useTextDir(value);
  const p = toneColors(s.c, tone);
  return (
    <View style={[s.card, { flex: 1, minWidth: 96, gap: 2 }]}>
      <GlassFill />
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[font.title, { fontSize: 28, lineHeight: 34, color: tone === "neutral" ? s.c.ink : p.fg, fontVariant: ["tabular-nums"] }, dir]}
      >
        {value}
      </Text>
      <Muted numberOfLines={2}>{label}</Muted>
    </View>
  );
}
