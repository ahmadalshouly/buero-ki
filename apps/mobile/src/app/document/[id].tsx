import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Linking, Pressable, ScrollView, View } from "react-native";
import { useFeedback } from "@/components/feedback";
import { PendingFacts } from "@/components/FactSuggestions";
import { Markdown } from "@/components/Markdown";
import {
  Badge, Button, Card, DueBadge, ErrorBox, IconButton, Muted, Screen, Section, Sheet, SkeletonList, Txt,
} from "@/components/ui";
import { friendlyError } from "@/lib/errorText";
import { useIconFlip } from "@/lib/direction";
import { formatDate } from "@/lib/i18n";
import { helpForCategory } from "@/lib/help";
import { errorMessage, useAnswerOwner, useCase, useDeleteDocument, useDocument, usePageUrls, useRetryDocument } from "@/lib/queries";
import { isDemo } from "@/lib/supabase";
import { radius, space, useColors } from "@/lib/theme";

const euro = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

export default function DocumentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const c = useColors();
  const flip = useIconFlip("arrow-forward-circle");
  const { confirm, toast } = useFeedback();
  const query = useDocument(id);
  const doc = query.data;
  const [showPages, setShowPages] = useState(false);
  const [menu, setMenu] = useState(false);
  const pages = usePageUrls(id, showPages && !isDemo);
  const retry = useRetryDocument(doc?.case_id ?? "");
  const answer = useAnswerOwner(doc?.case_id ?? "");
  const theCase = useCase(doc?.case_id ?? "");
  const remove = useDeleteDocument(doc?.case_id ?? "");

  if (!doc) {
    return <Screen>{query.error ? <ErrorBox message={errorMessage(query.error)} onRetry={() => query.refetch()} /> : <SkeletonList rows={4} />}</Screen>;
  }

  async function del() {
    setMenu(false);
    const yes = await confirm({ title: t("document.deleteConfirm"), message: t("document.deleteText"), confirm: t("common.delete"), destructive: true });
    if (yes) remove.mutate(doc!.id, { onSuccess: () => router.back(), onError: (e) => toast(errorMessage(e), "error") });
  }

  const a = doc.analysis;
  const reading = doc.status === "analyzing" || doc.status === "uploaded" || retry.isPending || answer.isPending;

  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => query.refetch()}>
      <Stack.Screen options={{ headerRight: () => <IconButton icon="ellipsis-horizontal-circle" label={t("common.more")} onPress={() => setMenu(true)} color={c.accent} /> }} />
      <View style={{ gap: space(2) }}>
        {a?.document_type && <Txt variant="label" tone="accent">{a.document_type}</Txt>}
        <Txt variant="title" selectable>{doc.title_de ?? doc.file_name}</Txt>
        <Muted>
          {[doc.sender && `${t("document.from")}: ${doc.sender}`, doc.document_date && `${t("document.date")}: ${formatDate(doc.document_date)}`]
            .filter(Boolean)
            .join(" · ")}
        </Muted>
        <View style={{ flexDirection: "row", gap: space(2), flexWrap: "wrap" }}>
          {doc.urgency && doc.status === "ready" && (
            <Badge label={t(`document.urgency_${doc.urgency}`)} tone={doc.urgency === "high" ? "danger" : doc.urgency === "medium" ? "warn" : "neutral"} />
          )}
          <Badge label={t("case.pages", { count: doc.page_count || 1 })} icon="documents-outline" />
          {a?.reference_number && <Badge label={a.reference_number} icon="pricetag-outline" />}
        </View>
      </View>

      <PendingFacts caseId={doc.case_id} documentId={doc.id} />

      {reading && (
        <Card style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
          <ActivityIndicator color={c.accent} />
          <Txt style={{ flex: 1 }}>{t("case.reading")}</Txt>
        </Card>
      )}
      {doc.status === "failed" && !retry.isPending && (
        <>
          <ErrorBox message={retry.error ? friendlyError(retry.error, t) : doc.error ?? t("case.failed")} />
          <Button icon="refresh" title={t("common.retry")} onPress={() => retry.mutate(doc.id)} />
        </>
      )}

      {doc.status === "needs_owner" && !answer.isPending && (
        <Card style={{ gap: space(2) }}>
          <Txt variant="h3">{t("document.whoseTitle")}</Txt>
          {doc.addressed_to && <Txt selectable>{t("document.addressedTo", { name: doc.addressed_to })}</Txt>}
          <Muted>{t("document.whoseText")}</Muted>
          {answer.error && <ErrorBox message={friendlyError(answer.error, t)} />}
          <Button icon="checkmark" title={t("document.mine")} onPress={() => answer.mutate({ id: doc.id, owner: "mine" })} />
          <Button variant="secondary" icon="close" title={t("document.notMine")} onPress={() => answer.mutate({ id: doc.id, owner: "not_mine" })} />
        </Card>
      )}

      {doc.status === "not_owner" && (
        <Card style={{ gap: space(2), backgroundColor: c.warnSoft, borderColor: c.warnSoft }}>
          <View style={{ flexDirection: "row", gap: space(2), alignItems: "center" }}>
            <Ionicons name="person-remove" size={20} color={c.warn} />
            <Txt variant="h3" tone="warn" style={{ flex: 1 }}>{t("document.notYoursTitle")}</Txt>
          </View>
          {doc.addressed_to && <Txt selectable>{t("document.addressedTo", { name: doc.addressed_to })}</Txt>}
          <Txt>{t("document.notYoursText")}</Txt>
          <Button small variant="secondary" icon="trash-outline" title={t("document.delete")} onPress={del} />
        </Card>
      )}

      {a && doc.status === "ready" && (
        <>
          {!a.readable && <ErrorBox message={t("document.unreadable")} />}
          <Card style={{ backgroundColor: c.accentSoft, borderColor: c.accentSoft }}>
            <Txt variant="h3">{a.summary}</Txt>
          </Card>

          {a.actions.length > 0 && (
            <Section title={t("document.todo")}>
              {a.actions.map((action, i) => (
                <Card key={i} style={{ flexDirection: "row", gap: space(3) }}>
                  <Ionicons name="arrow-forward-circle" size={24} color={c.accent} style={flip} />
                  <View style={{ flex: 1, gap: space(1) }}>
                    <Txt>{action.title}</Txt>
                    <DueBadge date={action.due_date} />
                    {action.how_due_date_was_found && (
                      <Txt variant="small" tone="faint">{t("document.deadlineSource", { source: action.how_due_date_was_found })}</Txt>
                    )}
                  </View>
                </Card>
              ))}
            </Section>
          )}

          {a.needs_advice && (
            <Card style={{ backgroundColor: c.warnSoft, borderColor: c.warnSoft }}>
              <View style={{ flexDirection: "row", gap: space(2), alignItems: "center" }}>
                <Ionicons name="people" size={20} color={c.warn} />
                <Txt variant="h3" tone="warn">{t("document.advice")}</Txt>
              </View>
              <Txt>{a.advice_reason ?? t("document.adviceText")}</Txt>
              <Button small variant="secondary" icon="help-buoy-outline" title={t("help.findAdvice")}
                onPress={() => router.push({
                  pathname: "/help/[kind]",
                  params: { kind: helpForCategory(theCase.data?.category ?? "other")[0], caseId: doc.case_id },
                })} />
            </Card>
          )}

          {(a.amounts?.length ?? 0) > 0 && (
            <Section title={t("document.amounts")}>
              <Card>
                {a.amounts!.map((m, i) => (
                  <View key={i} style={{ flexDirection: "row", gap: space(3), paddingVertical: space(1) }}>
                    <Txt style={{ flex: 1 }}>{m.label}</Txt>
                    <Txt variant="h3" style={{ fontVariant: ["tabular-nums"] }}>{euro(m.amount_eur)}</Txt>
                  </View>
                ))}
              </Card>
            </Section>
          )}

          <Section title={t("document.explanation")}>
            <Markdown text={a.explanation} />
          </Section>

          {a.key_terms.length > 0 && (
            <Section title={t("document.terms")}>
              <Card>
                {a.key_terms.map((term, i) => (
                  <View key={i} style={{ gap: 2, paddingVertical: space(1.5), borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
                    <Txt variant="h3" tone="accent" selectable>{term.term_de}</Txt>
                    <Txt>{term.meaning}</Txt>
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

      {!isDemo && (
        <Section title={t("document.original")}>
          {!showPages ? (
            <Button variant="secondary" icon="images-outline" title={t("document.original")} onPress={() => setShowPages(true)} />
          ) : pages.isPending ? <ActivityIndicator color={c.accent} /> : (
            <ScrollView horizontal contentContainerStyle={{ gap: space(3) }}>
              {(pages.data ?? []).map((url, i) => (
                <Pressable key={url} onPress={() => Linking.openURL(url)} accessibilityLabel={t("scan.page", { n: i + 1 })}>
                  {doc.mime_type === "application/pdf" ? (
                    <View style={{ width: 150, height: 200, borderRadius: radius.md, backgroundColor: c.dangerSoft, alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name="document-text" size={44} color={c.danger} />
                    </View>
                  ) : (
                    <Image source={{ uri: url }} style={{ width: 150, height: 200, borderRadius: radius.md, backgroundColor: c.skeleton }} contentFit="cover" />
                  )}
                </Pressable>
              ))}
            </ScrollView>
          )}
        </Section>
      )}

      <Sheet visible={menu} onClose={() => setMenu(false)}>
        <Button variant="danger" icon="trash-outline" title={t("document.delete")} onPress={del} />
        <Button variant="secondary" title={t("common.cancel")} onPress={() => setMenu(false)} />
      </Sheet>
    </Screen>
  );
}
