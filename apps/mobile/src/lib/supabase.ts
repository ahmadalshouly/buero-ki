import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppState } from "react-native";
import { authStorage } from "./storage";

// The BüroKI project. The publishable key is meant to ship in the app; row level
// security protects the data. A .env file can point the app at another project.
const PROJECT_URL = "https://tvkpaoqnvjpjfaeqdzhr.supabase.co";
const PROJECT_KEY = "sb_publishable_pytX7Ko9H66Th4RnCaJLhg_tEysvlWP";

export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || PROJECT_URL;
export const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || PROJECT_KEY;

// EXPO_PUBLIC_DEMO=1 runs the app with local sample data instead.
export const isDemo = process.env.EXPO_PUBLIC_DEMO === "1";

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
