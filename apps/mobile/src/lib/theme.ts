import { Platform, useColorScheme } from "react-native";
import { usePrefs } from "./prefs";

// Colours follow Apple's system palette: grouped backgrounds, translucent
// "material" surfaces and system blue as the tint.
const light = {
  bg: "#F2F2F7",
  /** Translucent surface for cards and grouped lists. */
  card: "rgba(255, 255, 255, 0.72)",
  /** Opaque surface for dialogs, inputs and anything that must not show through. */
  solid: "#FFFFFF",
  /** Selected segment of a segmented control. */
  segment: "#FFFFFF",
  raised: "rgba(118, 118, 128, 0.12)",
  ink: "#1C1C1E",
  muted: "#6C6C70",
  faint: "#8E8E93",
  line: "rgba(60, 60, 67, 0.16)",
  /** Bright edge that catches the light on glass. */
  glassEdge: "rgba(60, 60, 67, 0.08)",
  /** Fallback fill where real blur is not available (Android). */
  glassFill: "rgba(255, 255, 255, 0.86)",
  accent: "#007AFF",
  accentInk: "#FFFFFF",
  accentSoft: "rgba(0, 122, 255, 0.12)",
  warn: "#C25400",
  warnSoft: "rgba(255, 149, 0, 0.15)",
  danger: "#D70015",
  dangerSoft: "rgba(255, 59, 48, 0.12)",
  success: "#248A3D",
  skeleton: "rgba(118, 118, 128, 0.14)",
  overlay: "rgba(0, 0, 0, 0.28)",
  shadow: "rgba(16, 24, 40, 0.06)",
};

export type Palette = typeof light;

const dark: Palette = {
  bg: "#000000",
  card: "rgba(28, 28, 30, 0.72)",
  solid: "#1C1C1E",
  segment: "#636366",
  raised: "rgba(118, 118, 128, 0.24)",
  ink: "#F5F5F7",
  muted: "#AEAEB2",
  faint: "#8E8E93",
  line: "rgba(84, 84, 88, 0.55)",
  glassEdge: "rgba(255, 255, 255, 0.14)",
  glassFill: "rgba(36, 36, 38, 0.92)",
  accent: "#0A84FF",
  accentInk: "#FFFFFF",
  accentSoft: "rgba(10, 132, 255, 0.2)",
  warn: "#FF9F0A",
  warnSoft: "rgba(255, 159, 10, 0.18)",
  danger: "#FF453A",
  dangerSoft: "rgba(255, 69, 58, 0.18)",
  success: "#30D158",
  skeleton: "rgba(118, 118, 128, 0.24)",
  overlay: "rgba(0, 0, 0, 0.5)",
  shadow: "rgba(0, 0, 0, 0.4)",
};

export const palettes = { light, dark };

/**
 * The light behind the glass: the system grouped background with one soft
 * glow of the tint colour at the top, so translucent surfaces have something
 * to pick up without the screen turning colourful.
 */
export const washes = {
  light: {
    base: "linear-gradient(180deg, #EEF2F8 0%, #F2F2F7 38%, #F2F2F7 100%)",
    glow: [
      "radial-gradient(ellipse 120% 55% at 50% 0%, rgba(0, 122, 255, 0.13) 0%, rgba(0, 122, 255, 0) 70%)",
    ],
  },
  dark: {
    base: "linear-gradient(180deg, #070A12 0%, #000000 40%, #000000 100%)",
    glow: [
      "radial-gradient(ellipse 120% 55% at 50% 0%, rgba(10, 132, 255, 0.20) 0%, rgba(10, 132, 255, 0) 70%)",
    ],
  },
};

export function useScheme(): "light" | "dark" {
  const system = useColorScheme();
  const { theme } = usePrefs();
  if (theme === "system") return system === "dark" ? "dark" : "light";
  return theme;
}

export function useColors(): Palette {
  return palettes[useScheme()];
}

export const radius = { sm: 12, md: 20, lg: 28 };
export const space = (n: number) => n * 4;

/** iOS draws rounded corners as continuous curves ("squircles"). */
export const curve = { borderCurve: "continuous" as const };

/** A quiet shadow that lifts a surface just off the background. */
export function lift(c: Palette) {
  return Platform.select({
    android: { elevation: 0 },
    default: { shadowColor: c.shadow, shadowOpacity: 1, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  });
}

// Type scale modelled on the iOS text styles (Large Title, Title 3, Headline, Body, Subheadline, Footnote).
export const font = {
  title: { fontSize: 34, lineHeight: 41, fontWeight: "700" as const, letterSpacing: 0.37 },
  h2: { fontSize: 22, lineHeight: 28, fontWeight: "700" as const, letterSpacing: 0.35 },
  h3: { fontSize: 17, lineHeight: 22, fontWeight: "600" as const, letterSpacing: -0.41 },
  body: { fontSize: 17, lineHeight: 23, letterSpacing: -0.41 },
  small: { fontSize: 15, lineHeight: 20, letterSpacing: -0.24 },
  label: { fontSize: 13, lineHeight: 18, fontWeight: "600" as const, letterSpacing: -0.08, textTransform: "uppercase" as const },
  caption: { fontSize: 13, lineHeight: 18, letterSpacing: -0.08 },
};
