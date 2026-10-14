import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Switch, TextInput, View } from "react-native";
import { useFeedback } from "@/components/feedback";
import { Markdown } from "@/components/Markdown";
import {
  Badge, Button, Card, Chip, DemoBanner, ErrorBox, Footer, IconButton, Muted, Screen, Section, Segmented, Sheet, SkeletonList, Txt,
} from "@/components/ui";
import { friendlyError } from "@/lib/errorText";
import { formFileName, formProgress, formSheetHtml, groupFields, isFilled } from "@/lib/formSheet";
import { errorMessage, useForm, useFormActions } from "@/lib/queries";
import { downloadPdf, htmlToPdf } from "@/lib/savePdf";
import { radius, space, useColors } from "@/lib/theme";
import type { CaseForm, FormField } from "@/lib/types";

type Filter = "all" | "missing";

function FieldCard({ field, onChange }: { field: FormField; onChange: (value: string | null) => void }) {
  const { t } = useTranslation();
  const c = useColors();
  const filled = isFilled(field);
  const input = {
    color: c.ink, backgroundColor: c.bg, borderColor: filled ? c.line : c.warn, borderWidth: 1, borderRadius: radius.sm,
    paddingHorizontal: space(3), paddingVertical: space(2.5), fontSize: 16, writingDirection: "ltr" as const, textAlign: "left" as const,
    // Keeps the input above the card's glass layer on the web, where it would otherwise blur the text.
    position: "relative" as const, zIndex: 1,
  };
  const checked = /^(true|ja|yes|x|1)$/i.test(field.value?.trim() ?? "");

  return (
    <Card style={{ gap: space(2) }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space(2) }}>
        <Txt variant="h3" selectable style={{ flex: 1, writingDirection: "ltr", textAlign: "left" }}>{field.label_de}</Txt>
        {field.required && !filled && <Badge tone="warn" label={t("form.required")} />}
      </View>
      <Muted>{field.explanation}</Muted>

      {field.type === "signature" ? (
        <View style={{ flexDirection: "row", gap: space(2), alignItems: "center" }}>
          <Ionicons name="pencil" size={16} color={c.muted} />
          <Txt variant="small" tone="muted">{t("form.signByHand")}</Txt>
        </View>
      ) : field.type === "checkbox" ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
          <Switch value={checked} onValueChange={(v) => onChange(v ? "true" : "false")} trackColor={{ true: c.accent }}
            accessibilityLabel={field.label_de} />
          <Txt>{checked ? t("form.yes") : t("form.no")}</Txt>
        </View>
      ) : field.type === "choice" && field.options.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }}>
          {field.options.map((o) => (
            <Chip key={o} label={o} selected={field.value === o} onPress={() => onChange(field.value === o ? null : o)} />
          ))}
        </View>
      ) : (
        <TextInput
          value={field.value ?? ""}
          onChangeText={(v) => onChange(v === "" ? null : v)}
          placeholder={field.type === "date" ? "TT.MM.JJJJ" : undefined}
          placeholderTextColor={c.faint}
          keyboardType={field.type === "number" ? "numeric" : field.type === "date" ? "numbers-and-punctuation" : "default"}
          multiline={(field.value?.length ?? 0) > 40}
          accessibilityLabel={field.label_de}
          style={input}
        />
      )}

      {!filled && field.question ? (
        <View style={{ flexDirection: "row", gap: space(1.5) }}>
          <Ionicons name="help-circle-outline" size={16} color={c.warn} />
          <Txt variant="small" tone="warn" style={{ flex: 1 }}>{field.question}</Txt>
        </View>
      ) : filled && field.source_note && field.type !== "signature" ? (
        <View style={{ flexDirection: "row", gap: space(1.5) }}>
          <Ionicons name="sparkles-outline" size={14} color={c.faint} />
          <Txt variant="small" tone="faint" style={{ flex: 1 }}>{field.source_note}</Txt>
        </View>
      ) : null}
    </Card>
  );
}

/**
 * Asks the person, one at a time, for everything the agent could not fill in. Answers go
 * through the agent so they land in the right fields, in German and in the form's format.
 * When nothing is left to ask, the person can still tell BüroKI anything in their own words.
 */
