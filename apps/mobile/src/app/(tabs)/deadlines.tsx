import { router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { TASK_ROW_INSET, TaskRow } from "@/components/TaskRow";
import { Button, DemoBanner, EmptyState, ErrorBox, Group, Screen, Section, SkeletonList, Txt } from "@/components/ui";
import { bucketOf, type Bucket } from "@/lib/dates";
import { errorMessage, useCases, useTasks } from "@/lib/queries";
import { space } from "@/lib/theme";

const ORDER: Bucket[] = ["overdue", "today", "week", "later", "noDate"];

export default function Deadlines() {
  const { t } = useTranslation();
  const [showDone, setShowDone] = useState(false);
  const tasks = useTasks({});
  const cases = useCases();
  const caseTitle = (id: string) => cases.data?.find((x) => x.id === id)?.title;
  const closed = new Set((cases.data ?? []).filter((x) => x.status === "closed").map((x) => x.id));

  const open = (tasks.data ?? []).filter((x) => !x.done && !closed.has(x.case_id));
  const done = (tasks.data ?? [])
    .filter((x) => x.done)
    .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))
    .slice(0, 15);

  return (
    <Screen padTop refreshing={tasks.isRefetching} onRefresh={() => tasks.refetch()}>
      <Txt variant="title">{t("deadlines.title")}</Txt>
      <DemoBanner />
      {tasks.error && <ErrorBox message={errorMessage(tasks.error)} onRetry={() => tasks.refetch()} />}
      {tasks.isPending ? <SkeletonList /> : open.length === 0 ? (
        <EmptyState icon="checkmark-done-outline" title={t("deadlines.empty")} />
      ) : (
        ORDER.map((bucket) => {
          const items = open.filter((x) => bucketOf(x) === bucket);
          if (!items.length) return null;
          return (
            <Section key={bucket} title={`${t(`deadlines.${bucket}`)} (${items.length})`}>
              <Group inset={TASK_ROW_INSET}>
                {items.map((task) => (
                  <TaskRow key={task.id} task={task} caseTitle={caseTitle(task.case_id)} onOpen={() => router.push(`/case/${task.case_id}`)} />
                ))}
              </Group>
            </Section>
          );
        })
      )}
      {done.length > 0 && (
        <Button
          variant="ghost"
          icon={showDone ? "chevron-up" : "chevron-down"}
          title={showDone ? t("deadlines.hideDone") : t("deadlines.showDone")}
          onPress={() => setShowDone(!showDone)}
        />
      )}
      {showDone && (
        <Section title={t("deadlines.done")}>
          <Group inset={TASK_ROW_INSET}>
            {done.map((task) => <TaskRow key={task.id} task={task} caseTitle={caseTitle(task.case_id)} />)}
          </Group>
        </Section>
      )}
    </Screen>
  );
}
