import { useColorScheme } from "react-native";
import { usePrefs } from "./prefs";

const light = {
  bg: "#F6F3EE",
  card: "#FFFFFF",
  raised: "#FBF9F5",
  ink: "#1E2421",
  muted: "#5E6762",
  faint: "#8C948F",
  line: "#E4DED4",
  accent: "#0E6B5E",
  accentInk: "#FFFFFF",
  accentSoft: "#E2F0EC",
  warn: "#A9531B",
  warnSoft: "#FBEDE2",
  danger: "#B3261E",
  dangerSoft: "#FBE6E4",
  skeleton: "#ECE7DF",
  overlay: "rgba(20, 24, 22, 0.45)",
};

export type Palette = typeof light;

const dark: Palette = {
  bg: "#121614",
  card: "#1B201E",
  raised: "#222826",
  ink: "#ECEFEC",
  muted: "#A3ACA7",
  faint: "#76807B",
  line: "#2C3330",
  accent: "#4FC1AC",
  accentInk: "#06201B",
  accentSoft: "#17322D",
  warn: "#F0A06A",
  warnSoft: "#3A2A1F",
  danger: "#FF8A80",
  dangerSoft: "#3B1F1D",
  skeleton: "#262C2A",
  overlay: "rgba(0, 0, 0, 0.6)",
};

export const palettes = { light, dark };

export function useScheme(): "light" | "dark" {
  const system = useColorScheme();
  const { theme } = usePrefs();
  if (theme === "system") return system === "dark" ? "dark" : "light";
  return theme;
}

export function useColors(): Palette {
  return palettes[useScheme()];
}

export const radius = { sm: 10, md: 16, lg: 24 };
export const space = (n: number) => n * 4;

export const font = {
  title: { fontSize: 28, lineHeight: 34, fontWeight: "700" as const },
  h2: { fontSize: 20, lineHeight: 26, fontWeight: "700" as const },
  h3: { fontSize: 16, lineHeight: 22, fontWeight: "600" as const },
  body: { fontSize: 16, lineHeight: 23 },
  small: { fontSize: 14, lineHeight: 20 },
  label: { fontSize: 12, lineHeight: 16, fontWeight: "700" as const, letterSpacing: 0.6, textTransform: "uppercase" as const },
};
