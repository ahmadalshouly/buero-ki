import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Button, ErrorBox, Loading, Screen } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { space } from "@/lib/theme";

/** Opened from the sign-in email link: trades the one-time code for a session. */
export default function AuthCallback() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ code?: string; error_description?: string }>();
  const [error, setError] = useState<string | null>(params.error_description ?? null);

  useEffect(() => {
    if (!params.code || !supabase) return;
    supabase.auth.exchangeCodeForSession(params.code).then(({ error }) => {
      if (error) setError(error.message);
      else router.replace("/");
    });
  }, [params.code]);

  return (
    <Screen padTop>
      {error || !params.code ? (
        <View style={{ gap: space(3), marginTop: space(10) }}>
          <ErrorBox message={error ?? t("auth.linkInvalid")} />
          <Button title={t("auth.title")} onPress={() => router.replace("/")} />
        </View>
      ) : (
        <Loading />
      )}
    </Screen>
  );
}
