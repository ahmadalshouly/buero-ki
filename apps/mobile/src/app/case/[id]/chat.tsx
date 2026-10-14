import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FactSuggestions } from "@/components/FactSuggestions";
import { Backdrop, GlassFill } from "@/components/glass";
import { Markdown } from "@/components/Markdown";
import { Chip, ErrorBox, Muted, Skeleton, Txt } from "@/components/ui";
import { useInputDir } from "@/lib/direction";
import { friendlyError } from "@/lib/errorText";
import { useMessages, useSendMessage } from "@/lib/queries";
import { makeStyles } from "@/lib/styles";
import { radius, space } from "@/lib/theme";
import type { ChatAction, ChatMessage } from "@/lib/types";

const useStyles = makeStyles((c) => ({
  list: { padding: space(4), gap: space(3), width: "100%", maxWidth: 680, alignSelf: "center", flexGrow: 1 },
  bubble: { paddingVertical: space(2.5), paddingHorizontal: space(3.5), borderRadius: radius.md, borderCurve: "continuous" },
  mine: { alignSelf: "flex-end", maxWidth: "85%", backgroundColor: c.accent, borderBottomEndRadius: 6 },
  // Answers use the full width, like a document: long German words have room,
  // and the text never has to fit a bubble that sized itself to the first line.
  theirs: {
    alignSelf: "stretch", backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.glassEdge,
    paddingVertical: space(3.5), paddingHorizontal: space(4),
  },
  author: { flexDirection: "row", alignItems: "center", gap: space(1.5), marginBottom: space(2) },
  avatar: { width: 22, height: 22, borderRadius: 7, borderCurve: "continuous", backgroundColor: c.accent, alignItems: "center", justifyContent: "center" },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space(2),
    paddingHorizontal: space(3),
    paddingVertical: space(2),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: c.line,
    backgroundColor: Platform.OS === "android" ? c.glassFill : undefined,
  },
  input: {
    flex: 1, maxHeight: 140, fontSize: 17, color: c.ink, paddingTop: space(2.5), paddingBottom: space(2.5), paddingHorizontal: space(4),
    backgroundColor: c.raised, borderRadius: 22, outlineWidth: 0,
    // Above the composer's blur layer on the web, where it would otherwise cover the field.
    position: "relative", zIndex: 1,
  },
  actions: { alignSelf: "stretch", gap: space(1.5), marginTop: -space(1) },
  action: {
    flexDirection: "row", alignItems: "center", gap: space(2), paddingVertical: space(1.5), paddingHorizontal: space(3),
    borderRadius: radius.md, borderCurve: "continuous", backgroundColor: c.accentSoft,
  },
  send: {
    width: 40, height: 40, margin: 2, borderRadius: 20, backgroundColor: c.accent, alignItems: "center", justifyContent: "center",
    position: "relative", zIndex: 1,
  },
}));

const ACTION_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  task_added: "add-circle-outline",
  task_updated: "create-outline",
  task_done: "checkmark-circle-outline",
  task_removed: "trash-outline",
};

