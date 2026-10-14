import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView, Switch, TextInput, View } from "react-native";
import { PendingFacts } from "@/components/FactSuggestions";
import { useFeedback, waitForModalClose } from "@/components/feedback";
import { Markdown } from "@/components/Markdown";
import {
  Badge, Button, Card, Chip, DemoBanner, ErrorBox, Footer, IconButton, Muted, Screen, Section, Segmented, Sheet, SkeletonList, Txt,
} from "@/components/ui";
import { LTR_INPUT, useInputDir, useLtrText } from "@/lib/direction";
import { withTimeout } from "@/lib/errors";
import { friendlyError } from "@/lib/errorText";
import { formAnswersText, formFileName, formProgress, formSheetHtml, groupFields, isFilled } from "@/lib/formSheet";
import { errorMessage, useForm, useFormActions, useLearnFacts } from "@/lib/queries";
import { downloadPdf, htmlToPdf } from "@/lib/savePdf";
import { useMe } from "@/lib/session";
import { radius, space, useColors } from "@/lib/theme";
import type { CaseForm, FormField } from "@/lib/types";

type Filter = "all" | "missing";

const EXPORT_SECONDS = 90;

function FieldCard({ field, onChange }: { field: FormField; onChange: (value: string | null) => void }) {
  const ltrText = useLtrText();
  const { t } = useTranslation();
  const c = useColors();
  const filled = isFilled(field);
  const input = {
    color: c.ink, backgroundColor: c.bg, borderColor: filled ? c.line : c.warn, borderWidth: 1, borderRadius: radius.sm,
    paddingHorizontal: space(3), paddingVertical: space(2.5), fontSize: 16, ...LTR_INPUT,
    // Keeps the input above the card's glass layer on the web, where it would otherwise blur the text.
    position: "relative" as const, zIndex: 1,
  };
  const checked = /^(true|ja|yes|x|1)$/i.test(field.value?.trim() ?? "");

  return (
    <Card style={{ gap: space(2) }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space(2) }}>
        <Txt variant="h3" selectable style={[{ flex: 1 }, ltrText]}>{field.label_de}</Txt>
        {field.required && !filled && <Badge tone="warn" label={t("form.required")} />}
        {filled && field.type !== "signature" && <Ionicons name="checkmark-circle" size={20} color={c.success} />}
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

type Mode = "questions" | "story";

/**
 * Gets what the agent could not fill in from the person: one question at a time, or
 * everything at once in their own words. Answers go through the agent so they land in
 * the right fields, in German and in the form's format. When nothing is left to ask,
 * the person can still tell BüroKI about changes.
 */
function Ask({ form, busy, onSend }: { form: CaseForm; busy: boolean; onSend: (text: string) => Promise<string | null> }) {
  const ltrText = useLtrText();
  const { t } = useTranslation();
  const c = useColors();
  const inputDir = useInputDir();
  const [mode, setMode] = useState<Mode>("questions");
  const [text, setText] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const open = form.fields.filter((f) => !isFilled(f) && f.type !== "signature");
  const queue = open.filter((f) => !skipped.includes(f.key));
  const story = mode === "story" || open.length === 0;
  const current = story ? undefined : queue[0];

  async function send() {
    const message = current
      ? `Question for the field "${current.label_de}" (key ${current.key}): ${current.question ?? current.explanation}\nThe person's answer: ${text.trim()}`
      : text.trim();
    const answer = await onSend(message);
    if (answer !== null) {
      setReply(answer);
      setText("");
      // After telling everything at once, go on with whatever is still missing.
      if (mode === "story") setMode("questions");
    }
  }

  const title = open.length === 0 ? t("form.askTitle") : story ? t("form.storyTitle") : current ? t("form.questionsTitle") : t("form.questionsDone");
  return (
    <Card style={{ gap: space(3), backgroundColor: c.accentSoft, borderColor: c.accentSoft }}>
      {open.length > 0 && (
        <Segmented<Mode>
          value={mode}
          onChange={(m) => {
            setMode(m);
            setText("");
          }}
          options={[{ value: "questions", label: t("form.modeQuestions") }, { value: "story", label: t("form.modeStory") }]}
        />
      )}
      <View style={{ flexDirection: "row", gap: space(2), alignItems: "center" }}>
        <Ionicons name={story ? "chatbubble-ellipses-outline" : "help-circle-outline"} size={20} color={c.accent} />
        <Txt variant="h3" style={{ flex: 1 }}>{title}</Txt>
        {current && <Muted>{t("form.questionOf", { n: open.length - queue.length + 1, total: open.length })}</Muted>}
      </View>
      {current ? (
        <View style={{ gap: space(1) }}>
          <Txt variant="small" tone="muted" style={ltrText}>{current.label_de}</Txt>
          <Txt variant="h3">{current.question ?? current.explanation}</Txt>
        </View>
      ) : (
        <Muted>{open.length === 0 ? t("form.askTextDone") : story ? t("form.storyText") : t("form.questionsDoneText")}</Muted>
      )}
      {(story || current) && (
        <>
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            placeholder={current ? t("form.answerPlaceholder") : t("form.askPlaceholder")}
            placeholderTextColor={c.faint}
            accessibilityLabel={current?.question ?? title}
            style={[{
              minHeight: current ? 48 : 120, textAlignVertical: "top", color: c.ink, backgroundColor: c.glassFill, borderRadius: radius.sm,
              padding: space(3), fontSize: 16, position: "relative", zIndex: 1,
            }, inputDir]}
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
        </>
      )}
      {!story && !current && (
        <Button small variant="secondary" title={t("form.askSkippedAgain")} onPress={() => setSkipped([])} />
      )}
      {reply && (
        <View style={{ flexDirection: "row", gap: space(2), alignItems: "flex-start" }}>
          <Ionicons name="sparkles" size={16} color={c.accent} style={{ marginTop: 3 }} />
          <Txt style={{ flex: 1 }}>{reply}</Txt>
        </View>
      )}
    </Card>
  );
}

/** How much of the form is filled, as a bar and a count. */
function Progress({ filled, total }: { filled: number; total: number }) {
  const { t } = useTranslation();
  const c = useColors();
  const share = total ? filled / total : 1;
  return (
    <View style={{ gap: space(1.5) }}>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: c.line, overflow: "hidden" }}>
        <View style={{ width: `${Math.round(share * 100)}%`, height: 6, borderRadius: 3, backgroundColor: share === 1 ? c.success : c.accent }} />
      </View>
      <Txt variant="small" tone="muted">{t("form.progress", { filled, total })}</Txt>
    </View>
  );
}

