import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Markdown } from "@/components/Markdown";
import { Chip, ErrorBox, Muted, Skeleton, Txt } from "@/components/ui";
import { friendlyError } from "@/lib/errorText";
import { useMessages, useSendMessage } from "@/lib/queries";
import { makeStyles } from "@/lib/styles";
import { radius, space } from "@/lib/theme";
import type { ChatMessage } from "@/lib/types";

const useStyles = makeStyles((c) => ({
  list: { padding: space(4), gap: space(3), width: "100%", maxWidth: 680, alignSelf: "center", flexGrow: 1 },
  bubble: { padding: space(3.5), borderRadius: radius.md, maxWidth: "88%" },
  mine: { alignSelf: "flex-end", backgroundColor: c.accent, borderBottomRightRadius: 4 },
  theirs: { alignSelf: "flex-start", backgroundColor: c.card, borderWidth: 1, borderColor: c.line, borderBottomLeftRadius: 4 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space(2),
    padding: space(3),
    borderTopWidth: 1,
    borderColor: c.line,
    backgroundColor: c.card,
  },
  input: {
    flex: 1, maxHeight: 140, fontSize: 16, color: c.ink, paddingVertical: space(2.5), paddingHorizontal: space(3),
    backgroundColor: c.bg, borderRadius: radius.md, outlineWidth: 0,
  },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.accent, alignItems: "center", justifyContent: "center" },
}));

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const s = useStyles();
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
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={100}>
        <FlatList
          ref={list}
          data={shown}
          keyExtractor={(m) => m.id}
          contentContainerStyle={s.list}
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
            </View>
          )}
          renderItem={({ item }) => (
            <View style={[s.bubble, item.role === "user" ? s.mine : s.theirs]}>
              {item.role === "user" ? (
                <Txt tone="accentInk" selectable>{item.content}</Txt>
              ) : (
                <Markdown text={item.content} />
              )}
            </View>
          )}
        />
        <View style={s.composer}>
          <TextInput
            style={s.input}
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
