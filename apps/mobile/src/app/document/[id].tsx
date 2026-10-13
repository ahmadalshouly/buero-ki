import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking, Text, View } from "react-native";
import { Markdown } from "@/components/Markdown";
import { Badge, Button, Card, DueBadge, ErrorBox, Loading, Muted, Screen, Section } from "@/components/ui";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { formatDate } from "@/lib/i18n";
import { colors, space, type } from "@/lib/theme";

export default function DocumentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const [retrying, setRetrying] = useState(false);
  const { data: doc, error, loading, reload } = useLoad(() => api.getDocument(id), [id]);

  async function retry() {
    setRetrying(true);
    try {
      await api.retryDocument(id);
    } catch {
      // The failure is stored on the document and shown after reload.
    }
    await reload();
    setRetrying(false);
  }

  async function openOriginal() {
    if (!doc) return;
    const url = await api.getDocumentUrl(doc);
    if (url) Linking.openURL(url);
  }

  if (!doc) {
    return <Screen>{loading ? <Loading /> : <ErrorBox message={error ?? ""} onRetry={reload} />}</Screen>;
  }

  const a = doc.analysis;
  return (
    <Screen>
      <View style={{ gap: space(2) }}>
        <Text style={type.title}>{doc.title_de ?? doc.file_name}</Text>
        <Muted>
          {[doc.sender && `${t("document.from")}: ${doc.sender}`, doc.document_date && `${t("document.date")}: ${formatDate(doc.document_date)}`]
            .filter(Boolean)
            .join(" · ")}
        </Muted>
        {doc.urgency && (
          <Badge
            label={t(`document.urgency_${doc.urgency}`)}
            tone={doc.urgency === "high" ? "danger" : doc.urgency === "medium" ? "warn" : "neutral"}
          />
        )}
      </View>

      {doc.status === "failed" && (
        <>
          <ErrorBox message={doc.error ?? t("case.failed")} />
          <Button title={t("common.retry")} onPress={retry} loading={retrying} />
        </>
      )}
      {(doc.status === "analyzing" || doc.status === "uploaded") && <Muted>{t("case.reading")}</Muted>}

      {a && (
        <>
          {!a.readable && <ErrorBox message={t("document.unreadable")} />}
          <Card style={{ backgroundColor: colors.accentSoft, borderColor: colors.accentSoft }}>
            <Text style={[type.body, { fontWeight: "600" }]}>{a.summary}</Text>
          </Card>

          {a.actions.length > 0 && (
            <Section title={t("document.todo")}>
              {a.actions.map((action, i) => (
                <Card key={i} style={{ flexDirection: "row", gap: space(3) }}>
                  <Ionicons name="arrow-forward-circle" size={24} color={colors.accent} />
                  <View style={{ flex: 1, gap: space(1) }}>
                    <Text style={type.body}>{action.title}</Text>
                    <DueBadge date={action.due_date} />
                    {action.how_due_date_was_found && <Muted>{action.how_due_date_was_found}</Muted>}
                  </View>
                </Card>
              ))}
            </Section>
          )}

          {a.needs_advice && (
            <Card style={{ backgroundColor: colors.warnSoft, borderColor: colors.warnSoft }}>
              <View style={{ flexDirection: "row", gap: space(2), alignItems: "center" }}>
                <Ionicons name="people" size={20} color={colors.warn} />
                <Text style={[type.h3, { color: colors.warn }]}>{t("document.advice")}</Text>
              </View>
              <Text style={type.body}>{a.advice_reason ?? t("document.adviceText")}</Text>
            </Card>
          )}

          <Section title={t("document.explanation")}>
            <Markdown text={a.explanation} />
          </Section>

          {a.key_terms.length > 0 && (
            <Section title={t("document.terms")}>
              <Card>
                {a.key_terms.map((term, i) => (
                  <View key={i} style={{ gap: 2, paddingVertical: space(1.5) }}>
                    <Text style={[type.h3, { color: colors.accent }]}>{term.term_de}</Text>
                    <Text style={type.body}>{term.meaning}</Text>
                  </View>
                ))}
              </Card>
            </Section>
          )}

          <Button
            icon="create-outline"
            title={t("document.reply")}
            onPress={() => router.push({ pathname: "/case/[id]/draft", params: { id: doc.case_id, documentId: doc.id } })}
          />
        </>
      )}

      {doc.storage_path ? (
        <Button variant="ghost" icon="open-outline" title={t("document.original")} onPress={openOriginal} />
      ) : null}
    </Screen>
  );
}
