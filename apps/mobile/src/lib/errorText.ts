import type { TFunction } from "i18next";
import { ApiError } from "./errors";
import i18n from "./i18n";

const TRANSLATED = ["limit", "consent", "busy", "offline", "upstream", "auth", "not_found", "place_not_found", "file_type", "timeout", "email_off", "already_sent"] as const;

/** Codes whose message explains what went wrong in a way people need to see, even in English. */
const PASSED_THROUGH: string[] = ["input", "email_rejected", "send_failed", "attachment_missing"];

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
    if (i18n.language === "en" || (error instanceof ApiError && PASSED_THROUGH.includes(error.code))) return error.message;
  }
  // A short reference, so a screenshot of an unexpected error is enough to find its cause.
  const ref = error instanceof ApiError ? [error.code, error.requestId?.slice(0, 8)].filter(Boolean).join(" · ") : "";
  return ref ? `${t("common.error")} (${ref})` : t("common.error");
}
