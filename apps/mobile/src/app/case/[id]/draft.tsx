import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { Button, Chip, ErrorBox, Field, Muted, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { space, type } from "@/lib/theme";

export default function NewDraft() {
  const { id, documentId } = useLocalSearchParams<{ id: string; documentId?: string }>();
  const { t } = useTranslation();
  const [kind, setKind] = useState<"letter" | "email">("letter");
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const draft = await api.createDraft({ caseId: id, documentId: documentId ?? null, kind, instructions: instructions.trim() });
      router.replace(`/draft/${draft.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={{ gap: space(2) }}>
        <Text style={type.h3}>{t("draft.kind")}</Text>
        <View style={{ flexDirection: "row", gap: space(2) }}>
          <Chip label={t("draft.letter")} selected={kind === "letter"} onPress={() => setKind("letter")} />
          <Chip label={t("draft.email")} selected={kind === "email"} onPress={() => setKind("email")} />
        </View>
      </View>
      <Field
        label={t("draft.instructions")}
        value={instructions}
        onChangeText={setInstructions}
        placeholder={t("draft.instructionsPlaceholder")}
        multiline
        autoFocus
      />
      {error && <ErrorBox message={error} />}
      <Button icon="sparkles-outline" title={busy ? t("draft.generating") : t("draft.generate")} onPress={generate} loading={busy} disabled={!instructions.trim()} />
      <Muted>{t("draft.disclaimer")}</Muted>
    </Screen>
  );
}
