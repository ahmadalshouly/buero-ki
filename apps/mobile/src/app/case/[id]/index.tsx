import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, View } from "react-native";
import { useFeedback } from "@/components/feedback";
import { TaskRow } from "@/components/TaskRow";
import {
  Badge, Button, Card, DemoBanner, EmptyState, ErrorBox, IconButton, IconCircle, type IconName, Muted, Screen, Section,
  Segmented, Sheet, SkeletonList, Txt,
} from "@/components/ui";
import { categoryIcon } from "@/lib/categories";
import { formatDate } from "@/lib/i18n";
import {
  errorMessage, useCase, useDeleteCase, useDeleteTask, useDocuments, useDrafts, useTasks, useTimeline, useUpdateCase,
} from "@/lib/queries";
import { space, useColors } from "@/lib/theme";
import type { CaseStatus, Task, TimelineItem } from "@/lib/types";

type Tab = "timeline" | "letters" | "tasks" | "drafts";

const TIMELINE: Record<TimelineItem["kind"], { icon: IconName; label: string }> = {
  document: { icon: "mail-open-outline", label: "case.timelineDocument" },
  draft: { icon: "create-outline", label: "case.timelineDraft" },
  sent: { icon: "paper-plane-outline", label: "case.timelineSent" },
  task_done: { icon: "checkmark-circle-outline", label: "case.timelineTask" },
};

