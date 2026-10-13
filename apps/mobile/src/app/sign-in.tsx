import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, ErrorBox, Field, Muted, styles } from "@/components/ui";
import { initialLanguage } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { colors, space, type } from "@/lib/theme";

export default function SignIn() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    setBusy(true);
    setError(null);
    const { error } = await supabase!.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true, data: { language: initialLanguage } },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setStep("code");
  }

  async function verify() {
    setBusy(true);
    setError(null);
    const { error } = await supabase!.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) setError(error.message);
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={[styles.column, { flex: 1, justifyContent: "center" }]}>
        <View style={{ gap: space(2), marginBottom: space(4) }}>
          <Text style={[type.title, { fontSize: 36, color: colors.accent }]}>BüroKI</Text>
          <Text style={type.h3}>{t("common.tagline")}</Text>
        </View>

        {step === "email" ? (
          <>
            <Muted>{t("auth.intro")}</Muted>
            <Field
              label={t("auth.email")}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              placeholder="name@example.com"
            />
            <Button title={t("auth.sendCode")} onPress={sendCode} loading={busy} disabled={!email.includes("@")} />
          </>
        ) : (
          <>
            <Muted>{t("auth.codeSent", { email })}</Muted>
            <Field
              label={t("auth.code")}
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
            />
            <Button title={t("auth.verify")} onPress={verify} loading={busy} disabled={code.trim().length < 6} />
            <Button variant="ghost" title={t("auth.changeEmail")} onPress={() => setStep("email")} />
          </>
        )}
        {error && <ErrorBox message={error} />}
      </View>
    </SafeAreaView>
  );
}
