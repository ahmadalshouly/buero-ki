import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { TextInput, View } from "react-native";
import {
  Badge, Button, Card, DemoBanner, EmptyState, ErrorBox, IconCircle, Muted, Screen, Segmented, SkeletonList, Txt,
} from "@/components/ui";
import { categoryIcon } from "@/lib/categories";
import { formatDate } from "@/lib/i18n";
import { errorMessage, useCases, useTasks } from "@/lib/queries";
import { radius, space, useColors } from "@/lib/theme";

type Filter = "open" | "closed" | "all";

export default function Cases() {
  const { t } = useTranslation();
  const c = useColors();
  const cases = useCases();
  const tasks = useTasks({ openOnly: true });
  const [filter, setFilter] = useState<Filter>("open");
  const [q, setQ] = useState("");

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (cases.data ?? [])
      .filter((x) => filter === "all" || (filter === "closed" ? x.status === "closed" : x.status !== "closed"))
      .filter((x) => !term || [x.title, x.authority, x.reference_number].some((v) => v?.toLowerCase().includes(term)));
  }, [cases.data, filter, q]);

  return (
    <Screen padTop refreshing={cases.isRefetching} onRefresh={() => cases.refetch()}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Txt variant="title" style={{ flex: 1 }}>{t("cases.title")}</Txt>
        <Button small icon="add" title={t("home.newCase")} onPress={() => router.push("/case/new")} />
      </View>
      <DemoBanner />

      <View style={{
        flexDirection: "row", alignItems: "center", gap: space(2), backgroundColor: c.card,
        borderWidth: 1, borderColor: c.line, borderRadius: radius.sm, paddingHorizontal: space(3),
      }}>
        <Ionicons name="search" size={18} color={c.faint} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={t("search.placeholder")}
          placeholderTextColor={c.faint}
          accessibilityLabel={t("search.title")}
          style={{ flex: 1, paddingVertical: space(3), fontSize: 16, color: c.ink, outlineWidth: 0 }}
        />
      </View>
      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { value: "open", label: t("cases.filterOpen") },
          { value: "closed", label: t("cases.filterClosed") },
          { value: "all", label: t("cases.filterAll") },
        ]}
      />

      {cases.error && <ErrorBox message={errorMessage(cases.error)} onRetry={() => cases.refetch()} />}
      {cases.isPending ? <SkeletonList /> : list.length === 0 ? (
        <EmptyState
          icon="folder-open-outline"
          title={cases.data?.length ? t("cases.empty") : t("home.noCases")}
          action={!cases.data?.length ? <Button icon="add" title={t("home.newCase")} onPress={() => router.push("/case/new")} /> : undefined}
        />
      ) : (
        <View style={{ gap: space(3) }}>
          {list.map((x) => {
            const open = (tasks.data ?? []).filter((task) => task.case_id === x.id).length;
            return (
              <Card key={x.id} onPress={() => router.push(`/case/${x.id}`)} style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
                <IconCircle name={categoryIcon(x.category)} tone={x.status === "closed" ? "neutral" : "accent"} />
                <View style={{ flex: 1, gap: space(1) }}>
                  <Txt variant="h3">{x.title}</Txt>
                  <Muted numberOfLines={1}>{[x.authority ?? t(`category.${x.category}`), x.reference_number].filter(Boolean).join(" · ")}</Muted>
                  <View style={{ flexDirection: "row", gap: space(2), flexWrap: "wrap", alignItems: "center" }}>
                    <Badge label={t(`status.${x.status}`)} tone={x.status === "closed" ? "neutral" : x.status === "waiting" ? "warn" : "accent"} />
                    {open > 0 && <Badge label={t("cases.tasksOpen", { count: open })} icon="checkbox-outline" />}
                    <Txt variant="small" tone="faint">{formatDate(x.updated_at)}</Txt>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={c.faint} />
              </Card>
            );
          })}
        </View>
      )}
    </Screen>
  );
}
