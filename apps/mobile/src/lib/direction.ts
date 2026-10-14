// Right-to-left support that works the moment the language changes, without a
// restart and inside Expo Go. The native RTL switch (I18nManager.forceRTL) only
// applies after a restart, so the root view also sets `direction` itself and
// the helpers below cover what layout direction alone does not: text and
// input alignment, and arrows that point "forward".
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Platform, type TextStyle, type ViewStyle } from "react-native";
import { scriptFont } from "./fonts";
import { isRtl } from "./i18n";

export function useRtl(): boolean {
  const { i18n } = useTranslation();
  return isRtl(i18n.language);
}

/** Layout direction for a root view (the app root, and each modal, which starts a new root). */
export function useDirection(): ViewStyle {
  return { direction: useRtl() ? "rtl" : "ltr" };
}

const RTL_TEXT: TextStyle = { writingDirection: "rtl" };
// Inside a right-to-left layout React Native on iOS and Android swaps textAlign
// "left" and "right" (they act as start and end), so the right edge is "left"
// there. The web keeps them literal.
const RIGHT_EDGE: TextStyle["textAlign"] = Platform.OS === "web" ? "right" : "left";
// Latin-only text (German letter titles, names, file names) inside an RTL screen keeps
// its own left-to-right order, so punctuation and ellipses land on the right end,
// while still lining up on the reading side.
const LATIN_IN_RTL: TextStyle = { writingDirection: "ltr", textAlign: RIGHT_EDGE };
const RTL_CHARS = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const LETTERS = /[A-Za-z\u00C0-\u024F\u0400-\u04FF]/;

function plainText(content: ReactNode): string | null {
  if (typeof content === "string" || typeof content === "number") return String(content);
  if (Array.isArray(content) && content.every((x) => typeof x === "string" || typeof x === "number")) return content.join("");
  return null;
}

/**
 * Gives text the reading direction of the UI language, so it aligns and orders
 * punctuation correctly. Pass the text itself so Latin-only content is kept left-to-right.
 */
export function useTextDir(content?: ReactNode): TextStyle | null {
  return textDir(useRtl(), content);
}

export function textDir(rtl: boolean, content?: ReactNode): TextStyle | null {
  if (!rtl) return null;
  const text = plainText(content);
  if (text !== null && !RTL_CHARS.test(text) && LETTERS.test(text)) return LATIN_IN_RTL;
  return RTL_TEXT;
}

const LTR_BLOCK: TextStyle = { writingDirection: "ltr", textAlign: "left" };
const LTR_BLOCK_IN_RTL: TextStyle = { writingDirection: "ltr", textAlign: Platform.OS === "web" ? "left" : "right" };

/** German documents (letters, form fields) read left-to-right on the left edge whatever the UI language. */
export function useLtrText(): TextStyle {
  return useRtl() ? LTR_BLOCK_IN_RTL : LTR_BLOCK;
}

// Text inputs are different: React Native on iOS does not swap their textAlign
// (the input never learns its layout direction), so "left" and "right" mean
// the physical edges there, as on the web.
const RTL_INPUT: TextStyle = { textAlign: "right", writingDirection: "rtl" };

/** Aligns typed text to the reading side; inputs don't follow writingDirection alone. */
export function useInputDir(): TextStyle | null {
  const rtl = useRtl();
  return rtl ? { ...RTL_INPUT, ...scriptFont(true, null) } : null;
}

/** Inputs for German text (form answers, letter drafts): typed left-to-right from the left edge. */
export const LTR_INPUT: TextStyle = LTR_BLOCK;

const FLIP: ViewStyle = { transform: [{ scaleX: -1 }] };
const DIRECTIONAL = /(^|-)(arrow-(forward|back)|chevron-(forward|back)|caret-(forward|back))/;

/** Mirrors icons that point forward or back, so "next" points left in Arabic and Farsi. */
export function useIconFlip(name?: string): ViewStyle | null {
  const rtl = useRtl();
  return rtl && name && DIRECTIONAL.test(name) ? FLIP : null;
}
