import * as Linking from "expo-linking";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Button, ErrorBox, Loading, Muted, Screen } from "@/components/ui";
import { authParams } from "@/lib/authLink";
import { supabase } from "@/lib/supabase";
import { space } from "@/lib/theme";

/** Opened from the sign-in email link: turns what the link carries into a session. */
export default function AuthCallback() {
  const { t } = useTranslation();
  const url = Linking.useLinkingURL();
  const routeParams = useLocalSearchParams<Record<string, string>>();
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    if (!supabase || handled.current) return;
    const p = { ...routeParams, ...authParams(url) };
    const fail = (message?: string) => {
      setDetail(message ?? null);
      setError(t("auth.linkInvalid"));
    };

    if (p.error || p.error_description) {
      handled.current = true;
      fail(p.error_description ?? p.error);
      return;
    }
    let work: Promise<{ error: { message: string } | null }> | null = null;
    if (p.code) work = supabase.auth.exchangeCodeForSession(p.code);
    else if (p.access_token && p.refresh_token) {
      work = supabase.auth.setSession({ access_token: p.access_token, refresh_token: p.refresh_token });
    }
    if (work) {
      handled.current = true;
      work.then(async ({ error }) => {
        // The link may already have signed the person in (opened twice).
        const { data } = await supabase!.auth.getSession();
        if (data.session) router.replace("/");
        else fail(error?.message);
      });
      return;
    }

    // Nothing in the link: wait briefly for the URL, then fall back.
    const timer = setTimeout(async () => {
      const { data } = await supabase!.auth.getSession();
      if (data.session) router.replace("/");
      else fail();
    }, 2500);
    return () => clearTimeout(timer);
  }, [url, routeParams, t]);

  return (
    <Screen padTop>
      {error ? (
        <View style={{ gap: space(3), marginTop: space(10) }}>
          <ErrorBox message={error} />
          {detail && <Muted>{detail}</Muted>}
          <Button title={t("auth.title")} onPress={() => router.replace("/")} />
        </View>
      ) : (
        <Loading />
      )}
    </Screen>
  );
}
