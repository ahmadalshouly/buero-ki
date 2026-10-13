import * as Application from "expo-application";
import { useState, type ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useFeedback } from "@/components/feedback";
import {
  Button, Chip, DemoBanner, Field, Group, ListRow, Muted, Screen, Section, Segmented, Sheet, StatTile, SwitchRow, Txt,
} from "@/components/ui";
import { api, TERMS_VERSION } from "@/lib/api";
import { formatDate, setLanguage } from "@/lib/i18n";
import { authenticate, canUseBiometrics, lockSupported } from "@/lib/lock";
import { setPrefs, usePrefs, type Prefs } from "@/lib/prefs";
import { errorMessage, keys, queryClient, useUsage } from "@/lib/queries";
import { ensurePermission, supported as remindersSupported } from "@/lib/reminders";
import { saveJson } from "@/lib/saveFile";
import { useMe, useSession } from "@/lib/session";
import { isDemo } from "@/lib/supabase";
import { space } from "@/lib/theme";
import { LANGUAGES, type Language } from "@/lib/types";

/** A text field that saves when it loses focus. Re-keyed when the saved value changes. */
function SavedField({
  saved, onSave, ...props
}: Omit<ComponentProps<typeof Field>, "value" | "onChangeText"> & { saved: string | null | undefined; onSave: (v: string | null) => void }) {
  const [value, setValue] = useState(saved ?? "");
  return (
    <Field {...props} value={value} onChangeText={setValue}
      onBlur={() => value.trim() !== (saved ?? "") && onSave(value.trim() || null)} />
  );
}

