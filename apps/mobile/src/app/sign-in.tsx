import * as Linking from "expo-linking";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { Button, ErrorBox, Field, Screen, Txt } from "@/components/ui";
import { initialLanguage } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { space } from "@/lib/theme";

const RESEND_SECONDS = 60;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function SignIn() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const validEmail = EMAIL.test(email.trim());

  async function sendCode() {
    if (!validEmail) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase!.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true, data: { language: initialLanguage }, emailRedirectTo: Linking.createURL("auth") },
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setStep("code");
    setCode("");
    setCooldown(RESEND_SECONDS);
  }

  async function verify(token = code) {
    setBusy(true);
    setError(null);
    const { error } = await supabase!.auth.verifyOtp({ email: email.trim().toLowerCase(), token: token.trim(), type: "email" });
    setBusy(false);
    if (error) setError(error.message);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen padTop>
        <View style={{ gap: space(2), marginTop: space(10), marginBottom: space(2) }}>
          <Txt variant="title" tone="accent" style={{ fontSize: 38, lineHeight: 44 }}>BüroKI</Txt>
          <Txt variant="h3">{t("common.tagline")}</Txt>
        </View>

        {step === "email" ? (
          <>
            <Txt tone="muted">{t("auth.intro")}</Txt>
            <Field
              label={t("auth.email")}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              placeholder="name@example.com"
              returnKeyType="send"
              onSubmitEditing={sendCode}
              error={email.length > 4 && !validEmail && email.includes("@") ? t("auth.emailInvalid") : null}
            />
            <Button title={t("auth.sendCode")} onPress={sendCode} loading={busy} disabled={!validEmail} />
          </>
        ) : (
          <>
            <Txt tone="muted">{t("auth.codeSent", { email: email.trim() })}</Txt>
            <Field
              label={t("auth.code")}
              value={code}
              onChangeText={(v) => {
                const digits = v.replace(/\D/g, "").slice(0, 8);
                setCode(digits);
                if (digits.length === 8) verify(digits);
              }}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={8}
              placeholder="123456"
              autoFocus
              style={{ fontSize: 24, letterSpacing: 8, textAlign: "center" }}
            />
            <Button title={t("auth.verify")} onPress={() => verify()} loading={busy} disabled={code.length < 6} />
            <Button
              variant="ghost"
              title={cooldown > 0 ? t("auth.resendIn", { seconds: cooldown }) : t("auth.resend")}
              onPress={sendCode}
              disabled={cooldown > 0 || busy}
            />
            <Button variant="ghost" title={t("auth.changeEmail")} onPress={() => setStep("email")} />
          </>
        )}
        {error && <ErrorBox message={error} />}
        <Txt variant="small" tone="faint" style={{ textAlign: "center" }}>{t("auth.privacy")}</Txt>
      </Screen>
    </KeyboardAvoidingView>
  );
}
