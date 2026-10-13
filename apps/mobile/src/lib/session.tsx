import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
import { setLanguage } from "./i18n";
import { isDemo, supabase } from "./supabase";
import type { Profile } from "./types";

interface SessionState {
  ready: boolean;
  signedIn: boolean;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionState>({
  ready: false,
  signedIn: false,
  profile: null,
  refreshProfile: async () => {},
  signOut: async () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(isDemo);
  const [profile, setProfile] = useState<Profile | null>(null);
  const signedIn = isDemo || !!session;

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const refreshProfile = async () => {
    const p = await api.getProfile();
    setProfile(p);
    setLanguage(p.language);
  };

  useEffect(() => {
    if (signedIn) refreshProfile().catch(() => {});
    else setProfile(null);
  }, [signedIn, session?.user.id]);

  const signOut = async () => {
    await supabase?.auth.signOut();
  };

  return (
    <SessionContext.Provider value={{ ready, signedIn, profile, refreshProfile, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = () => useContext(SessionContext);
