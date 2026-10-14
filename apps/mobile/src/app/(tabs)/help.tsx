import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { DemoBanner, Group, ListRow, Muted, Screen, Section, Txt } from "@/components/ui";
import { WherePicker } from "@/components/help";
import { HELP_GROUPS, HELP_ICONS, helpForCases, helpParams, helpTitle, useHelpWhere } from "@/lib/help";
import { useCases } from "@/lib/queries";
import { useMe } from "@/lib/session";
import type { HelpSuggestion } from "@/lib/types";

export default function Help() {
  const { t } = useTranslation();
  const { profile } = useMe();
  const where = useHelpWhere(profile?.city);
  const cases = useCases();
  const suggested = helpForCases((cases.data ?? []).filter((x) => x.status !== "closed").map((x) => x.category));

  const row = (s: HelpSuggestion) => (
    <ListRow
      key={`${s.kind}:${s.specialty ?? ""}`}
      icon={HELP_ICONS[s.kind]}
      title={helpTitle(t, s)}
      subtitle={s.specialty ? undefined : t(`help.kindHint.${s.kind}`)}
      onPress={() => router.push({ pathname: "/help/[kind]", params: helpParams(s) })}
    />
  );

  return (
    <Screen padTop>
      <Txt variant="title">{t("help.title")}</Txt>
      <Muted>{t("help.intro")}</Muted>
      <DemoBanner />

      <WherePicker where={where} />

      {suggested.length > 0 && (
        <Section title={t("help.forYourCases")}>
          <Group>{suggested.map(row)}</Group>
        </Section>
      )}

      {HELP_GROUPS.map((g) => (
        <Section key={g.key} title={t(`help.group.${g.key}`)}>
          <Group>{g.kinds.map((kind) => row({ kind }))}</Group>
        </Section>
      ))}
    </Screen>
  );
}
