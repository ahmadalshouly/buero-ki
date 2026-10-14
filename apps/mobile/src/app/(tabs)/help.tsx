import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { DemoBanner, Group, ListRow, Muted, Screen, Section, Txt } from "@/components/ui";
import { WherePicker } from "@/components/help";
import { HELP_GROUPS, HELP_ICONS, helpForCases, useHelpWhere } from "@/lib/help";
import { useCases } from "@/lib/queries";
import { useMe } from "@/lib/session";
import type { HelpKind } from "@/lib/types";

export default function Help() {
  const { t } = useTranslation();
  const { profile } = useMe();
  const where = useHelpWhere(profile?.city);
  const cases = useCases();
  const suggested = helpForCases((cases.data ?? []).filter((x) => x.status !== "closed").map((x) => x.category));

  const row = (kind: HelpKind) => (
    <ListRow
      key={kind}
      icon={HELP_ICONS[kind]}
      title={t(`help.kind.${kind}`)}
      subtitle={t(`help.kindHint.${kind}`)}
      onPress={() => router.push({ pathname: "/help/[kind]", params: { kind } })}
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
          <Group>{g.kinds.map(row)}</Group>
        </Section>
      ))}
    </Screen>
  );
}
