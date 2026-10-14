import { Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking, View } from "react-native";
import { PlaceCard, WherePicker } from "@/components/help";
import {
  Card, Chip, DemoBanner, EmptyState, ErrorBox, Group, ListRow, Muted, Screen, Section, Segmented, SkeletonList, Txt,
} from "@/components/ui";
import { friendlyError } from "@/lib/errorText";
import { ApiError } from "@/lib/errors";
import { HELP_DIRECTORIES, helpTitle, sortForLanguage, specialtiesFor, useHelpWhere } from "@/lib/help";
import { useFindHelp } from "@/lib/queries";
import { useMe } from "@/lib/session";
import { space } from "@/lib/theme";
import { HELP_KINDS, type HelpKind, type HelpSpecialty, LANGUAGES } from "@/lib/types";

const RADII = ["2", "5", "10", "25"] as const;

export default function HelpResults() {
  const params = useLocalSearchParams<{ kind: string; caseId?: string; specialty?: string }>();
  const kind: HelpKind = (HELP_KINDS as readonly string[]).includes(params.kind) ? params.kind as HelpKind : "social";
  // Lawyers and doctors are searched by type, picked here unless the case already named one.
  const types = specialtiesFor(kind);
  const [specialty, setSpecialty] = useState<HelpSpecialty | null>(
    types.includes(params.specialty as HelpSpecialty) ? params.specialty as HelpSpecialty : null,
  );
  const mustPick = types.length > 0 && !specialty;
  const { t, i18n } = useTranslation();
  const { profile } = useMe();
  const where = useHelpWhere(profile?.city);
  const [radius, setRadius] = useState<(typeof RADII)[number]>("5");
  const [onlyMine, setOnlyMine] = useState(false);
  const query = useFindHelp(kind, where, Number(radius), specialty, !mustPick);
  const lang = i18n.language;
  const langName = LANGUAGES.find((l) => l.code === lang)?.name ?? lang;

  const places = useMemo(() => {
    const all = sortForLanguage(query.data?.places ?? [], lang);
    return onlyMine ? all.filter((p) => p.languages.includes(lang)) : all;
  }, [query.data, lang, onlyMine]);
  const anyMine = (query.data?.places ?? []).some((p) => p.languages.includes(lang));
  const directories = HELP_DIRECTORIES[kind] ?? [];

  function errorText(e: unknown) {
    if (e instanceof ApiError && e.code === "upstream") return t("help.mapUnavailable");
    return friendlyError(e, t);
  }

  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => query.refetch()}>
      <Stack.Screen options={{ title: helpTitle(t, { kind, specialty }) }} />
      <DemoBanner />
      {types.length === 0 && <Muted>{t(`help.kindHint.${kind}`)}</Muted>}

      {mustPick ? (
        <Section title={t(kind === "lawyer" ? "help.chooseLawyer" : "help.chooseDoctor")}>
          <Group>
            {types.map((s) => (
              <ListRow key={s} title={helpTitle(t, { kind, specialty: s })} onPress={() => setSpecialty(s)} />
            ))}
          </Group>
        </Section>
      ) : types.length > 0 && (
        <Group>
          <ListRow icon="options-outline" title={helpTitle(t, { kind, specialty })} subtitle={t("help.type")}
            right={<Txt variant="small" tone="accent">{t("help.change")}</Txt>} onPress={() => setSpecialty(null)} />
        </Group>
      )}

      <WherePicker where={where} label={query.data?.center.label} />

      <Segmented
        value={radius}
        onChange={setRadius}
        options={RADII.map((r) => ({ value: r, label: `${r} km` }))}
      />

      {lang !== "de" && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2), alignItems: "center" }}>
          <Chip label={t("help.onlyLanguage", { language: langName })} selected={onlyMine} onPress={() => setOnlyMine(!onlyMine)} />
        </View>
      )}

      {kind === "lawyer" && (
        <Card>
          <Txt variant="h3">{t("help.beratungshilfeTitle")}</Txt>
          <Txt variant="small">{t("help.beratungshilfeText")}</Txt>
        </Card>
      )}

      {!where || mustPick ? null : query.isPending ? (
        <View style={{ gap: space(3) }}>
          <Muted>{t("help.searching")}</Muted>
          <SkeletonList rows={3} />
        </View>
      ) : query.error ? (
        <ErrorBox message={errorText(query.error)} onRetry={() => query.refetch()} />
      ) : places.length === 0 ? (
        <EmptyState
          icon="search-outline"
          title={onlyMine ? t("help.noneInLanguage", { language: langName }) : t("help.none")}
          text={directories.length ? t("help.tryDirectory") : t("help.tryWider")}
        />
      ) : (
        <View style={{ gap: space(3) }}>
          <Muted>{t("help.found", { count: places.length })}</Muted>
          {lang !== "de" && !anyMine && <Muted>{t("help.languagesRare", { language: langName })}</Muted>}
          {kind === "lawyer" && query.data?.source === "osm" && <Muted>{t("help.lawyerTypeNote")}</Muted>}
          {places.map((p) => <PlaceCard key={p.id} place={p} speaksMine={lang !== "de" && p.languages.includes(lang)} caseId={params.caseId} />)}
        </View>
      )}

      {directories.length > 0 && (
        <Section title={t("help.directories")}>
          <Group>
            {directories.map((d) => (
              <ListRow
                key={d.url}
                icon="open-outline"
                title={t(`help.directory.${d.label}`)}
                subtitle={t(`help.directoryHint.${d.label}`)}
                onPress={() => Linking.openURL(d.url).catch(() => {})}
              />
            ))}
          </Group>
        </Section>
      )}

      {query.data && <Muted>{t(query.data.source === "google" ? "help.attributionGoogle" : "help.attribution")}</Muted>}
    </Screen>
  );
}
