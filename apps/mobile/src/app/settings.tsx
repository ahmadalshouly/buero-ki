import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { Button, Card, Chip, DemoBanner, Field, Muted, Screen, Section } from "@/components/ui";
import { api } from "@/lib/api";
import { setLanguage } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { isDemo } from "@/lib/supabase";
import { colors, space, type } from "@/lib/theme";
import { LANGUAGES, type Language } from "@/lib/types";

export default function Settings() {
  const { t, i18n } = useTranslation();
  const { profile, refreshProfile, signOut } = useSession();
  const [name, setName] = useState(profile?.full_name ?? "");
  const [needsRestart, setNeedsRestart] = useState(false);

  useEffect(() => setName(profile?.full_name ?? ""), [profile?.full_name]);

  async function chooseLanguage(lang: Language) {
    if (setLanguage(lang)) setNeedsRestart(true);
    await api.updateProfile({ language: lang });
    refreshProfile();
  }

  async function saveName() {
    await api.updateProfile({ full_name: name.trim() || null });
    refreshProfile();
  }

  return (
    <Screen>
      <DemoBanner />
      <Section title={t("settings.language")}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }}>
          {LANGUAGES.map((l) => (
            <Chip key={l.code} label={l.name} selected={i18n.language === l.code} onPress={() => chooseLanguage(l.code)} />
          ))}
        </View>
        {needsRestart && <Muted>{t("settings.restart")}</Muted>}
      </Section>

      <Field label={t("settings.name")} value={name} onChangeText={setName} onBlur={saveName} autoComplete="name" />

      <Card style={{ backgroundColor: colors.accentSoft, borderColor: colors.accentSoft }}>
        <Text style={type.body}>{t("settings.about")}</Text>
      </Card>

      {!isDemo && <Button variant="secondary" icon="log-out-outline" title={t("settings.signOut")} onPress={signOut} />}
    </Screen>
  );
}
