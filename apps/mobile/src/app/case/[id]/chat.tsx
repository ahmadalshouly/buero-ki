import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Markdown } from "@/components/Markdown";
import { ErrorBox, Muted } from "@/components/ui";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { colors, radius, space, type } from "@/lib/theme";
import type { ChatMessage } from "@/lib/types";

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useRef<FlatList<ChatMessage>>(null);
  const { data, setData } = useLoad(() => api.listMessages(id), [id]);
  const messages = data ?? [];

  async function send() {
    const message = text.trim();
    if (!message || sending) return;
    setText("");
    setError(null);
    setSending(true);
    const pending: ChatMessage = { id: `local-${Date.now()}`, case_id: id, role: "user", content: message, created_at: new Date().toISOString() };
    setData([...messages, pending]);
    try {
      const reply = await api.sendMessage(id, message);
      setData([...messages, pending, reply]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["bottom", "left", "right"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={100}>
        <FlatList
          ref={list}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={<Muted>{t("chat.empty")}</Muted>}
          ListFooterComponent={
            <>
              {sending && <Muted>{t("chat.thinking")}</Muted>}
              {error && <ErrorBox message={error} />}
            </>
          }
          renderItem={({ item }) => (
            <View style={[styles.bubble, item.role === "user" ? styles.mine : styles.theirs]}>
              {item.role === "user" ? (
                <Text style={[type.body, { color: colors.accentInk }]}>{item.content}</Text>
              ) : (
                <Markdown text={item.content} />
              )}
            </View>
          )}
        />
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder={t("chat.placeholder")}
            placeholderTextColor={colors.muted}
            multiline
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("chat.send")}
            onPress={send}
            disabled={!text.trim() || sending}
            style={[styles.send, (!text.trim() || sending) && { opacity: 0.4 }]}
          >
            <Ionicons name="arrow-up" size={22} color={colors.accentInk} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  list: { padding: space(4), gap: space(3), width: "100%", maxWidth: 640, alignSelf: "center" },
  bubble: { padding: space(3.5), borderRadius: radius.md, maxWidth: "88%" },
  mine: { alignSelf: "flex-end", backgroundColor: colors.accent },
  theirs: { alignSelf: "flex-start", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space(2),
    padding: space(3),
    borderTopWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  input: { flex: 1, maxHeight: 140, fontSize: 16, color: colors.ink, paddingVertical: space(2.5), paddingHorizontal: space(3), backgroundColor: colors.bg, borderRadius: radius.md },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
});
