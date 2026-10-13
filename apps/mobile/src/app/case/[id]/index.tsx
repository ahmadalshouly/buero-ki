import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import {
  Badge, Button, Card, Chip, DemoBanner, DueBadge, ErrorBox, IconCircle, Loading, Muted, Screen, Section,
} from "@/components/ui";
import { api } from "@/lib/api";
import { categoryIcon } from "@/lib/categories";
import { useLoad } from "@/lib/hooks";
import { formatDate } from "@/lib/i18n";
import { choosePdf, choosePhoto, PermissionDenied, takePhoto } from "@/lib/pick";
import { colors, space, type } from "@/lib/theme";
import type { PickedFile, Task } from "@/lib/types";

type Tab = "letters" | "tasks" | "drafts";

export default function CaseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("letters");
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { data, error, loading, reload, setData } = useLoad(async () => {
    const [c, documents, tasks, drafts] = await Promise.all([
      api.getCase(id), api.listDocuments(id), api.listTasks({ caseId: id }), api.listDrafts(id),
    ]);
    return { c, documents, tasks, drafts };
  }, [id]);

  async function addLetter(pick: () => Promise<PickedFile | null>) {
    setUploadError(null);
    let file: PickedFile | null;
    try {
      file = await pick();
    } catch (e) {
      setUploadError(e instanceof PermissionDenied ? t("case.cameraDenied") : String(e));
      return;
    }
    if (!file) return;
    setAdding(false);
    setUploading(true);
    setTab("letters");
    try {
      const doc = await api.addDocument(id, file);
      await reload();
      router.push(`/document/${doc.id}`);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : String(e));
      await reload();
    } finally {
      setUploading(false);
    }
  }

  async function toggleTask(task: Task) {
    if (!data) return;
    setData({ ...data, tasks: data.tasks.map((x) => (x.id === task.id ? { ...x, done: !x.done } : x)) });
    await api.setTaskDone(task.id, !task.done).catch(reload);
  }

  async function toggleClosed() {
    if (!data) return;
    await api.setCaseStatus(id, data.c.status === "closed" ? "open" : "closed");
    reload();
  }

  if (!data) {
    return (
      <Screen>
        {loading ? <Loading /> : <ErrorBox message={error ?? ""} onRetry={reload} />}
      </Screen>
    );
  }

  const { c, documents, tasks, drafts } = data;
  const next = tasks.find((x) => !x.done);

  return (
    <Screen>
      <Stack.Screen options={{ title: c.title }} />
      <DemoBanner />

      <View style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
        <IconCircle name={categoryIcon(c.category)} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={type.h2}>{c.title}</Text>
          <Muted>{[c.authority ?? t(`category.${c.category}`), c.reference_number].filter(Boolean).join(" · ")}</Muted>
        </View>
        <Badge label={t(`status.${c.status}`)} tone={c.status === "closed" ? "neutral" : "accent"} />
      </View>

      <Card style={{ backgroundColor: colors.accent, borderColor: colors.accent }}>
        <Text style={[type.small, { color: colors.accentSoft, fontWeight: "700" }]}>{t("case.nextStep")}</Text>
        <Text style={[type.h2, { color: colors.accentInk }]}>{next ? next.title : t("case.nothingNext")}</Text>
        {next?.due_date && (
          <Text style={[type.body, { color: colors.accentSoft }]}>{t("due.on", { date: formatDate(next.due_date) })}</Text>
        )}
      </Card>

      <View style={{ flexDirection: "row", gap: space(2) }}>
        <Button style={{ flex: 1 }} icon="document-attach-outline" title={t("case.addLetter")} onPress={() => setAdding(!adding)} />
        <Button style={{ flex: 1 }} variant="secondary" icon="chatbubbles-outline" title={t("case.ask")} onPress={() => router.push(`/case/${id}/chat`)} />
      </View>
      {adding && (
        <Card>
          <Button variant="secondary" icon="camera-outline" title={t("case.takePhoto")} onPress={() => addLetter(takePhoto)} />
          <Button variant="secondary" icon="images-outline" title={t("case.choosePhoto")} onPress={() => addLetter(choosePhoto)} />
          <Button variant="secondary" icon="document-outline" title={t("case.choosePdf")} onPress={() => addLetter(choosePdf)} />
        </Card>
      )}
      <Button variant="secondary" icon="create-outline" title={t("case.draft")} onPress={() => router.push(`/case/${id}/draft`)} />

      {uploading && (
        <Card style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
          <ActivityIndicator color={colors.accent} />
          <Text style={[type.body, { flex: 1 }]}>{t("case.reading")}</Text>
        </Card>
      )}
      {uploadError && <ErrorBox message={uploadError} />}

      {c.summary && (
        <Section title={t("case.summary")}>
          <Text style={type.body}>{c.summary}</Text>
        </Section>
      )}

      <View style={{ flexDirection: "row", gap: space(2) }}>
        <Chip label={`${t("case.letters")} (${documents.length})`} selected={tab === "letters"} onPress={() => setTab("letters")} />
        <Chip label={`${t("case.tasks")} (${tasks.filter((x) => !x.done).length})`} selected={tab === "tasks"} onPress={() => setTab("tasks")} />
        <Chip label={`${t("case.drafts")} (${drafts.length})`} selected={tab === "drafts"} onPress={() => setTab("drafts")} />
      </View>

      {tab === "letters" && (
        documents.length === 0 ? <Muted>{t("case.noLetters")}</Muted> : documents.map((d) => (
          <Card key={d.id} onPress={() => router.push(`/document/${d.id}`)}>
            <View style={{ flexDirection: "row", gap: space(2), alignItems: "center" }}>
              <Text style={[type.h3, { flex: 1 }]}>{d.title_de ?? d.file_name ?? t("document.title")}</Text>
              {d.urgency && d.status === "ready" && (
                <Badge
                  label={t(`document.urgency_${d.urgency}`)}
                  tone={d.urgency === "high" ? "danger" : d.urgency === "medium" ? "warn" : "neutral"}
                />
              )}
            </View>
            <Muted>{[d.sender, formatDate(d.document_date ?? d.created_at)].filter(Boolean).join(" · ")}</Muted>
            {d.status === "ready" && d.summary && <Text style={type.body} numberOfLines={3}>{d.summary}</Text>}
            {d.status === "failed" && <Text style={[type.body, { color: colors.danger }]}>{t("case.failed")}</Text>}
            {(d.status === "analyzing" || d.status === "uploaded") && <Muted>{t("case.reading")}</Muted>}
          </Card>
        ))
      )}

      {tab === "tasks" && (
        tasks.length === 0 ? <Muted>{t("case.noTasks")}</Muted> : tasks.map((task) => (
          <Card key={task.id} style={{ flexDirection: "row", gap: space(3), alignItems: "center" }}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: task.done }}
              onPress={() => toggleTask(task)}
              hitSlop={10}
            >
              <Ionicons name={task.done ? "checkmark-circle" : "ellipse-outline"} size={28} color={task.done ? colors.accent : colors.muted} />
            </Pressable>
            <View style={{ flex: 1, gap: space(1) }}>
              <Text style={[type.body, task.done && { textDecorationLine: "line-through", color: colors.muted }]}>{task.title}</Text>
              {!task.done && <DueBadge date={task.due_date} />}
            </View>
          </Card>
        ))
      )}

      {tab === "drafts" && (
        drafts.length === 0 ? <Muted>{t("case.noDrafts")}</Muted> : drafts.map((d) => (
          <Card key={d.id} onPress={() => router.push(`/draft/${d.id}`)}>
            <Text style={type.h3}>{d.subject}</Text>
            <View style={{ flexDirection: "row", gap: space(2) }}>
              <Badge label={d.kind === "email" ? t("draft.email") : t("draft.letter")} />
              {d.status === "sent" && <Badge tone="accent" icon="checkmark" label={t("draft.sent")} />}
            </View>
            <Muted>{formatDate(d.created_at)}</Muted>
          </Card>
        ))
      )}

      <Button variant="ghost" title={c.status === "closed" ? t("case.reopen") : t("case.close")} onPress={toggleClosed} />
    </Screen>
  );
}