export default function Settings() {
  const { t, i18n } = useTranslation();
  const { profile } = useMe();
  const { email, signOut } = useSession();
  const { toast, confirm } = useFeedback();
  const prefs = usePrefs();
  const usage = useUsage();
  const [needsRestart, setNeedsRestart] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteWord, setDeleteWord] = useState("");


  async function update(patch: Parameters<typeof api.updateProfile>[0], message = t("common.saved")) {
    try {
      await api.updateProfile(patch);
      await queryClient.invalidateQueries({ queryKey: keys.profile });
      toast(message);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  async function chooseLanguage(lang: Language) {
    if (setLanguage(lang)) setNeedsRestart(true);
    await update({ language: lang });
  }

  async function toggleReminders(on: boolean) {
    if (on && !(await ensurePermission())) {
      toast(t("settings.remindersDenied"), "error");
      return;
    }
    setPrefs({ reminders: on });
  }

  async function toggleLock(on: boolean) {
    if (on) {
      if (!(await canUseBiometrics())) {
        toast(t("settings.appLockUnavailable"), "error");
        return;
      }
      if (!(await authenticate(t("lock.prompt")))) return;
    }
    setPrefs({ appLock: on });
  }

  async function toggleConsent() {
    if (profile?.ai_consent_at) {
      const yes = await confirm({ title: t("settings.withdrawConfirm"), message: t("settings.withdrawText"), confirm: t("settings.withdrawAi"), destructive: true });
      if (yes) await update({ ai_consent_at: null });
    } else {
      await update({ ai_consent_at: new Date().toISOString(), terms_version: TERMS_VERSION });
    }
  }

  async function exportData() {
    setExporting(true);
    try {
      const data = await api.exportData();
      await saveJson(`bueroki-export-${new Date().toISOString().slice(0, 10)}.json`, data);
      toast(t("settings.exported"));
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setExporting(false);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    try {
      await api.deleteAccount();
      setDeleteOpen(false);
      toast(t("settings.deleted"));
      await signOut();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setDeleting(false);
    }
  }

  const u = usage.data;
  const version = Application.nativeApplicationVersion ?? "1.0.0";

  return (
    <Screen padTop>
      <Txt variant="title">{t("settings.title")}</Txt>
      <DemoBanner />

      <Section title={t("settings.profile")}>
        <SavedField key={`name-${profile?.full_name}`} label={t("settings.name")} saved={profile?.full_name} autoComplete="name"
          onSave={(v) => update({ full_name: v })} />
        <SavedField key={`city-${profile?.city}`} label={t("settings.city")} saved={profile?.city}
          placeholder={t("onboarding.cityPlaceholder")} onSave={(v) => update({ city: v })} />
      </Section>

      <Section title={t("settings.language")}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }}>
          {LANGUAGES.map((l) => (
            <Chip key={l.code} label={l.name} selected={i18n.language === l.code} onPress={() => chooseLanguage(l.code)} />
          ))}
        </View>
        {needsRestart && <Muted>{t("settings.restart")}</Muted>}
      </Section>

      <Section title={t("settings.appearance")}>
        <Segmented<Prefs["theme"]>
          value={prefs.theme}
          onChange={(theme) => setPrefs({ theme })}
          options={[
            { value: "system", label: t("settings.themeSystem") },
            { value: "light", label: t("settings.themeLight") },
            { value: "dark", label: t("settings.themeDark") },
          ]}
        />
      </Section>

      {(remindersSupported || lockSupported) && (
        <Section title={t("settings.security")}>
          <Group>
            {remindersSupported && (
              <SwitchRow icon="notifications-outline" title={t("settings.reminders")} subtitle={t("settings.remindersText")}
                value={prefs.reminders} onChange={toggleReminders} />
            )}
            {lockSupported && (
              <SwitchRow icon="finger-print" title={t("settings.appLock")} subtitle={t("settings.appLockText")}
                value={prefs.appLock} onChange={toggleLock} />
            )}
          </Group>
        </Section>
      )}

      <Section title={t("settings.usage")} action={u ? <Muted>{t("settings.plan", { plan: u.plan })}</Muted> : undefined}>
        <View style={{ flexDirection: "row", gap: space(3), flexWrap: "wrap" }}>
          <StatTile label={t("settings.usageLetters")} value={u ? `${u.used["analyze-document"]}/${u.limits["analyze-document"]}` : "–"} />
          <StatTile label={t("settings.usageDrafts")} value={u ? `${u.used["draft-reply"]}/${u.limits["draft-reply"]}` : "–"} />
          <StatTile label={t("settings.usageChat")} value={u ? `${u.used["case-chat"]}/${u.limits["case-chat"]}` : "–"} />
        </View>
      </Section>

      <Section title={t("settings.privacy")}>
        <Group>
          <ListRow
            icon="sparkles-outline"
            title={t("settings.aiConsent")}
            subtitle={profile?.ai_consent_at
              ? t("settings.aiConsentOn", { date: formatDate(profile.ai_consent_at) })
              : t("settings.aiConsentOff")}
            chevron={false}
            right={(
              <Button small variant={profile?.ai_consent_at ? "ghost" : "primary"}
                title={profile?.ai_consent_at ? t("settings.withdrawAi") : t("settings.allowAi")} onPress={toggleConsent} />
            )}
          />
          <ListRow icon="download-outline" title={t("settings.export")} subtitle={t("settings.exportText")}
            onPress={exporting ? undefined : exportData} />
          {!isDemo && (
            <ListRow icon="trash-outline" destructive title={t("settings.deleteAccount")} subtitle={t("settings.deleteAccountText")}
              onPress={() => setDeleteOpen(true)} />
          )}
        </Group>
      </Section>

      <View style={{ gap: space(2) }}>
        {email && <Muted>{t("settings.signedInAs", { email })}</Muted>}
        {!isDemo && <Button variant="secondary" icon="log-out-outline" title={t("settings.signOut")} onPress={signOut} />}
        <Muted>{t("settings.about")}</Muted>
        <Txt variant="small" tone="faint">{t("settings.version", { version })}</Txt>
      </View>

      <Sheet visible={deleteOpen} onClose={() => setDeleteOpen(false)} title={t("settings.deleteConfirm")}>
        <Txt tone="muted">{t("settings.deleteConfirmText")}</Txt>
        <Button variant="secondary" icon="download-outline" title={t("settings.export")} onPress={exportData} loading={exporting} />
        <Field label={t("settings.deleteType")} value={deleteWord} onChangeText={setDeleteWord} autoCapitalize="characters" autoCorrect={false} />
        <Button variant="danger" icon="trash-outline" title={t("settings.deleteAccount")} onPress={deleteAccount}
          loading={deleting} disabled={deleteWord.trim() !== "DELETE"} />
      </Sheet>
    </Screen>
  );
}