function Ask({ form, busy, onSend }: { form: CaseForm; busy: boolean; onSend: (text: string) => Promise<string | null> }) {
  const { t } = useTranslation();
  const c = useColors();
  const [text, setText] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const open = form.fields.filter((f) => !isFilled(f) && f.type !== "signature");
  const queue = open.filter((f) => !skipped.includes(f.key));
  const current = queue[0];

  async function send() {
    const message = current
      ? `Question for the field "${current.label_de}" (key ${current.key}): ${current.question ?? current.explanation}\nThe person's answer: ${text.trim()}`
      : text.trim();
    const answer = await onSend(message);
    if (answer !== null) {
      setReply(answer);
      setText("");
    }
  }

  return (
    <Card style={{ gap: space(2.5), backgroundColor: c.accentSoft, borderColor: c.accentSoft }}>
      <View style={{ flexDirection: "row", gap: space(2), alignItems: "center" }}>
        <Ionicons name={current ? "help-circle-outline" : "chatbubble-ellipses-outline"} size={20} color={c.accent} />
        <Txt variant="h3" style={{ flex: 1 }}>{current ? t("form.questionsTitle") : t("form.askTitle")}</Txt>
        {current && <Muted>{t("form.questionOf", { n: open.length - queue.length + 1, total: open.length })}</Muted>}
      </View>
      {current ? (
        <View style={{ gap: space(1) }}>
          <Txt variant="small" tone="muted" style={{ writingDirection: "ltr", textAlign: "left" }}>{current.label_de}</Txt>
          <Txt variant="h3">{current.question ?? current.explanation}</Txt>
        </View>
      ) : (
        <Muted>{open.length ? t("form.askText", { count: open.length }) : t("form.askTextDone")}</Muted>
      )}
      <TextInput
        value={text}
        onChangeText={setText}
        multiline
        placeholder={current ? t("form.answerPlaceholder") : t("form.askPlaceholder")}
        placeholderTextColor={c.faint}
        accessibilityLabel={current?.question ?? t("form.askTitle")}
        style={{
          minHeight: current ? 48 : 72, textAlignVertical: "top", color: c.ink, backgroundColor: c.card, borderRadius: radius.sm,
          padding: space(3), fontSize: 16, position: "relative", zIndex: 1,
        }}
      />
      <View style={{ flexDirection: "row", gap: space(2) }}>
        {current && (
          <Button small style={{ flex: 1 }} variant="secondary" title={t("form.skip")} disabled={busy}
            onPress={() => {
              setSkipped([...skipped, current.key]);
              setText("");
            }} />
        )}
        <Button small style={{ flex: 1 }} icon="sparkles" title={current ? t("form.answer") : t("form.askSend")} onPress={send}
          loading={busy} disabled={!text.trim()} />
      </View>
      {!current && skipped.length > 0 && open.length > 0 && (
        <Button small variant="ghost" title={t("form.askSkippedAgain")} onPress={() => setSkipped([])} />
      )}
      {reply && <Txt>{reply}</Txt>}
    </Card>
  );
}

