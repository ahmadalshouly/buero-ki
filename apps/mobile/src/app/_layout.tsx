import "@/lib/i18n";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import * as Notifications from "expo-notifications";
import { router, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Platform, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { FeedbackProvider } from "@/components/feedback";
import { ErrorBox, Loading } from "@/components/ui";
import { friendlyError } from "@/lib/errorText";
import { LockGate } from "@/lib/lock";
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
    if (Platform.OS === "web") return;
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
          headerStyle: { backgroundColor: c.bg },
          headerTintColor: c.accent,
          headerTitleStyle: { color: c.ink, fontWeight: "600" },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: "minimal",
          contentStyle: { backgroundColor: c.bg },
        }}
      >
        <Stack.Protected guard={signedIn && onboarded}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false, title: "BüroKI" }} />
          <Stack.Screen name="search" options={{ title: t("search.title") }} />
          <Stack.Screen name="case/new" options={{ title: t("newCase.title"), presentation: "modal" }} />
          <Stack.Screen name="case/[id]/index" options={{ title: "" }} />
          <Stack.Screen name="case/[id]/edit" options={{ title: t("newCase.editTitle"), presentation: "modal" }} />
          <Stack.Screen name="case/[id]/scan" options={{ title: t("scan.title"), presentation: "modal" }} />
          <Stack.Screen name="case/[id]/task" options={{ title: t("case.addTask"), presentation: "modal" }} />
          <Stack.Screen name="case/[id]/chat" options={{ title: t("chat.title") }} />
          <Stack.Screen name="case/[id]/draft" options={{ title: t("draft.newTitle"), presentation: "modal" }} />
          <Stack.Screen name="document/[id]" options={{ title: t("document.title") }} />
          <Stack.Screen name="draft/[id]" options={{ title: t("case.drafts") }} />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !onboarded}>
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack.Protected>
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
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <FeedbackProvider>
        <LockGate>
          <RootStack />
        </LockGate>
      </FeedbackProvider>
    </View>
  );
}

export default function RootLayout() {
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
