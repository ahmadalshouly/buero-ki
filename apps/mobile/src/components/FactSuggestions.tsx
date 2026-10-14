import { type ReactNode, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Button, Card, Txt } from "@/components/ui";
import { useDecideFact, useFacts, useLearnFacts } from "@/lib/queries";
import { useMe } from "@/lib/session";
import { space } from "@/lib/theme";
import type { ChatMessage } from "@/lib/types";

/**
 * After each new answer in the chat, asks the agent whether the person said something
 * worth remembering, and shows each suggestion with Remember / Don't remember.
 * Nothing is used by the agent until the person keeps it.
 */
export function FactSuggestions({ caseId, messages }: { caseId: string; messages: ChatMessage[] | undefined }) {
  const { profile } = useMe();
  const learn = useLearnFacts(caseId);
  const lastAnswer = messages && (messages.filter((m) => m.role === "assistant" && !m.id.startsWith("pending")).at(-1)?.id ?? null);
  // undefined until the list loads; answers already there when the chat opened were handled before.
  const seen = useRef<string | null | undefined>(undefined);
  const learnEnabled = profile?.memory_enabled !== false;
  const { mutate } = learn;

  useEffect(() => {
    if (lastAnswer === undefined) return;
    if (seen.current === undefined) {
      seen.current = lastAnswer;
      return;
    }
    if (lastAnswer && lastAnswer !== seen.current) {
      seen.current = lastAnswer;
      if (learnEnabled) mutate();
    }
  }, [lastAnswer, learnEnabled, mutate]);

  return <PendingFacts caseId={caseId} />;
}

/** Each suggestion from this case still waiting for an answer, with Remember / Don't remember. */
export function PendingFacts({ caseId, empty = null }: { caseId: string; empty?: ReactNode }) {
  const { t } = useTranslation();
  const facts = useFacts();
  const decide = useDecideFact();
  const pending = (facts.data ?? []).filter((f) => f.status === "pending" && f.case_id === caseId);
  if (!pending.length) return <>{empty}</>;

  return (
    <View style={{ gap: space(3) }}>
      {pending.map((fact) => (
        <Card key={fact.id} style={{ gap: space(2) }}>
          <Txt variant="h3">{t("memory.ask")}</Txt>
          <Txt selectable>{fact.fact}</Txt>
          <Txt variant="small" tone="muted">{t("memory.askText")}</Txt>
          <View style={{ flexDirection: "row", gap: space(2), flexWrap: "wrap" }}>
            <Button small icon="bookmark-outline" title={t("memory.keep")} onPress={() => decide.mutate({ fact, keep: true })} />
            <Button small variant="ghost" title={t("memory.ignore")} onPress={() => decide.mutate({ fact, keep: false })} />
          </View>
        </Card>
      ))}
    </View>
  );
}
