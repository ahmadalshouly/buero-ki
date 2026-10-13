import { router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import {
  Button, Card, DemoBanner, EmptyState, ErrorBox, IconButton, IconCircle, Muted, Screen, Section, Sheet,
  SkeletonList, StatTile, Txt,
} from "@/components/ui";
import { TaskRow } from "@/components/TaskRow";
import { categoryIcon } from "@/lib/categories";
import { daysUntil, formatDate } from "@/lib/i18n";
import { errorMessage, useCases, useTasks } from "@/lib/queries";
import { useMe } from "@/lib/session";
import { space } from "@/lib/theme";

function greeting(hour: number): "morning" | "hello" | "evening" {
  if (hour < 11) return "morning";
  if (hour >= 18) return "evening";
  return "hello";
}

export default function Today() {
  const { t } = useTranslation();
  const { profile } = useMe();
  const cases = useCases();
  const tasks = useTasks({ openOnly: true });
  const [choosing, setChoosing] = useState(false);

  const all = tasks.data ?? [];
  const overdue = all.filter((x) => x.due_date && daysUntil(x.due_date) < 0);
  const week = all.filter((x) => x.due_date && daysUntil(x.due_date) >= 0 && daysUntil(x.due_date) <= 7);
  const attention = overdue.length + week.length;
  const activeCases = (cases.data ?? []).filter((x) => x.status !== "closed");
  const caseTitle = (id: string) => cases.data?.find((x) => x.id === id)?.title;
  const upcoming = [...overdue, ...week, ...all.filter((x) => x.due_date && daysUntil(x.due_date) > 7)].slice(0, 5);

  const name = profile?.full_name?.split(" ")[0];
  const g = greeting(new Date().getHours());
  const hello = name ? t(`home.${g}`, { name }) : t("home.helloNoName");

  const refreshing = cases.isRefetching || tasks.isRefetching;
  const refresh = () => {
    cases.refetch();
    tasks.refetch();
  };

  function addLetter() {
    if (activeCases.length === 1) router.push(`/case/${activeCases[0].id}/scan`);
    else if (activeCases.length === 0) router.push("/case/new");
    else setChoosing(true);
  }

  return (
    <Screen padTop refreshing={refreshing} onRefresh={refresh}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
        <View style={{ flex: 1, gap: space(1) }}>
          <Txt variant="label" tone="accent">BüroKI</Txt>
          <Txt variant="title">{hello}</Txt>
        </View>
        <IconButton icon="search" label={t("home.search")} onPress={() => router.push("/search")} />
      </View>

      <DemoBanner />
      {(cases.error || tasks.error) && <ErrorBox message={errorMessage(cases.error ?? tasks.error)} onRetry={refresh} />}

      <Txt tone="muted">
        {attention ? t("home.summaryCount", { count: attention }) : t("home.summaryNone")}
      </Txt>
      <View style={{ flexDirection: "row", gap: space(3), flexWrap: "wrap" }}>
        <StatTile label={t("home.overdue")} value={String(overdue.length)} tone={overdue.length ? "danger" : "neutral"} />
        <StatTile label={t("home.thisWeek")} value={String(week.length)} tone={week.length ? "warn" : "neutral"} />
        <StatTile label={t("home.openCases")} value={String(activeCases.length)} tone="accent" />
      </View>

      <View style={{ flexDirection: "row", gap: space(2) }}>
        <Button style={{ flex: 1 }} icon="camera-outline" title={t("home.addLetter")} onPress={addLetter} />
        <Button style={{ flex: 1 }} variant="secondary" icon="add" title={t("home.newCase")} onPress={() => router.push("/case/new")} />
      </View>

      <Section
        title={t("home.upcoming")}
        action={all.length > 0 ? <Button small variant="ghost" title={t("home.seeAll")} onPress={() => router.push("/deadlines")} /> : undefined}
      >
        {tasks.isPending ? <SkeletonList rows={2} /> : upcoming.length ? (
          upcoming.map((task) => (
            <TaskRow key={task.id} task={task} caseTitle={caseTitle(task.case_id)} onOpen={() => router.push(`/case/${task.case_id}`)} />
          ))
        ) : (
          <Muted>{t("home.noDeadlines")}</Muted>
        )}
      </Section>

      <Section
        title={t("home.recent")}
        action={activeCases.length > 3 ? <Button small variant="ghost" title={t("home.seeAll")} onPress={() => router.push("/cases")} /> : undefined}
      >
        {cases.isPending ? <SkeletonList rows={2} /> : activeCases.length === 0 ? (
          <EmptyState icon="folder-open-outline" title={t("home.noCases")} />
        ) : (
          activeCases.slice(0, 3).map((x) => (
            <Card key={x.id} onPress={() => router.push(`/case/${x.id}`)} style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
              <IconCircle name={categoryIcon(x.category)} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="h3">{x.title}</Txt>
                <Muted numberOfLines={2}>{x.summary ?? x.authority ?? t(`category.${x.category}`)}</Muted>
                <Txt variant="small" tone="faint">{t("cases.updated", { date: formatDate(x.updated_at) })}</Txt>
              </View>
            </Card>
          ))
        )}
      </Section>

      <Sheet visible={choosing} onClose={() => setChoosing(false)} title={t("home.chooseCase")}>
        {activeCases.map((x) => (
          <Card
            key={x.id}
            onPress={() => {
              setChoosing(false);
              router.push(`/case/${x.id}/scan`);
            }}
            style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}
          >
            <IconCircle name={categoryIcon(x.category)} size={34} />
            <Txt variant="h3" style={{ flex: 1 }}>{x.title}</Txt>
          </Card>
        ))}
      </Sheet>
    </Screen>
  );
}
