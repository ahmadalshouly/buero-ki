import { useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { Button, ErrorBox, Field, Muted, Screen, Segmented, Txt } from "@/components/ui";
import { initialLanguage } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { space } from "@/lib/theme";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD = 8;

type Mode = "signIn" | "signUp";

export default function SignIn() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const cleanEmail = email.trim().toLowerCase();
  const validEmail = EMAIL.test(cleanEmail);
  const validPassword = password.length >= MIN_PASSWORD;
  const ready = validEmail && (mode === "signIn" ? password.length > 0 : validPassword);

  function friendly(message: string): string {
    if (/invalid login credentials/i.test(message)) return t("auth.wrongPassword");
    if (/already registered|already been registered|user already exists/i.test(message)) return t("auth.emailTaken");
    if (/email not confirmed/i.test(message)) return t("auth.confirmEmail");
    return message;
  }

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    if (mode === "signIn") {
      const { error } = await supabase!.auth.signInWithPassword({ email: cleanEmail, password });
      if (error) setError(friendly(error.message));
    } else {
      const { data, error } = await supabase!.auth.signUp({
        email: cleanEmail,
        password,
        options: { data: { language: initialLanguage } },
      });
      if (error) setError(friendly(error.message));
      // With email confirmation switched on in Supabase there is no session yet.
      else if (!data.session) setNotice(t("auth.confirmEmail"));
    }
    setBusy(false);
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen padTop>
        <View style={{ gap: space(2), marginTop: space(10), marginBottom: space(2) }}>
          <Txt variant="title" tone="accent" style={{ fontSize: 38, lineHeight: 44 }}>BüroKI</Txt>
          <Txt variant="h3">{t("common.tagline")}</Txt>
        </View>

        <Segmented<Mode>
          value={mode}
          onChange={switchMode}
          options={[
            { value: "signIn", label: t("auth.signInTab") },
            { value: "signUp", label: t("auth.signUpTab") },
          ]}
        />

        <Field
          label={t("auth.email")}
          ltr
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType={mode === "signUp" ? "username" : "emailAddress"}
          placeholder="name@example.com"
          returnKeyType="next"
          error={email.length > 4 && !validEmail && email.includes("@") ? t("auth.emailInvalid") : null}
        />
        <Field
          label={t("auth.password")}
          ltr
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={mode === "signUp" ? "new-password" : "current-password"}
          textContentType={mode === "signUp" ? "newPassword" : "password"}
          returnKeyType="go"
          onSubmitEditing={submit}
          hint={mode === "signUp" ? t("auth.passwordHint", { count: MIN_PASSWORD }) : undefined}
          error={mode === "signUp" && password.length > 0 && !validPassword ? t("auth.passwordHint", { count: MIN_PASSWORD }) : null}
        />
        <Button
          title={mode === "signIn" ? t("auth.signIn") : t("auth.createAccount")}
          onPress={submit}
          loading={busy}
          disabled={!ready}
        />

        {error && <ErrorBox message={error} />}
        {notice && <Muted>{notice}</Muted>}
        <Txt variant="small" tone="faint" style={{ textAlign: "center" }}>{t("auth.privacy")}</Txt>
      </Screen>
    </KeyboardAvoidingView>
  );
}
