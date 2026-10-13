import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import type { ColorValue } from "react-native";
import { useTasks } from "@/lib/queries";
import { daysUntil } from "@/lib/i18n";
import { useColors } from "@/lib/theme";
import type { IconName } from "@/components/ui";

function icon(name: IconName, active: IconName) {
  return function TabIcon({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) {
    return <Ionicons name={focused ? active : name} size={size} color={color as string} />;
  };
}

export default function TabsLayout() {
  const { t } = useTranslation();
  const c = useColors();
  const { data: tasks } = useTasks({ openOnly: true });
  const urgent = (tasks ?? []).filter((x) => x.due_date && daysUntil(x.due_date) <= 3).length;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.line },
        tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t("tabs.today"), tabBarIcon: icon("sunny-outline", "sunny") }} />
      <Tabs.Screen name="cases" options={{ title: t("tabs.cases"), tabBarIcon: icon("folder-outline", "folder") }} />
      <Tabs.Screen
        name="deadlines"
        options={{
          title: t("tabs.deadlines"),
          tabBarIcon: icon("calendar-outline", "calendar"),
          tabBarBadge: urgent || undefined,
          tabBarBadgeStyle: { backgroundColor: c.danger, color: "#FFFFFF" },
        }}
      />
      <Tabs.Screen name="settings" options={{ title: t("tabs.settings"), tabBarIcon: icon("settings-outline", "settings") }} />
    </Tabs>
  );
}
