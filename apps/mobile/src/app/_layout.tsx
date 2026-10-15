import "@/lib/i18n";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { router, Stack } from "expo-router";
import { LocaleDirContext } from "expo-router/react-navigation";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Platform, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { FeedbackProvider } from "@/components/feedback";
import { ErrorBox, Loading } from "@/components/ui";
import { useRtl } from "@/lib/direction";
import { friendlyError } from "@/lib/errorText";
import { SCRIPT_FONTS, scriptFont, setScriptFontsReady } from "@/lib/fonts";
import { LockGate } from "@/lib/lock";
import { Notifications } from "@/lib/notifications";
import { usePrefs } from "@/lib/prefs";
import { persister, queryClient, shouldPersist, useTasks } from "@/lib/queries";
import { syncReminders } from "@/lib/reminders";
import { SessionProvider, useMe, useSession } from "@/lib/session";
import { useColors, useScheme } from "@/lib/theme";

/** Keeps the phone's scheduled deadline reminders in line with open tasks. */
function ReminderSync() {
  const { t } = useTranslation();
  const { reminders } = usePrefs();
  const { data: tasks } = useTasks({ openOnly: true });
  useEffect(() => {
    if (!tasks) return;
    syncReminders(tasks, reminders, (r) => ({
      title: t(r.kind === "today" ? "reminders.todayTitle" : "reminders.soonTitle"),
      body: r.title,
    })).catch(() => {});
  }, [tasks, reminders, t]);

  useEffect(() => {
    if (!Notifications) return;
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const caseId = res.notification.request.content.data?.caseId;
      if (typeof caseId === "string") router.push(`/case/${caseId}`);
    });
    return () => sub.remove();
  }, []);
  return null;
}

function RootStack() {
  const { ready, signedIn } = useSession();
  const { profile, loading, error, refetch } = useMe();
  const { t } = useTranslation();
  const c = useColors();
  const titleFont = scriptFont(useRtl(), { fontWeight: "600" })?.fontFamily;
  const scheme = useScheme();
  if (!ready || (signedIn && loading)) {
    return <View style={{ flex: 1, backgroundColor: c.bg, justifyContent: "center" }}><Loading /></View>;
  }
  if (signedIn && !profile && error) {
    // Without a profile we cannot tell onboarding from the app, so offer a retry.
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, justifyContent: "center", padding: 24 }}>
        <ErrorBox message={friendlyError(error, t)} onRetry={refetch} />
      </View>
    );
  }
  const onboarded = !!profile?.onboarded_at;

  return (
    <>
      {signedIn && onboarded && <ReminderSync />}
      <Stack
        screenOptions={{
          // iOS: a translucent header that content scrolls under, like system apps.
          ...(Platform.OS === "ios"
            ? { headerTransparent: true, headerBlurEffect: scheme === "dark" ? "systemChromeMaterialDark" : "systemChromeMaterialLight" }
            : { headerStyle: { backgroundColor: c.bg } }),
          headerTintColor: c.accent,
          headerTitleStyle: titleFont ? { color: c.ink, fontFamily: titleFont } : { color: c.ink, fontWeight: "600" },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: "minimal",
          contentStyle: { backgroundColor: c.bg },
        }}
      >
        <Stack.Protected guard={signedIn && onboarded}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false, title: "BüroKI" }} />
          <Stack.Screen name="search" options={{ title: t("search.title") }} />
          <Stack.Screen name="memory" options={{ title: t("memory.title") }} />
          <Stack.Screen name="case/new" options={{ title: t("newCase.title"), presentation: "modal" }} />
          <Stack.Screen name="case/[id]/index" options={{ title: "" }} />
          <Stack.Screen name="case/[id]/edit" options={{ title: t("newCase.editTitle"), presentation: "modal" }} />
          <Stack.Screen name="case/[id]/scan" options={{ title: t("scan.title"), presentation: "modal" }} />
          <Stack.Screen name="case/[id]/task" options={{ title: t("case.addTask"), presentation: "modal" }} />
          <Stack.Screen name="case/[id]/chat" options={{ title: t("chat.title") }} />
          <Stack.Screen name="case/[id]/draft" options={{ title: t("draft.newTitle"), presentation: "modal" }} />
          <Stack.Screen name="document/[id]" options={{ title: t("document.title") }} />
          <Stack.Screen name="draft/[id]" options={{ title: t("case.drafts") }} />
          <Stack.Screen name="form/[id]" options={{ title: t("form.title") }} />
          <Stack.Screen name="help/[kind]" options={{ title: t("help.title") }} />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !onboarded}>
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Screen name="auth" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

function Themed() {
  const scheme = useScheme();
  const c = useColors();
  useEffect(() => {
    if (Platform.OS === "web") document.body.style.backgroundColor = c.bg;
  }, [c.bg]);
  const rtl = useRtl();
  return (
    // Direction is set here, not only natively, so Arabic and Farsi lay out right-to-left at once.
    <View style={{ flex: 1, backgroundColor: c.bg, direction: rtl ? "rtl" : "ltr" }}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <LocaleDirContext.Provider value={rtl ? "rtl" : "ltr"}>
        <FeedbackProvider>
          <LockGate>
            <RootStack />
          </LockGate>
        </FeedbackProvider>
      </LocaleDirContext.Provider>
    </View>
  );
}

export default function RootLayout() {
  // The files are bundled, so this is quick; without them Arabic falls back to the system font.
  const [fontsLoaded, fontError] = useFonts(SCRIPT_FONTS);
  setScriptFontsReady(fontsLoaded);
  if (!fontsLoaded && !fontError) return null;
  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: 7 * 24 * 3600_000,
          buster: "2",
          dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === "success" && shouldPersist(q.queryKey) },
        }}
      >
        <SessionProvider>
          <Themed />
        </SessionProvider>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}
