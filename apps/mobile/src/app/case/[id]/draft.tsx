import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, View } from "react-native";
import { Button, Chip, DemoBanner, ErrorBox, Field, Muted, Screen, Segmented, Txt } from "@/components/ui";
import { friendlyError } from "@/lib/errorText";
import { useCreateDraft, useDocuments, useDraft, useLearnFacts } from "@/lib/queries";
import { useMe } from "@/lib/session";
import { space, useColors } from "@/lib/theme";

export default function NewDraft() {
  const { id, documentId, revise } = useLocalSearchParams<{ id: string; documentId?: string; revise?: string }>();
  const { t } = useTranslation();
  const c = useColors();
  const previous = useDraft(revise ?? "");
  const documents = useDocuments(id);
  const [kind, setKind] = useState<"letter" | "email">("letter");
  const [docId, setDocId] = useState<string | null>(documentId ?? null);
  const [instructions, setInstructions] = useState("");
  const create = useCreateDraft(id);
  const learn = useLearnFacts(id, "draft");
  const { profile } = useMe();
  const revising = !!revise;
  const ready = (documents.data ?? []).filter((d) => d.status === "ready");

  const suggestions = [
    t("draft.suggestSendDocs"),
    t("draft.suggestMoreTime"),
    t("draft.suggestObjection"),
    t("draft.suggestAppointment"),
  ];

  function generate() {
    create.mutate({
      documentId: revising ? previous.data?.document_id ?? null : docId,
      kind: revising ? previous.data?.kind ?? kind : kind,
      instructions: instructions.trim(),
      reviseDraftId: revise ?? null,
    }, { onSuccess: (draft) => router.replace(`/draft/${draft.id}`) });
    // What the person explains about themselves here is offered to remember on the case screen.
    if (profile?.memory_enabled !== false && !suggestions.includes(instructions.trim())) learn.mutate(instructions.trim());
  }

  if (create.isPending) {
    return (
      <Screen scroll={false}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: space(4), padding: space(6) }}>
          <ActivityIndicator size="large" color={c.accent} />
          <Txt variant="h2" style={{ textAlign: "center" }}>{t("draft.generating")}</Txt>
          <Txt variant="small" tone="muted" style={{ textAlign: "center" }}>{t("draft.generatingHint")}</Txt>
          <Button variant="ghost" title={t("common.close")} onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      {revising && <Stack.Screen options={{ title: t("draft.reviseTitle") }} />}
      <DemoBanner />
      {!revising && (
        <>
          <View style={{ gap: space(2) }}>
            <Txt variant="h3">{t("draft.kind")}</Txt>
            <Segmented
              value={kind}
              onChange={setKind}
              options={[{ value: "letter", label: t("draft.letter") }, { value: "email", label: t("draft.email") }]}
            />
          </View>
          {ready.length > 0 && (
            <View style={{ gap: space(2) }}>
              <Txt variant="h3">{t("draft.replyingTo")}</Txt>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }}>
                <Chip label={t("draft.noLetter")} selected={!docId} onPress={() => setDocId(null)} />
                {ready.slice(0, 6).map((d) => (
                  <Chip key={d.id} label={d.title_de ?? d.file_name ?? t("document.title")} selected={docId === d.id} onPress={() => setDocId(d.id)} />
                ))}
              </View>
            </View>
          )}
        </>
      )}
      {revising && previous.data && <Muted>{previous.data.subject}</Muted>}
      <Field
        label={revising ? t("draft.reviseInstructions") : t("draft.instructions")}
        value={instructions}
        onChangeText={setInstructions}
        placeholder={revising ? t("draft.revisePlaceholder") : t("draft.instructionsPlaceholder")}
        multiline
        autoFocus
        maxLength={4000}
      />
      {!revising && (
        <View style={{ gap: space(2) }}>
          <Txt variant="small" tone="muted">{t("draft.suggestions")}</Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }}>
            {suggestions.map((s) => <Chip key={s} label={s} selected={instructions === s} onPress={() => setInstructions(s)} />)}
          </View>
        </View>
      )}
      {create.error && <ErrorBox message={friendlyError(create.error, t)} />}
      <Button icon="sparkles-outline" title={t("draft.generate")} onPress={generate} disabled={!instructions.trim()} />
      <Muted>{t("draft.disclaimer")}</Muted>
    </Screen>
  );
}
