import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useFeedback } from "@/components/feedback";
import { Button, EmptyState, ErrorBox, Group, IconButton, ListRow, Muted, Screen, Section, SkeletonList, SwitchRow } from "@/components/ui";
import { api } from "@/lib/api";
import { friendlyError } from "@/lib/errorText";
import { errorMessage, keys, queryClient, useDecideFact, useFacts } from "@/lib/queries";
import { useMe } from "@/lib/session";
import { space, useColors } from "@/lib/theme";
import type { FactCategory, UserFact } from "@/lib/types";

/** Everything BüroKI remembers about the person, with keep, forget and an off switch (GDPR Art. 7, 15, 17). */
export default function Memory() {
  const { t } = useTranslation();
  const c = useColors();
  const { profile } = useMe();
  const { toast, confirm } = useFeedback();
  const facts = useFacts();
  const decide = useDecideFact();
  const kept = (facts.data ?? []).filter((f) => f.status === "kept");
  const pending = (facts.data ?? []).filter((f) => f.status === "pending");
  const label = (cat: FactCategory) => t(`memory.categories.${cat}`);
  const subtitle = (f: UserFact) => [label(f.category), f.origin && t(`memory.origins.${f.origin}`)].filter(Boolean).join(" · ");

  async function setLearning(on: boolean) {
    try {
      await api.updateProfile({ memory_enabled: on });
      await queryClient.invalidateQueries({ queryKey: keys.profile });
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  function decideFact(fact: UserFact, keep: boolean) {
    decide.mutate({ fact, keep }, {
      onSuccess: () => toast(t(keep ? "memory.kept" : "memory.forgotten")),
      onError: (e) => toast(errorMessage(e), "error"),
    });
  }

  async function forgetAll() {
    const yes = await confirm({
      title: t("memory.forgetAllConfirm"), message: t("memory.forgetAllText"), confirm: t("memory.forgetAll"), destructive: true,
    });
    if (!yes) return;
    try {
      await api.forgetAllFacts();
      await queryClient.invalidateQueries({ queryKey: keys.facts });
      toast(t("memory.forgotten"));
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  return (
    <Screen refreshing={facts.isRefetching} onRefresh={facts.refetch}>
      <Muted>{t("memory.intro")}</Muted>
      <Group>
        <SwitchRow icon="sparkles-outline" title={t("memory.learn")} subtitle={t("memory.learnText")}
          value={profile?.memory_enabled !== false} onChange={setLearning} />
      </Group>

      {facts.error ? <ErrorBox message={friendlyError(facts.error, t)} onRetry={facts.refetch} /> : null}
      {facts.isPending ? <SkeletonList /> : null}

      {pending.length > 0 && (
        <Section title={t("memory.waiting")}>
          <Group>
            {pending.map((f) => (
              <ListRow key={f.id} title={f.fact} subtitle={subtitle(f)} chevron={false}
                right={(
                  <View style={{ flexDirection: "row", gap: space(1) }}>
                    <Button small title={t("memory.keep")} onPress={() => decideFact(f, true)} />
                    <IconButton icon="close" label={t("memory.ignore")} color={c.muted} onPress={() => decideFact(f, false)} />
                  </View>
                )} />
            ))}
          </Group>
        </Section>
      )}

      {facts.data && (
        <Section title={t("memory.saved")}>
          {kept.length ? (
            <Group>
              {kept.map((f) => (
                <ListRow key={f.id} title={f.fact} subtitle={subtitle(f)} chevron={false}
                  right={<IconButton icon="trash-outline" label={t("memory.forget")} color={c.danger} onPress={() => decideFact(f, false)} />} />
              ))}
            </Group>
          ) : (
            <EmptyState icon="bookmark-outline" title={t("memory.emptyTitle")} text={t("memory.empty")} />
          )}
        </Section>
      )}

      {(kept.length > 0 || pending.length > 0) && (
        <Button variant="danger" icon="trash-outline" title={t("memory.forgetAll")} onPress={forgetAll} />
      )}
    </Screen>
  );
}
