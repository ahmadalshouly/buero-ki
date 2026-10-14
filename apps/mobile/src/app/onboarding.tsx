import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import { useFeedback } from "@/components/feedback";
import { Button, Chip, DemoBanner, Field, Screen, Txt } from "@/components/ui";
import { api, TERMS_VERSION } from "@/lib/api";
import { setLanguage } from "@/lib/i18n";
import { errorMessage, keys, queryClient } from "@/lib/queries";
import { useMe } from "@/lib/session";
import { radius, space, useColors } from "@/lib/theme";
import { LANGUAGES, type Language } from "@/lib/types";

const TOTAL = 3;

export default function Onboarding() {
  const { t, i18n } = useTranslation();
  const c = useColors();
  const { profile } = useMe();
  const { toast } = useFeedback();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(profile?.full_name ?? "");
  const [city, setCity] = useState(profile?.city ?? "");
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [restartNote, setRestartNote] = useState(false);

  function chooseLanguage(lang: Language) {
    if (setLanguage(lang)) setRestartNote(true);
  }

  async function finish(withConsent: boolean) {
    setSaving(true);
    try {
      const at = new Date().toISOString();
      await api.updateProfile({
        language: i18n.language as Language,
        full_name: name.trim() || null,
        city: city.trim() || null,
        onboarded_at: at,
        ...(withConsent ? { ai_consent_at: at, terms_version: TERMS_VERSION } : {}),
      });
      await queryClient.invalidateQueries({ queryKey: keys.profile });
    } catch (e) {
      toast(errorMessage(e), "error");
      setSaving(false);
    }
  }

  const points = t("onboarding.consentPoints", { returnObjects: true }) as string[];
  const icons = ["lock-closed-outline", "sparkles-outline", "download-outline", "information-circle-outline"] as const;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen padTop>
        <DemoBanner />
        <View style={{ flexDirection: "row", gap: space(1.5) }} accessibilityLabel={t("onboarding.step", { n: step + 1, total: TOTAL })}>
          {Array.from({ length: TOTAL }, (_, i) => (
            <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? c.accent : c.line }} />
          ))}
        </View>

        {step === 0 && (
          <>
            <View style={{ gap: space(2) }}>
              <Txt variant="title" tone="accent" style={{ fontSize: 34, lineHeight: 40 }}>BüroKI</Txt>
              <Txt variant="h2">{t("onboarding.welcomeTitle")}</Txt>
              <Txt tone="muted">{t("onboarding.welcomeText")}</Txt>
            </View>
            <View style={{ gap: space(3) }}>
              <Txt variant="h3">{t("onboarding.languageTitle")}</Txt>
              <Txt variant="small" tone="muted">{t("onboarding.languageText")}</Txt>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }}>
                {LANGUAGES.map((l) => (
                  <Chip key={l.code} label={l.name} selected={i18n.language === l.code} onPress={() => chooseLanguage(l.code)} />
                ))}
              </View>
              {restartNote && <Txt variant="small" tone="muted">{t("settings.restart")}</Txt>}
            </View>
            <Button title={t("common.next")} icon="arrow-forward" onPress={() => setStep(1)} />
          </>
        )}

        {step === 1 && (
          <>
            <View style={{ gap: space(2) }}>
              <Txt variant="title">{t("onboarding.nameTitle")}</Txt>
              <Txt tone="muted">{t("onboarding.nameText")}</Txt>
            </View>
            <Field label={t("settings.name")} value={name} onChangeText={setName} placeholder={t("onboarding.namePlaceholder")}
              autoComplete="name" autoFocus />
            <Field label={t("onboarding.city")} value={city} onChangeText={setCity} placeholder={t("onboarding.cityPlaceholder")} />
            <View style={{ flexDirection: "row", gap: space(2) }}>
              <Button style={{ flex: 1 }} variant="secondary" title={t("common.back")} onPress={() => setStep(0)} />
              <Button style={{ flex: 2 }} title={t("common.next")} icon="arrow-forward" onPress={() => setStep(2)} />
            </View>
          </>
        )}

        {step === 2 && (
          <>
            <Txt variant="title">{t("onboarding.consentTitle")}</Txt>
            <View style={{ gap: space(3) }}>
              {points.map((p, i) => (
                <View key={i} style={{ flexDirection: "row", gap: space(3), alignItems: "flex-start" }}>
                  <Ionicons name={icons[i] ?? "checkmark-circle-outline"} size={22} color={c.accent} />
                  <Txt style={{ flex: 1 }}>{p}</Txt>
                </View>
              ))}
            </View>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: agreed }}
              onPress={() => setAgreed(!agreed)}
              style={{
                flexDirection: "row", gap: space(3), alignItems: "center", padding: space(4),
                borderRadius: radius.md, borderCurve: "continuous", borderWidth: 1, borderColor: agreed ? c.accent : c.glassEdge,
                backgroundColor: agreed ? c.accentSoft : c.glassFill,
              }}
            >
              <Ionicons name={agreed ? "checkbox" : "square-outline"} size={26} color={agreed ? c.accent : c.faint} />
              <Txt variant="h3" style={{ flex: 1 }}>{t("onboarding.consentCheck")}</Txt>
            </Pressable>
            <Button title={t("onboarding.start")} icon="checkmark" onPress={() => finish(true)} disabled={!agreed} loading={saving && agreed} />
            <Button variant="ghost" title={t("onboarding.skipConsent")} onPress={() => finish(false)} disabled={saving} />
            <Txt variant="small" tone="muted" style={{ textAlign: "center" }}>{t("onboarding.skipConsentNote")}</Txt>
            <Button variant="ghost" small title={t("common.back")} onPress={() => setStep(1)} />
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
