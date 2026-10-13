// Gives Supabase a persistent localStorage on iOS and Android.
import "expo-sqlite/localStorage/install";

export const authStorage = globalThis.localStorage;