/** What the assistant changed while answering, shown under its answer. */
function Actions({ actions }: { actions: ChatAction[] }) {
  const { t } = useTranslation();
  const s = useStyles();
  return (
    <View style={s.actions}>
      {actions.map((a, i) => (
        <View key={i} style={s.action}>
          <Ionicons name={ACTION_ICONS[a.kind] ?? "sparkles-outline"} size={16} color={s.c.accent} />
          <Txt variant="small" style={{ flexShrink: 1 }}>
            {t(`chat.actions.${a.kind}`, { title: a.title, defaultValue: a.title })}
          </Txt>
        </View>
      ))}
    </View>
  );
}

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const s = useStyles();
  const inputDir = useInputDir();
  const [text, setText] = useState("");
  const [pending, setPending] = useState<ChatMessage | null>(null);
  const [streamed, setStreamed] = useState("");
  const latest = useRef("");
  const frame = useRef<number | null>(null);
  const list = useRef<FlatList<ChatMessage>>(null);
  const messages = useMessages(id);
  const send = useSendMessage(id);

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  // Show the question and the answer as it is written, until the refreshed list contains them.
  const showPending = pending && (send.isPending || messages.isFetching);
  const answer: ChatMessage | null = showPending && streamed
    ? { id: "streaming", case_id: id, role: "assistant", content: streamed, created_at: "" }
    : null;
  const shown = [...(messages.data ?? []), ...(showPending ? [pending] : []), ...(answer ? [answer] : [])];

  // Many small pieces arrive per second; draw at most once per frame.
  function onText(soFar: string) {
    latest.current = soFar;
    frame.current ??= requestAnimationFrame(() => {
      frame.current = null;
      setStreamed(latest.current);
    });
  }
  const examples = t("chat.examples", { returnObjects: true }) as string[];

  function submit(value = text) {
    const message = value.trim();
    if (!message || send.isPending) return;
    setText("");
    setPending({ id: "pending", case_id: id, role: "user", content: message, created_at: "" });
    setStreamed("");
    send.mutate({ text: message, onText }, {
      onError: () => {
        if (frame.current !== null) cancelAnimationFrame(frame.current);
        frame.current = null;
        setStreamed("");
        setPending(null);
        setText(message);
      },
    });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: s.c.bg }} edges={["bottom", "left", "right"]}>
      <Backdrop />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={100}>
        <FlatList
          ref={list}
          data={shown}
          keyExtractor={(m) => m.id}
          contentContainerStyle={s.list}
          contentInsetAdjustmentBehavior="automatic"
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
          ListHeaderComponent={<Txt variant="small" tone="faint" style={{ textAlign: "center" }}>{t("chat.disclaimer")}</Txt>}
          ListEmptyComponent={messages.isPending ? (
            <View style={{ gap: space(3) }}>
              <Skeleton height={44} width="70%" />
              <Skeleton height={80} width="85%" style={{ alignSelf: "flex-end" }} />
            </View>
          ) : (
            <View style={{ gap: space(3), marginTop: space(6) }}>
              <Muted>{t("chat.empty")}</Muted>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }}>
                {examples.map((ex) => <Chip key={ex} label={ex} selected={false} onPress={() => submit(ex)} />)}
              </View>
            </View>
          )}
          ListFooterComponent={(
            <View style={{ gap: space(3) }}>
              {send.isPending && !streamed && (
                <View style={[s.bubble, s.theirs]}>
                  <Muted>{t("chat.thinking")}</Muted>
                </View>
              )}
              {send.error && <ErrorBox message={friendlyError(send.error, t)} />}
              <FactSuggestions caseId={id} messages={messages.data} />
            </View>
          )}
          renderItem={({ item }) => (
            <View style={{ gap: space(3) }}>
              {!!item.content && (
                <View style={[s.bubble, item.role === "user" ? s.mine : s.theirs]}>
                  {item.role === "user" ? (
                    <Txt tone="accentInk" selectable>{item.content}</Txt>
                  ) : (
                    <>
                      <View style={s.author}>
                        <View style={s.avatar}><Ionicons name="sparkles" size={12} color={s.c.accentInk} /></View>
                        <Txt variant="caption" tone="muted" style={{ fontWeight: "600" }}>BüroKI</Txt>
                      </View>
                      <Markdown text={item.content} />
                    </>
                  )}
                </View>
              )}
              {!!item.actions?.length && <Actions actions={item.actions} />}
            </View>
          )}
        />
        <View style={s.composer}>
          <GlassFill round={0} material="chrome" />
          <TextInput
            style={[s.input, inputDir]}
            value={text}
            onChangeText={setText}
            placeholder={t("chat.placeholder")}
            placeholderTextColor={s.c.faint}
            accessibilityLabel={t("chat.placeholder")}
            multiline
            maxLength={4000}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("chat.send")}
            onPress={() => submit()}
            disabled={!text.trim() || send.isPending}
            style={[s.send, (!text.trim() || send.isPending) && { opacity: 0.4 }]}
          >
            <Ionicons name="arrow-up" size={22} color={s.c.accentInk} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
