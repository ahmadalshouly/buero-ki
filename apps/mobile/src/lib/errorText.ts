import type { TFunction } from "i18next";
import { ApiError } from "./errors";

const TRANSLATED = ["limit", "consent", "busy", "offline"] as const;

/** Shows our own translated text for errors people can act on, and the server text otherwise. */
export function friendlyError(error: unknown, t: TFunction): string {
  if (error instanceof ApiError && (TRANSLATED as readonly string[]).includes(error.code)) {
    return t(`errors.${error.code as (typeof TRANSLATED)[number]}`);
  }
  return error instanceof Error ? error.message : t("common.error");
}
