import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { setLanguage } from "./i18n";
import { queryClient, useProfile } from "./queries";
import { isDemo, supabase } from "./supabase";
import type { Profile } from "./types";

interface SessionState {
  ready: boolean;
  signedIn: boolean;
  userId: string | null;
  email: string | null;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionState>({
  ready: false,
  signedIn: false,
  userId: null,
  email: null,
  signOut: async () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(isDemo);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      // Another person may sign in on this phone next: never show them cached data.
      if (event === "SIGNED_OUT") queryClient.clear();
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase?.auth.signOut();
    queryClient.clear();
  };

  return (
    <SessionContext.Provider
      value={{
        ready,
        signedIn: isDemo || !!session,
        userId: isDemo ? "demo-user" : session?.user.id ?? null,
        email: isDemo ? "amina@example.org" : session?.user.email ?? null,
        signOut,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = () => useContext(SessionContext);

/** The signed-in person's profile, with the UI language kept in sync with it. */
export function useMe(): { profile: Profile | undefined; loading: boolean; error: unknown; refetch: () => void } {
  const { signedIn } = useSession();
  const query = useProfile(signedIn);
  const language = query.data?.language;
  useEffect(() => {
    if (signedIn && language) setLanguage(language);
  }, [signedIn, language]);
  return { profile: query.data, loading: query.isPending, error: query.error, refetch: query.refetch };
}