export default function FormScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const c = useColors();
  const { toast, confirm } = useFeedback();
  const query = useForm(id);
  const form = query.data;
  const actions = useFormActions(form);
  const [draft, setDraft] = useState<FormField[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [menu, setMenu] = useState(false);
  const [exporting, setExporting] = useState(false);

  if (!form) {
    return <Screen>{query.error ? <ErrorBox message={errorMessage(query.error)} onRetry={() => query.refetch()} /> : <SkeletonList rows={4} />}</Screen>;
  }

  async function del() {
    setMenu(false);
    const yes = await confirm({ title: t("form.deleteConfirm"), confirm: t("common.delete"), destructive: true });
    if (yes) actions.remove.mutate(undefined, { onSuccess: () => router.back(), onError: (e) => toast(errorMessage(e), "error") });
  }

  const header = (
    <Stack.Screen options={{ headerRight: () => <IconButton icon="ellipsis-horizontal-circle" label={t("common.more")} onPress={() => setMenu(true)} color={c.accent} /> }} />
  );
  const menuSheet = (
    <Sheet visible={menu} onClose={() => setMenu(false)}>
      <Button variant="danger" icon="trash-outline" title={t("form.delete")} onPress={del} loading={actions.remove.isPending} />
      <Button variant="secondary" title={t("common.cancel")} onPress={() => setMenu(false)} />
    </Sheet>
  );

  if (form.status === "uploaded" || form.status === "analyzing") {
    return (
      <Screen>
        {header}
        <Card style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
          <ActivityIndicator color={c.accent} />
          <View style={{ flex: 1 }}>
            <Txt variant="h3">{t("form.reading")}</Txt>
            <Muted>{t("form.readingHint")}</Muted>
          </View>
        </Card>
        {menuSheet}
      </Screen>
    );
  }

  if (form.status === "failed") {
    const message = form.error === "not_a_form" ? t("form.notAForm") : form.error === "unreadable" ? t("form.unreadable") : form.error;
    return (
      <Screen>
        {header}
        <ErrorBox message={message ?? t("common.error")} />
        <Button icon="refresh" title={t("common.retry")} loading={actions.retry.isPending}
          onPress={() => actions.retry.mutate(undefined, { onError: (e) => toast(friendlyError(e, t), "error") })} />
        <Button variant="secondary" icon="trash-outline" title={t("form.delete")} onPress={del} />
        {menuSheet}
      </Screen>
    );
  }

  const fields = draft ?? form.fields;
  const current: CaseForm = { ...form, fields };
  const progress = formProgress(fields);
  const shown = filter === "missing" ? fields.filter((f) => !isFilled(f)) : fields;
  const busy = actions.save.isPending || actions.answer.isPending || exporting;

  function change(key: string, value: string | null) {
    setDraft(fields.map((f) => (f.key === key ? { ...f, value, source_note: null } : f)));
  }

  async function saveDraft(): Promise<boolean> {
    if (!draft) return true;
    try {
      await actions.save.mutateAsync(draft);
      setDraft(null);
      return true;
    } catch (e) {
      toast(errorMessage(e), "error");
      return false;
    }
  }

  async function answer(text: string): Promise<string | null> {
    if (!(await saveDraft())) return null;
    try {
      const res = await actions.answer.mutateAsync(text);
      return res.reply;
    } catch (e) {
      toast(friendlyError(e, t), "error");
      return null;
    }
  }

  async function exportPdf() {
    if (progress.missingRequired > 0) {
      const go = await confirm({
        title: t("form.missingTitle"),
        message: t("form.missingText", { count: progress.missingRequired }),
        confirm: t("form.exportAnyway"),
      });
      if (!go) return;
    }
    if (!(await saveDraft())) return;
    setExporting(true);
    try {
      if (form!.fillable) {
        const res = await actions.exportPdf.mutateAsync();
        if (!res.url) throw new Error(t("common.error"));
        await downloadPdf(res.url, formFileName(form!, "ausgefuellt"));
        if (res.skipped.length) toast(t("form.skipped", { count: res.skipped.length }));
      } else {
        await htmlToPdf(formSheetHtml(current, {
          heading: t("form.sheetHeading"),
          intro: t("form.sheetIntro"),
          page: t("form.sheetPage"),
          field: t("form.sheetField"),
          write: t("form.sheetWrite"),
          missing: t("form.sheetMissing"),
          sign: t("form.signByHand"),
          yes: t("form.yes"),
          no: t("form.no"),
        }), formFileName(form!, "Ausfuellhilfe"));
      }
    } catch (e) {
      toast(friendlyError(e, t), "error");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Screen
      footer={
        <Footer>
          {draft ? (
            <View style={{ flexDirection: "row", gap: space(2) }}>
              <Button style={{ flex: 1 }} variant="secondary" title={t("common.cancel")} onPress={() => setDraft(null)} />
              <Button style={{ flex: 1 }} icon="checkmark" title={t("common.save")} loading={actions.save.isPending}
                onPress={() => saveDraft().then((ok) => ok && toast(t("common.saved")))} />
            </View>
          ) : (
            <Button icon="document-outline" title={form.fillable ? t("form.downloadFilled") : t("form.downloadSheet")}
              onPress={exportPdf} loading={exporting} disabled={busy} />
          )}
        </Footer>
      }
    >
      {header}
      <DemoBanner />
      <View style={{ gap: space(1.5) }}>
        <Txt variant="h2" selectable style={{ writingDirection: "ltr", textAlign: "left" }}>{form.title_de ?? form.file_name}</Txt>
        {form.title && form.title !== form.title_de && <Muted>{form.title}</Muted>}
        <View style={{ flexDirection: "row", gap: space(2), flexWrap: "wrap" }}>
          <Badge tone={progress.filled === progress.total ? "accent" : "neutral"} icon="checkmark-done"
            label={t("form.progress", { filled: progress.filled, total: progress.total })} />
          <Badge icon={form.fillable ? "document-text-outline" : "camera-outline"} label={form.fillable ? t("form.fillable") : t("form.scanned")} />
        </View>
      </View>
      {form.summary && <Txt>{form.summary}</Txt>}

      <Ask form={current} busy={actions.answer.isPending || actions.save.isPending} onSend={answer} />

      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: t("form.all") },
          { value: "missing", label: `${t("form.missing")} ${progress.total - progress.filled || ""}`.trim() },
        ]}
      />

      {shown.length === 0 && <Muted>{t("form.allFilled")}</Muted>}
      {groupFields(shown).map((g, i) => (
        <View key={`${g.title}-${i}`} style={{ gap: space(3) }}>
          {(g.title || g.page) && (
            <Txt variant="label" tone="muted" style={{ writingDirection: "ltr", textAlign: "left" }}>
              {[g.page ? t("form.sheetPage") + " " + g.page : null, g.title].filter(Boolean).join(" · ")}
            </Txt>
          )}
          {g.fields.map((f) => <FieldCard key={f.key} field={f} onChange={(v) => change(f.key, v)} />)}
        </View>
      ))}

      {form.instructions && (
        <Section title={t("form.instructions")}>
          <Card><Markdown text={form.instructions} /></Card>
        </Section>
      )}
      <Muted>{form.fillable ? t("form.fillableHint") : t("form.sheetHint")}</Muted>
      <Muted>{t("form.disclaimer")}</Muted>
      {menuSheet}
    </Screen>
  );
}
