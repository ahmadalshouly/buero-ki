import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppState } from "react-native";
import { authStorage } from "./storage";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// Without Supabase settings the app runs in demo mode with local sample data.
export const isDemo = !supabaseUrl || !supabaseKey;

export const supabase: SupabaseClient | null = isDemo
  ? null
  : createClient(supabaseUrl!, supabaseKey!, {
    auth: {
      storage: authStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

if (supabase) {
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
