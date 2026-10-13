import "@/lib/i18n";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Loading } from "@/components/ui";
import { SessionProvider, useSession } from "@/lib/session";
import { colors } from "@/lib/theme";

function RootStack() {
  const { ready, signedIn } = useSession();
  const { t } = useTranslation();
  if (!ready) return <Loading />;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.accent,
        headerTitleStyle: { color: colors.ink, fontWeight: "600" },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="index" options={{ title: "BüroKI", headerShown: false }} />
        <Stack.Screen name="settings" options={{ title: t("settings.title") }} />
        <Stack.Screen name="case/new" options={{ title: t("newCase.title"), presentation: "modal" }} />
        <Stack.Screen name="case/[id]/index" options={{ title: "" }} />
        <Stack.Screen name="case/[id]/chat" options={{ title: t("chat.title") }} />
        <Stack.Screen name="case/[id]/draft" options={{ title: t("draft.newTitle"), presentation: "modal" }} />
        <Stack.Screen name="document/[id]" options={{ title: t("document.title") }} />
        <Stack.Screen name="draft/[id]" options={{ title: t("case.drafts") }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <RootStack />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
