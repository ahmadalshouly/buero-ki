import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Share, Text, View } from "react-native";
import { Badge, Button, Card, ErrorBox, Loading, Muted, Screen, Section } from "@/components/ui";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { colors, space, type } from "@/lib/theme";

export default function DraftScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const { data: draft, error, loading, reload, setData } = useLoad(() => api.getDraft(id), [id]);

  if (!draft) {
    return <Screen>{loading ? <Loading /> : <ErrorBox message={error ?? ""} onRetry={reload} />}</Screen>;
  }

  async function copy() {
    await Clipboard.setStringAsync(draft!.body_de);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function markSent() {
    setData({ ...draft!, status: "sent" });
    await api.setDraftStatus(id, "sent").catch(reload);
  }

  return (
    <Screen>
      <View style={{ gap: space(2) }}>
        <Text style={type.h2}>{draft.subject}</Text>
        {draft.status === "sent" && <Badge tone="accent" icon="checkmark" label={t("draft.sent")} />}
      </View>

      {draft.notes && (
        <Card style={{ backgroundColor: colors.warnSoft, borderColor: colors.warnSoft }}>
          <Text style={[type.h3, { color: colors.warn }]}>{t("draft.notes")}</Text>
          <Text style={type.body}>{draft.notes}</Text>
        </Card>
      )}

      <Section title={t("draft.german")}>
        <Card>
          <Text selectable style={[type.body, { writingDirection: "ltr", textAlign: "left" }]}>{draft.body_de}</Text>
        </Card>
      </Section>

      <View style={{ flexDirection: "row", gap: space(2) }}>
        <Button style={{ flex: 1 }} icon={copied ? "checkmark" : "copy-outline"} title={copied ? t("draft.copied") : t("draft.copy")} onPress={copy} />
        <Button
          style={{ flex: 1 }}
          variant="secondary"
          icon="share-outline"
          title={t("draft.share")}
          onPress={() => Share.share({ title: draft.subject, message: draft.body_de })}
        />
      </View>

      {draft.body_translation && (
        <Section title={t("draft.translation")}>
          <Card>
            <Text selectable style={type.body}>{draft.body_translation}</Text>
          </Card>
        </Section>
      )}

      {draft.status !== "sent" && (
        <Button variant="secondary" icon="paper-plane-outline" title={t("draft.markSent")} onPress={markSent} />
      )}
      <Muted>{t("draft.disclaimer")}</Muted>
    </Screen>
  );
}
