import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Badge, Button, Card, DemoBanner, DueBadge, ErrorBox, IconCircle, Loading, Muted, Screen, Section,
} from "@/components/ui";
import { categoryIcon } from "@/lib/categories";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { colors, space, type } from "@/lib/theme";

export default function Home() {
  const { t } = useTranslation();
  const { profile } = useSession();
  const insets = useSafeAreaInsets();
  const { data, error, loading, reload } = useLoad(async () => {
    const [cases, tasks] = await Promise.all([api.listCases(), api.listTasks({ openOnly: true })]);
    return { cases, tasks };
  });

  const caseTitle = (id: string) => data?.cases.find((c) => c.id === id)?.title ?? "";
  const upcoming = (data?.tasks ?? []).filter((task) => task.due_date).slice(0, 4);

  return (
    <Screen>
      <View style={{ paddingTop: insets.top + space(2), flexDirection: "row", alignItems: "center", gap: space(3) }}>
        <View style={{ flex: 1, gap: space(1) }}>
          <Text style={[type.small, { color: colors.accent, fontWeight: "700" }]}>BüroKI</Text>
          <Text style={type.title}>
            {profile?.full_name ? t("home.hello", { name: profile.full_name }) : t("home.helloNoName")}
          </Text>
        </View>
        <Pressable accessibilityLabel={t("home.settings")} onPress={() => router.push("/settings")} hitSlop={12}>
          <Ionicons name="settings-outline" size={26} color={colors.ink} />
        </Pressable>
      </View>

      <DemoBanner />
      {error && <ErrorBox message={error} onRetry={reload} />}

      <Section title={t("home.upcoming")}>
        {loading && !data ? (
          <Loading />
        ) : upcoming.length ? (
          upcoming.map((task) => (
            <Card key={task.id} onPress={() => router.push(`/case/${task.case_id}`)}>
              <Text style={type.h3}>{task.title}</Text>
              <Muted>{caseTitle(task.case_id)}</Muted>
              <DueBadge date={task.due_date} />
            </Card>
          ))
        ) : (
          <Muted>{t("home.noDeadlines")}</Muted>
        )}
      </Section>

      <Section title={t("home.cases")}>
        {data?.cases.length === 0 && <Muted>{t("home.noCases")}</Muted>}
        {data?.cases.map((c) => {
          const open = data.tasks.filter((task) => task.case_id === c.id).length;
          return (
            <Card key={c.id} onPress={() => router.push(`/case/${c.id}`)} style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
              <IconCircle name={categoryIcon(c.category)} />
              <View style={{ flex: 1, gap: space(1) }}>
                <Text style={type.h3}>{c.title}</Text>
                <Muted>{c.authority ?? t(`category.${c.category}`)}</Muted>
                <View style={{ flexDirection: "row", gap: space(2), flexWrap: "wrap" }}>
                  <Badge label={t(`status.${c.status}`)} tone={c.status === "closed" ? "neutral" : "accent"} />
                  {open > 0 && <Badge label={`${open} ${t("case.tasks")}`} tone="warn" icon="checkbox-outline" />}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </Card>
          );
        })}
        <Button icon="add" title={t("home.newCase")} onPress={() => router.push("/case/new")} />
      </Section>
    </Screen>
  );
}
