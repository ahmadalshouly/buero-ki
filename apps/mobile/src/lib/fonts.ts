// Arabic and Farsi use IBM Plex Sans Arabic. The system font draws Arabic from
// a fallback that is tracked and sized for Latin; Plex is designed for both
// scripts, so mixed lines (names, German terms, dates) stay even.
import {
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_500Medium,
  IBMPlexSansArabic_600SemiBold,
  IBMPlexSansArabic_700Bold,
} from "@expo-google-fonts/ibm-plex-sans-arabic";
import { useTranslation } from "react-i18next";
import { StyleSheet, type StyleProp, type TextStyle } from "react-native";
import { isRtl } from "./i18n";

export const SCRIPT_FONTS = {
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_500Medium,
  IBMPlexSansArabic_600SemiBold,
  IBMPlexSansArabic_700Bold,
};

// iOS raises an error for a font family it doesn't know, so the family is only
// used once the files have loaded.
let ready = false;
export function setScriptFontsReady(value: boolean) {
  ready = value;
}

function family(weight: TextStyle["fontWeight"]): keyof typeof SCRIPT_FONTS {
  const w = weight === "bold" ? 700 : weight === "normal" || weight === undefined ? 400 : Number(weight) || 400;
  if (w >= 700) return "IBMPlexSansArabic_700Bold";
  if (w >= 600) return "IBMPlexSansArabic_600SemiBold";
  if (w >= 500) return "IBMPlexSansArabic_500Medium";
  return "IBMPlexSansArabic_400Regular";
}

/**
 * The script font for a text style: the family that matches its weight, no
 * tracking (letter spacing pulls Arabic letters apart), and a little more line
 * height for the taller Arabic marks.
 */
export function scriptFont(rtl: boolean, style: StyleProp<TextStyle>): TextStyle | null {
  if (!rtl || !ready) return null;
  const flat = StyleSheet.flatten(style) ?? {};
  return {
    fontFamily: family(flat.fontWeight),
    fontWeight: "normal",
    letterSpacing: 0,
    ...(typeof flat.lineHeight === "number" ? { lineHeight: Math.round(flat.lineHeight * 1.15) } : null),
  };
}

/** Wraps a text style with the script font when the UI is Arabic or Farsi. */
export function useScriptFont(): (style: StyleProp<TextStyle>) => StyleProp<TextStyle> {
  const rtl = isRtl(useTranslation().i18n.language);
  return (style) => {
    const extra = scriptFont(rtl, style);
    return extra ? [style, extra] : style;
  };
}
