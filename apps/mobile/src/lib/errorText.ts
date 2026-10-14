import type { TFunction } from "i18next";
import { ApiError } from "./errors";
import i18n from "./i18n";

const TRANSLATED = ["limit", "consent", "busy", "offline", "upstream", "auth", "not_found", "file_type", "timeout"] as const;

/**
 * Shows our own translated text for errors people can act on. Other messages
 * are written in English, so they are shown as they are only to people reading
 * English (and for input mistakes, where the detail matters more than the language).
 */
export function friendlyError(error: unknown, t: TFunction): string {
  if (error instanceof ApiError && (TRANSLATED as readonly string[]).includes(error.code)) {
    return t(`errors.${error.code as (typeof TRANSLATED)[number]}`);
  }
  if (error instanceof Error && error.message) {
    if (i18n.language === "en" || (error instanceof ApiError && error.code === "input")) return error.message;
  }
  return t("common.error");
}