export default function FormScreen() {
  const ltrText = useLtrText();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const c = useColors();
  const { toast, confirm } = useFeedback();
  const query = useForm(id);
  const form = query.data;
  const actions = useFormActions(form);
  const { profile } = useMe();
  const learn = useLearnFacts(form?.case_id ?? "");
  const [draft, setDraft] = useState<FormField[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [menu, setMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [finishing, setFinishing] = useState(false);

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
  // Missing means missing in the saved form, so a field does not vanish while it is being typed in.
  const savedMissing = new Set(form.fields.filter((f) => !isFilled(f)).map((f) => f.key));
  const shown = filter === "missing" ? fields.filter((f) => savedMissing.has(f.key)) : fields;
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
      const wasOpen = fields.some((f) => !isFilled(f) && f.type !== "signature");
      const res = await actions.answer.mutateAsync(text);
      const nowOpen = res.form.fields.some((f) => !isFilled(f) && f.type !== "signature");
      // The last question is answered: offer to finish, which asks what to remember from the whole form.
      if (wasOpen && !nowOpen) openFinish(res.form);
      // Anything new the person said about themselves is offered to remember, never kept silently.
      else if (profile?.memory_enabled !== false) learn.mutate(text);
      return res.reply;
    } catch (e) {
      toast(friendlyError(e, t), "error");
      return null;
    }
  }

  /** The finish step: what to remember from this form, then the PDF, then closing the form. */
  function openFinish(filled: CaseForm) {
    setFinishing(true);
    if (profile?.memory_enabled !== false) learn.mutate(formAnswersText(filled));
  }

  async function finish() {
    if (await saveDraft()) openFinish(current);
  }

  async function exportPdf(confirmed = false) {
    if (progress.missingRequired > 0 && !confirmed) {
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
        const res = await withTimeout(actions.exportPdf.mutateAsync(), EXPORT_SECONDS * 1000);
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
            <Button icon="checkmark-circle-outline" title={t("form.finish")} onPress={finish} loading={exporting} disabled={busy} />
          )}
        </Footer>
      }
    >
      {header}
      <DemoBanner />
      <View style={{ gap: space(1.5) }}>
        <Txt variant="h2" selectable style={ltrText}>{form.title_de ?? form.file_name}</Txt>
        {form.title && form.title !== form.title_de && <Muted>{form.title}</Muted>}
        <View style={{ flexDirection: "row", gap: space(2), flexWrap: "wrap" }}>
          <Badge icon={form.fillable ? "document-text-outline" : "camera-outline"} label={form.fillable ? t("form.fillable") : t("form.scanned")} />
        </View>
      </View>
      <Progress filled={progress.filled} total={progress.total} />
      {form.summary && <Muted>{form.summary}</Muted>}

      <Ask form={current} busy={actions.answer.isPending || actions.save.isPending} onSend={answer} />
      <PendingFacts caseId={form.case_id} />

      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: t("form.all") },
          { value: "missing", label: `${t("form.missing")} ${savedMissing.size || ""}`.trim() },
        ]}
      />

      {shown.length === 0 && <Muted>{t("form.allFilled")}</Muted>}
      {groupFields(shown).map((g, i) => (
        <View key={`${g.title}-${i}`} style={{ gap: space(3) }}>
          {(g.title || g.page) && (
            <Txt variant="label" tone="muted" style={ltrText}>
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
      <Sheet visible={finishing} onClose={() => setFinishing(false)} title={t("form.finishTitle")}>
        <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: space(3) }}>
          <Txt>{progress.missingRequired > 0 ? t("form.finishMissing", { count: progress.missingRequired }) : t("form.finishReady")}</Txt>
          {profile?.memory_enabled !== false && (learn.isPending ? (
            <View style={{ flexDirection: "row", gap: space(2), alignItems: "center" }}>
              <ActivityIndicator color={c.accent} />
              <Muted>{t("form.finishLearning")}</Muted>
            </View>
          ) : (
            <PendingFacts caseId={form.case_id} empty={<Muted>{t("form.finishNothingNew")}</Muted>} />
          ))}
        </ScrollView>
        <Button icon="document-outline" title={form.fillable ? t("form.downloadFilled") : t("form.downloadSheet")}
          loading={exporting}
          onPress={async () => {
            setFinishing(false);
            await waitForModalClose();
            exportPdf(true);
          }} />
        <Button variant="secondary" icon="checkmark" title={t("form.finishClose")}
          onPress={() => {
            setFinishing(false);
            router.back();
          }} />
        <Button variant="ghost" title={t("form.keepEditing")} onPress={() => setFinishing(false)} />
      </Sheet>
    </Screen>
  );
}
