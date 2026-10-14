import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking, Share, TextInput, View } from "react-native";
import { useFeedback, waitForModalClose } from "@/components/feedback";
import { Badge, Button, Card, ErrorBox, Field, IconButton, Muted, Screen, Section, Sheet, SkeletonList, Txt } from "@/components/ui";
import { api } from "@/lib/api";
import { LTR_INPUT, useLtrText } from "@/lib/direction";
import { ApiError } from "@/lib/errors";
import { friendlyError } from "@/lib/errorText";
import { formatDate } from "@/lib/i18n";
import { emailIn, isEmailAddress, letterFileName, placeholders } from "@/lib/letter";
import { choosePhotos, PermissionDenied, takePhoto } from "@/lib/pick";
import { exportLetterPdf } from "@/lib/printLetter";
import {
  errorMessage, useCase, useDeleteDraft, useDraft, useDraftFiles, useFileUrls, useSendEmail, useSetDraftStatus, useUpdateDraft,
} from "@/lib/queries";
import { downloadPdf } from "@/lib/savePdf";
import { useMe, useSession } from "@/lib/session";
import { radius, space, useColors } from "@/lib/theme";

export default function DraftScreen() {
  const ltrText = useLtrText();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const c = useColors();
  const { toast, confirm } = useFeedback();
  const query = useDraft(id);
  const draft = query.data;
  const theCase = useCase(draft?.case_id ?? "");
  const update = useUpdateDraft(draft);
  const setStatus = useSetDraftStatus(draft);
  const remove = useDeleteDraft();
  const send = useSendEmail(draft);
  const { email: loginEmail } = useSession();
  const { profile } = useMe();
  const [sending, setSending] = useState(false);
  const [to, setTo] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState("");
  const [menu, setMenu] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [askProof, setAskProof] = useState(false);
  const files = useDraftFiles(draft);
  const proofPaths = draft?.proof_paths ?? [];
  const proofUrls = useFileUrls(proofPaths);

  if (!draft) {
    return <Screen>{query.error ? <ErrorBox message={errorMessage(query.error)} onRetry={() => query.refetch()} /> : <SkeletonList rows={3} />}</Screen>;
  }

  async function copy() {
    await Clipboard.setStringAsync(draft!.body_de);
    toast(t("draft.copied"));
  }

  function save() {
    update.mutate({ body_de: body }, {
      onSuccess: () => {
        setEditing(false);
        toast(t("common.saved"));
      },
      onError: (e) => toast(errorMessage(e), "error"),
    });
  }

  function openEmail() {
    const to = emailIn(theCase.data?.authority);
    const url = `mailto:${to}?subject=${encodeURIComponent(draft!.subject)}&body=${encodeURIComponent(draft!.body_de)}`;
    Linking.openURL(url).catch(() => toast(t("common.error"), "error"));
  }

  function startSend() {
    const missing = placeholders(`${draft!.subject}\n${draft!.body_de}`);
    if (missing.length) {
      toast(t("draft.sendFillFirst", { fields: missing.slice(0, 4).join(", ") }), "error");
      return;
    }
    setTo(emailIn(theCase.data?.authority));
    setReplyTo(profile?.contact_email ?? loginEmail ?? "");
    send.reset();
    setSending(true);
  }

  function sendNow() {
    send.mutate({ to: to.trim().toLowerCase(), replyTo: replyTo.trim().toLowerCase() }, {
      onSuccess: (sentDraft) => {
        setSending(false);
        toast(t("draft.sentByBueroki", { to: sentDraft.sent_to ?? to }));
      },
      onError: (e) => {
        if (e instanceof ApiError && e.code === "email_off") {
          setSending(false);
          openEmail();
        }
      },
    });
  }

  async function savePdf() {
    const missing = placeholders(draft!.body_de);
    if (missing.length) {
      const go = await confirm({
        title: t("draft.placeholdersTitle"),
        message: t("draft.placeholdersText", { fields: missing.slice(0, 4).join(", ") }),
        confirm: t("draft.pdfAnyway"),
      });
      if (!go) return;
    }
    setPrinting(true);
    try {
      const pdf = await exportLetterPdf(draft!.body_de, draft!.subject);
      // Keep the exact letter with the draft, so it can be found again after sending.
      if (pdf) {
        files.savePdf.mutate(pdf, {
          onSuccess: () => toast(t("draft.pdfSaved")),
          onError: (e) => toast(friendlyError(e, t), "error"),
        });
      }
    } catch (e) {
      toast(friendlyError(e, t), "error");
    } finally {
      setPrinting(false);
    }
  }

  async function openSavedPdf() {
    try {
      const [url] = await api.getFileUrls([draft!.pdf_path!]);
      if (!url) throw new Error(t("common.error"));
      await downloadPdf(url, letterFileName(draft!.subject));
    } catch (e) {
      toast(friendlyError(e, t), "error");
    }
  }

  function markSent() {
    setStatus.mutate("sent", {
      onSuccess: () => {
        toast(t("draft.markedSent"));
        // Letters go by post: offer to keep the receipt or tracking number as proof.
        if (draft!.kind === "letter") setAskProof(true);
      },
    });
  }

  async function addProof(source: "camera" | "library") {
    setAskProof(false);
    await waitForModalClose();
    try {
      const photos = source === "camera" ? await takePhoto() : await choosePhotos(4);
      if (!photos.length) return;
      files.addProof.mutate(photos, {
        onSuccess: () => toast(t("draft.proofSaved")),
        onError: (e) => toast(friendlyError(e, t), "error"),
      });
    } catch (e) {
      toast(e instanceof PermissionDenied ? t("case.cameraDenied") : friendlyError(e, t), "error");
    }
  }

  async function removeProof(path: string) {
    if (!(await confirm({ title: t("draft.proofRemoveConfirm"), confirm: t("common.delete"), destructive: true }))) return;
    files.removeProof.mutate(path, { onError: (e) => toast(friendlyError(e, t), "error") });
  }

  async function del() {
    setMenu(false);
    if (!(await confirm({ title: t("draft.deleteConfirm"), confirm: t("common.delete"), destructive: true }))) return;
    remove.mutate(draft!, { onSuccess: () => router.back() });
  }

  const sent = draft.status === "sent";

  return (
    <Screen>
      <Stack.Screen options={{ headerRight: () => <IconButton icon="ellipsis-horizontal-circle" label={t("common.more")} onPress={() => setMenu(true)} color={c.accent} /> }} />
      <View style={{ gap: space(2) }}>
        <Txt variant="h2" selectable>{draft.subject}</Txt>
        <View style={{ flexDirection: "row", gap: space(2), flexWrap: "wrap" }}>
          <Badge label={draft.kind === "email" ? t("draft.email") : t("draft.letter")} icon={draft.kind === "email" ? "mail-outline" : "document-text-outline"} />
          {sent && <Badge tone="accent" icon="checkmark" label={draft.sent_at ? t("draft.sentOn", { date: formatDate(draft.sent_at) }) : t("draft.sent")} />}
          {sent && draft.sent_via === "bueroki" && draft.sent_to && <Badge icon="paper-plane-outline" label={t("draft.sentByBueroki", { to: draft.sent_to })} />}
          {draft.edited && <Badge label={t("draft.edited")} icon="pencil" />}
          {draft.revision_of && <Badge label={t("draft.revisionOf")} icon="git-branch-outline" />}
        </View>
      </View>

      {draft.notes && (
        <Card style={{ backgroundColor: c.warnSoft, borderColor: c.warnSoft }}>
          <Txt variant="h3" tone="warn">{t("draft.notes")}</Txt>
          <Txt>{draft.notes}</Txt>
        </Card>
      )}

      <Section
        title={t("draft.german")}
        action={!editing && !sent ? <Button small variant="ghost" icon="pencil" title={t("draft.editText")} onPress={() => {
          setBody(draft.body_de);
          setEditing(true);
        }} /> : undefined}
      >
        {editing ? (
          <>
            <TextInput
              value={body}
              onChangeText={setBody}
              multiline
              accessibilityLabel={t("draft.german")}
              style={{
                minHeight: 320, textAlignVertical: "top", ...LTR_INPUT, fontSize: 16, lineHeight: 23,
                color: c.ink, backgroundColor: c.glassFill, borderColor: c.accent, borderWidth: 1, borderRadius: radius.md, borderCurve: "continuous", padding: space(4),
              }}
            />
            <View style={{ flexDirection: "row", gap: space(2) }}>
              <Button style={{ flex: 1 }} variant="secondary" title={t("common.cancel")} onPress={() => setEditing(false)} />
              <Button style={{ flex: 1 }} icon="checkmark" title={t("draft.saveText")} onPress={save} loading={update.isPending} />
            </View>
          </>
        ) : (
          <Card>
            <Txt selectable style={ltrText}>{draft.body_de}</Txt>
          </Card>
        )}
      </Section>

      {!editing && (
        <>
          <View style={{ flexDirection: "row", gap: space(2) }}>
            <Button style={{ flex: 1 }} icon="copy-outline" title={t("draft.copy")} onPress={copy} />
            <Button style={{ flex: 1 }} variant="secondary" icon="share-outline" title={t("draft.share")}
              onPress={() => Share.share({ title: draft.subject, message: draft.body_de })} />
          </View>
          {draft.kind === "letter" && (
            <View style={{ gap: space(1.5) }}>
              <Button variant="secondary" icon="document-outline" title={t("draft.pdf")} onPress={savePdf}
                loading={printing || files.savePdf.isPending} />
              <Txt variant="small" tone="muted" style={{ textAlign: "center" }}>{t("draft.pdfHint")}</Txt>
            </View>
          )}
          {draft.pdf_path && (
            <Card style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
              <Ionicons name="document-text" size={24} color={c.danger} />
              <View style={{ flex: 1 }}>
                <Txt variant="h3">{t("draft.savedPdf")}</Txt>
                {draft.pdf_at && <Muted>{t("draft.savedPdfOn", { date: formatDate(draft.pdf_at) })}</Muted>}
              </View>
              <Button small variant="secondary" title={t("draft.open")} onPress={openSavedPdf} />
            </Card>
          )}
          {draft.kind === "email" && !sent && <Button icon="paper-plane" title={t("draft.sendBueroki")} onPress={startSend} />}
          {draft.kind === "email" && <Button variant="secondary" icon="mail-outline" title={t("draft.sendEmail")} onPress={openEmail} />}
          {!sent && (
            <Button variant="secondary" icon="sparkles-outline" title={t("draft.revise")}
              onPress={() => router.push({ pathname: "/case/[id]/draft", params: { id: draft.case_id, revise: draft.id } })} />
          )}
        </>
      )}

      {draft.body_translation && (
        <Section title={t("draft.translation")}>
          <Card>
            <Txt selectable>{draft.body_translation}</Txt>
            {draft.edited && <Muted>{t("draft.edited")}</Muted>}
          </Card>
        </Section>
      )}

      {sent && draft.sent_via !== "bueroki" && (
        <Section title={t("draft.proofTitle")}>
          {proofPaths.length === 0 && <Muted>{t("draft.proofEmpty")}</Muted>}
          {proofPaths.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }}>
              {proofPaths.map((path, i) => (
                <View key={path}>
                  <Image source={proofUrls.data?.[i] ? { uri: proofUrls.data[i] } : undefined} contentFit="cover"
                    accessibilityLabel={t("draft.proofTitle")}
                    style={{ width: 96, height: 128, borderRadius: radius.sm, backgroundColor: c.skeleton }} />
                  <View style={{ position: "absolute", top: 2, right: 2 }}>
                    <IconButton icon="close-circle" label={t("common.delete")} onPress={() => removeProof(path)} color={c.ink} />
                  </View>
                </View>
              ))}
            </View>
          )}
          <Button variant="secondary" icon="camera-outline" title={t("draft.proofAdd")} loading={files.addProof.isPending}
            onPress={() => setAskProof(true)} />
        </Section>
      )}

      {!sent ? (
        <Button icon="paper-plane-outline" title={t("draft.markSent")} loading={setStatus.isPending} onPress={markSent} />
      ) : draft.sent_via !== "bueroki" ? (
        <Button variant="ghost" title={t("draft.undoSent")} onPress={() => setStatus.mutate("draft")} />
      ) : null}
      <Muted>{t("draft.disclaimer")}</Muted>

      <Sheet visible={sending} onClose={() => setSending(false)} title={t("draft.sendTitle")}>
        <Field
          label={t("draft.sendTo")}
          value={to}
          onChangeText={setTo}
          ltr
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          hint={t("draft.sendToHint")}
          error={to.trim() && !isEmailAddress(to.trim()) ? t("draft.sendInvalid") : null}
        />
        <Card>
          <Txt variant="h3" style={ltrText}>{draft.subject}</Txt>
          <Muted numberOfLines={3}>{draft.body_de}</Muted>
        </Card>
        <Field
          label={t("draft.replyTo")}
          value={replyTo}
          onChangeText={setReplyTo}
          ltr
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          hint={t("draft.sendReplies")}
          error={replyTo.trim() && !isEmailAddress(replyTo.trim()) ? t("draft.sendInvalid") : null}
        />
        {send.error && <ErrorBox message={errorMessage(send.error)} />}
        <Button icon="paper-plane" title={t("draft.sendNow")} onPress={sendNow} loading={send.isPending}
          disabled={!isEmailAddress(to.trim()) || !isEmailAddress(replyTo.trim()) || send.isPending} />
        <Button variant="secondary" title={t("common.cancel")} onPress={() => setSending(false)} />
      </Sheet>

      <Sheet visible={askProof} onClose={() => setAskProof(false)} title={t("draft.proofAskTitle")}>
        <Txt>{t("draft.proofAskText")}</Txt>
        <Button icon="camera-outline" title={t("case.takePhoto")} onPress={() => addProof("camera")} />
        <Button variant="secondary" icon="images-outline" title={t("case.choosePhoto")} onPress={() => addProof("library")} />
        <Button variant="ghost" title={t("draft.proofLater")} onPress={() => setAskProof(false)} />
      </Sheet>

      <Sheet visible={menu} onClose={() => setMenu(false)}>
        <Button variant="danger" icon="trash-outline" title={t("draft.delete")} onPress={del} />
        <Button variant="secondary" title={t("common.cancel")} onPress={() => setMenu(false)} />
      </Sheet>
    </Screen>
  );
}
