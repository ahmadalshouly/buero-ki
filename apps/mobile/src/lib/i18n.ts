import { getLocales } from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { I18nManager, Platform } from "react-native";
import ar from "../locales/ar";
import de from "../locales/de";
import en from "../locales/en";
import fa from "../locales/fa";
import tr from "../locales/tr";
import uk from "../locales/uk";
import { LANGUAGES, type Language } from "./types";

const supported = LANGUAGES.map((l) => l.code) as string[];
const device = getLocales()[0]?.languageCode ?? "en";
export const initialLanguage = (supported.includes(device) ? device : "en") as Language;

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    de: { translation: de },
    ar: { translation: ar },
    tr: { translation: tr },
    uk: { translation: uk },
    fa: { translation: fa },
  },
  lng: initialLanguage,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export function isRtl(lang: string) {
  return LANGUAGES.find((l) => l.code === lang)?.rtl ?? false;
}

/**
 * Switches the UI language. Returns true when the native layout direction
 * changes, which only takes effect after the app restarts.
 */
export function setLanguage(lang: Language): boolean {
  i18n.changeLanguage(lang);
  const rtl = isRtl(lang);
  if (Platform.OS === "web") {
    document.documentElement.dir = rtl ? "rtl" : "ltr";
    document.documentElement.lang = lang;
    return false;
  }
  if (I18nManager.isRTL !== rtl) {
    I18nManager.allowRTL(rtl);
    I18nManager.forceRTL(rtl);
    return true;
  }
  return false;
}

export function formatDate(iso: string | null | undefined, lang = i18n.language): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  const locale = lang === "en" ? "en-GB" : lang;
  return d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
}

/** Days from today until an ISO date; negative when it is in the past. */
export function daysUntil(iso: string): number {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.round((new Date(`${iso}T12:00:00`).getTime() - today.getTime()) / 86400000);
}

export default i18n;