export default function CaseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const c = useColors();
  const { toast, confirm } = useFeedback();
  const [tab, setTab] = useState<Tab>("timeline");
  const [menu, setMenu] = useState(false);

  const caseQ = useCase(id);
  const documents = useDocuments(id);
  const tasks = useTasks({ caseId: id });
  const drafts = useDrafts(id);
  const timeline = useTimeline(id);
  const update = useUpdateCase(id);
  const removeCase = useDeleteCase();
  const removeTask = useDeleteTask();

  const refreshing = caseQ.isRefetching || documents.isRefetching || tasks.isRefetching;
  const refresh = () => [caseQ, documents, tasks, drafts, timeline].forEach((q) => q.refetch());

  if (!caseQ.data) {
    return (
      <Screen>
        {caseQ.error ? <ErrorBox message={errorMessage(caseQ.error)} onRetry={() => caseQ.refetch()} /> : <SkeletonList rows={3} />}
      </Screen>
    );
  }

  const theCase = caseQ.data;
  const openTasks = (tasks.data ?? []).filter((x) => !x.done);
  const next = openTasks[0];
  const reading = (documents.data ?? []).some((d) => d.status === "analyzing" || d.status === "uploaded");
  const facts = Object.entries(theCase.facts ?? {});

  function setStatus(status: CaseStatus) {
    setMenu(false);
    update.mutate({ status }, { onSuccess: () => toast(t(`status.${status}`)) });
  }

  async function deleteCase() {
    setMenu(false);
    const yes = await confirm({ title: t("case.deleteCaseConfirm"), message: t("case.deleteCaseText"), confirm: t("common.delete"), destructive: true });
    if (!yes) return;
    removeCase.mutate(id, {
      onSuccess: () => {
        toast(t("case.deleted"));
        router.back();
      },
      onError: (e) => toast(errorMessage(e), "error"),
    });
  }

  async function deleteTask(task: Task) {
    const yes = await confirm({ title: t("case.deleteTask"), message: task.title, confirm: t("common.delete"), destructive: true });
    if (yes) removeTask.mutate(task);
  }

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen
        options={{
          title: theCase.title,
          headerRight: () => <IconButton icon="ellipsis-horizontal-circle" label={t("common.more")} onPress={() => setMenu(true)} color={c.accent} />,
        }}
      />
      <DemoBanner />

      <View style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
        <IconCircle name={categoryIcon(theCase.category)} size={48} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="h2">{theCase.title}</Txt>
          <Muted>{[theCase.authority ?? t(`category.${theCase.category}`), theCase.reference_number].filter(Boolean).join(" · ")}</Muted>
        </View>
        <Badge label={t(`status.${theCase.status}`)} tone={theCase.status === "closed" ? "neutral" : theCase.status === "waiting" ? "warn" : "accent"} />
      </View>

      <Card style={{ backgroundColor: c.accent, borderColor: c.accent }}>
        <Txt variant="label" tone="accentInk" style={{ opacity: 0.8 }}>{t("case.nextStep")}</Txt>
        <Txt variant="h2" tone="accentInk">{next ? next.title : t("case.nothingNext")}</Txt>
        {next?.due_date && <Txt tone="accentInk" style={{ opacity: 0.85 }}>{t("due.on", { date: formatDate(next.due_date) })}</Txt>}
      </Card>

      <View style={{ flexDirection: "row", gap: space(2) }}>
        <Button style={{ flex: 1 }} icon="camera-outline" title={t("case.addLetter")} onPress={() => router.push(`/case/${id}/scan`)} />
        <Button style={{ flex: 1 }} variant="secondary" icon="chatbubbles-outline" title={t("case.ask")} onPress={() => router.push(`/case/${id}/chat`)} />
      </View>
      <Button variant="secondary" icon="create-outline" title={t("case.draft")} onPress={() => router.push(`/case/${id}/draft`)} />

      {reading && (
        <Card style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
          <ActivityIndicator color={c.accent} />
          <Txt style={{ flex: 1 }}>{t("case.reading")}</Txt>
        </Card>
      )}

      {theCase.summary && (
        <Section title={t("case.summary")}>
          <Txt>{theCase.summary}</Txt>
          {facts.length > 0 && (
            <Card style={{ gap: space(1.5) }}>
              <Txt variant="label" tone="muted">{t("case.facts")}</Txt>
              {facts.map(([k, v]) => (
                <View key={k} style={{ flexDirection: "row", gap: space(2) }}>
                  <Txt variant="small" tone="muted" style={{ flex: 1 }}>{k.replace(/_/g, " ")}</Txt>
                  <Txt variant="small" style={{ flex: 2 }} selectable>{String(v)}</Txt>
                </View>
              ))}
            </Card>
          )}
        </Section>
      )}

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "timeline", label: t("case.timeline") },
          { value: "letters", label: `${t("case.letters")} ${documents.data?.length ?? ""}`.trim() },
          { value: "tasks", label: `${t("case.tasks")} ${openTasks.length || ""}`.trim() },
          { value: "drafts", label: `${t("case.drafts")} ${drafts.data?.length || ""}`.trim() },
        ]}
      />

      {tab === "timeline" && (
        timeline.isPending ? <SkeletonList rows={2} /> : !timeline.data?.length ? <EmptyState icon="time-outline" title={t("case.noTimeline")} /> : (
          <View>
            {timeline.data.map((item, i) => {
              const meta = TIMELINE[item.kind];
              const last = i === timeline.data!.length - 1;
              const open = item.kind === "document" ? () => router.push(`/document/${item.item_id}`)
                : item.kind === "draft" || item.kind === "sent" ? () => router.push(`/draft/${item.item_id}`) : undefined;
              return (
                <View key={`${item.kind}-${item.item_id}`} style={{ flexDirection: "row", gap: space(3) }}>
                  <View style={{ alignItems: "center", width: 32 }}>
                    <IconCircle name={meta.icon} size={32} tone={item.kind === "document" && item.tone === "high" ? "danger" : "accent"} />
                    {!last && <View style={{ flex: 1, width: 2, backgroundColor: c.line, marginVertical: 2 }} />}
                  </View>
                  <View style={{ flex: 1, paddingBottom: space(5), gap: 2 }}>
                    <Txt variant="small" tone="faint">{t(meta.label)} · {formatDate(item.at)}</Txt>
                    <Txt variant="h3" onPress={open}>{item.title ?? "—"}</Txt>
                    {item.kind === "document" && item.detail ? <Muted numberOfLines={2}>{item.detail}</Muted> : null}
                  </View>
                </View>
              );
            })}
          </View>
        )
      )}

      {tab === "letters" && (
        documents.isPending ? <SkeletonList rows={2} /> : !documents.data?.length ? (
          <EmptyState icon="mail-outline" title={t("case.noLetters")}
            action={<Button icon="camera-outline" title={t("case.addLetter")} onPress={() => router.push(`/case/${id}/scan`)} />} />
        ) : documents.data.map((d) => (
          <Card key={d.id} onPress={() => router.push(`/document/${d.id}`)}>
            <View style={{ flexDirection: "row", gap: space(2), alignItems: "center" }}>
              <Txt variant="h3" style={{ flex: 1 }}>{d.title_de ?? d.file_name ?? t("document.title")}</Txt>
              {d.urgency && d.status === "ready" && (
                <Badge label={t(`document.urgency_${d.urgency}`)} tone={d.urgency === "high" ? "danger" : d.urgency === "medium" ? "warn" : "neutral"} />
              )}
            </View>
            <Muted>{[d.sender, formatDate(d.document_date ?? d.created_at), d.page_count > 1 ? t("case.pages", { count: d.page_count }) : null].filter(Boolean).join(" · ")}</Muted>
            {d.status === "ready" && d.summary && <Txt numberOfLines={3}>{d.summary}</Txt>}
            {d.status === "failed" && (
              <View style={{ flexDirection: "row", gap: space(1.5), alignItems: "center" }}>
                <Ionicons name="alert-circle" size={16} color={c.danger} />
                <Txt tone="danger">{t("case.failed")}</Txt>
              </View>
            )}
            {(d.status === "analyzing" || d.status === "uploaded") && <Muted>{t("case.reading")}</Muted>}
          </Card>
        ))
      )}

      {tab === "tasks" && (
        <View style={{ gap: space(3) }}>
          {tasks.isPending ? <SkeletonList rows={2} /> : !tasks.data?.length ? <Muted>{t("case.noTasks")}</Muted> : (
            tasks.data.map((task) => <TaskRow key={task.id} task={task} onLongPress={() => deleteTask(task)} />)
          )}
          <Button variant="secondary" icon="add" title={t("case.addTask")} onPress={() => router.push(`/case/${id}/task`)} />
        </View>
      )}

      {tab === "drafts" && (
        drafts.isPending ? <SkeletonList rows={2} /> : !drafts.data?.length ? (
          <EmptyState icon="create-outline" title={t("case.noDrafts")}
            action={<Button icon="create-outline" title={t("case.draft")} onPress={() => router.push(`/case/${id}/draft`)} />} />
        ) : drafts.data.map((d) => (
          <Card key={d.id} onPress={() => router.push(`/draft/${d.id}`)}>
            <Txt variant="h3">{d.subject}</Txt>
            <View style={{ flexDirection: "row", gap: space(2), flexWrap: "wrap" }}>
              <Badge label={d.kind === "email" ? t("draft.email") : t("draft.letter")} />
              {d.status === "sent" && <Badge tone="accent" icon="checkmark" label={t("draft.sent")} />}
              {d.edited && <Badge label={t("draft.edited")} icon="pencil" />}
            </View>
            <Muted>{formatDate(d.created_at)}</Muted>
          </Card>
        ))
      )}

      <Sheet visible={menu} onClose={() => setMenu(false)} title={theCase.title}>
        <Button variant="secondary" icon="pencil" title={t("common.edit")} onPress={() => {
          setMenu(false);
          router.push(`/case/${id}/edit`);
        }} />
        {theCase.status !== "waiting" && theCase.status !== "closed" && (
          <Button variant="secondary" icon="hourglass-outline" title={t("case.markWaiting")} onPress={() => setStatus("waiting")} />
        )}
        {theCase.status === "closed" ? (
          <Button variant="secondary" icon="refresh" title={t("case.reopen")} onPress={() => setStatus("open")} />
        ) : (
          <Button variant="secondary" icon="archive-outline" title={t("case.close")} onPress={() => setStatus("closed")} />
        )}
        <Button variant="danger" icon="trash-outline" title={t("case.deleteCase")} onPress={deleteCase} loading={removeCase.isPending} />
      </Sheet>
    </Screen>
  );
}
