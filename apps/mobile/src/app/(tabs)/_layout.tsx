import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useTranslation } from "react-i18next";
import { Platform, StyleSheet, type ColorValue } from "react-native";
import type { SFSymbol } from "sf-symbols-typescript";
import { GlassFill } from "@/components/glass";
import { useRtl } from "@/lib/direction";
import { scriptFont } from "@/lib/fonts";
import { useTasks } from "@/lib/queries";
import { daysUntil } from "@/lib/i18n";
import { useColors } from "@/lib/theme";
import type { IconName } from "@/components/ui";

const TABS: { name: string; label: string; sf: [SFSymbol, SFSymbol]; ion: [IconName, IconName] }[] = [
  { name: "index", label: "tabs.today", sf: ["sun.max", "sun.max.fill"], ion: ["sunny-outline", "sunny"] },
  { name: "cases", label: "tabs.cases", sf: ["folder", "folder.fill"], ion: ["folder-outline", "folder"] },
  { name: "deadlines", label: "tabs.deadlines", sf: ["calendar", "calendar"], ion: ["calendar-outline", "calendar"] },
  { name: "help", label: "tabs.help", sf: ["lifepreserver", "lifepreserver.fill"], ion: ["help-buoy-outline", "help-buoy"] },
  { name: "settings", label: "tabs.settings", sf: ["gearshape", "gearshape.fill"], ion: ["settings-outline", "settings"] },
];

function useUrgent() {
  const { data: tasks } = useTasks({ openOnly: true });
  return (tasks ?? []).filter((x) => x.due_date && daysUntil(x.due_date) <= 3).length;
}

/**
 * The system tab bar: Liquid Glass on iOS 26, a translucent material bar on
 * earlier iOS, and the Material bar on Android.
 */
function NativeTabBar() {
  const { t } = useTranslation();
  const c = useColors();
  const rtl = useRtl();
  const urgent = useUrgent();
  const labelFont = scriptFont(rtl, { fontWeight: "500" })?.fontFamily;
  return (
    <NativeTabs
      labelStyle={labelFont ? { fontFamily: labelFont } : undefined}
      tintColor={c.accent}
      badgeBackgroundColor={c.danger}
      minimizeBehavior="onScrollDown"
      // The native tab bar ignores the JavaScript layout direction, so tell it directly.
      unstable_nativeProps={{ direction: rtl ? "rtl" : "ltr" }}
    >
      {TABS.map((tab) => (
        <NativeTabs.Trigger key={tab.name} name={tab.name} contentStyle={{ backgroundColor: c.bg }}>
          <NativeTabs.Trigger.Label>{t(tab.label)}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf={{ default: tab.sf[0], selected: tab.sf[1] }}
            src={{
              default: <NativeTabs.Trigger.VectorIcon family={Ionicons} name={tab.ion[0]} />,
              selected: <NativeTabs.Trigger.VectorIcon family={Ionicons} name={tab.ion[1]} />,
            }}
          />
          {tab.name === "deadlines" && urgent > 0 && <NativeTabs.Trigger.Badge>{String(urgent)}</NativeTabs.Trigger.Badge>}
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}

function icon(name: IconName, active: IconName) {
  return function TabIcon({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) {
    return <Ionicons name={focused ? active : name} size={size} color={color as string} />;
  };
}

/** Web keeps the JavaScript tab bar, drawn as frosted glass. */
function WebTabBar() {
  const { t } = useTranslation();
  const c = useColors();
  const urgent = useUrgent();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.faint,
        tabBarStyle: { position: "absolute", backgroundColor: "transparent", borderTopColor: c.line, borderTopWidth: StyleSheet.hairlineWidth },
        tabBarBackground: () => <GlassFill round={0} material="chrome" />,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "500" },
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(tab.label),
            tabBarIcon: icon(tab.ion[0], tab.ion[1]),
            ...(tab.name === "deadlines"
              ? { tabBarBadge: urgent || undefined, tabBarBadgeStyle: { backgroundColor: c.danger, color: "#FFFFFF" } }
              : null),
          }}
        />
      ))}
    </Tabs>
  );
}

export default function TabsLayout() {
  return Platform.OS === "web" ? <WebTabBar /> : <NativeTabBar />;
}
