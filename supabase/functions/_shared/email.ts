// Sends an email for the person through Resend. BüroKI sends from its own address;
// replies go straight to the person, and they get a copy of what was sent.
import { HttpError, type Profile } from "./http.ts";

export const DAILY_EMAIL_LIMITS: Record<Profile["plan"], number> = { free: 3, plus: 20, org: 100 };

const ADDRESS = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;

/** One plain address, without a display name, so nobody can slip in a second recipient. */
export function isEmailAddress(text: string): boolean {
  return text.length <= 254 && ADDRESS.test(text);
}

/** [Square bracket] fields the agent left for the person to fill in. */
export function openPlaceholders(text: string): string[] {
  return [...new Set(text.match(/\[[^\]\n]{1,60}\]/g) ?? [])];
}

/** At most this many files, and this much in total, so the email stays under mail servers' size limits. */
export const MAX_ATTACHMENTS = 10;
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

export interface Attachment {
  filename: string;
  /** Base64 file content. */
  content: string;
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  body: string;
  senderName: string | null;
  replyTo: string;
  attachments?: Attachment[];
}

/** A file name a mail program shows safely: no paths, quotes or line breaks, with its extension kept. */
export function safeFilename(name: string, fallback: string): string {
  const clean = name.replace(/[\\/\r\n"<>:|?*\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(-100);
  return clean || fallback;
}

/** The request body for Resend's POST /emails. */
export function resendPayload(email: OutgoingEmail, from: string): Record<string, unknown> {
  const name = (email.senderName ?? "").replace(/["<>\r\n]/g, "").trim();
  const files = email.attachments ?? [];
  const footer = [
    ...(files.length ? ["", `Anlagen: ${files.map((f) => f.filename).join(", ")}`] : []),
    "",
    "--",
    `Diese E-Mail wurde mit BüroKI im Auftrag von ${name || email.replyTo} versendet.`,
    `Bitte antworten Sie direkt an ${email.replyTo}.`,
  ].join("\n");
  return {
    from: name ? `"${name} via BüroKI" <${from}>` : `BüroKI <${from}>`,
    to: [email.to],
    bcc: [email.replyTo],
    reply_to: email.replyTo,
    subject: email.subject.replace(/[\r\n]+/g, " ").trim(),
    text: `${email.body.trim()}\n${footer}`,
    ...(files.length ? { attachments: files } : {}),
  };
}

/**
 * Sends the email and returns Resend's id. The idempotency key stops a double tap from sending
 * twice; it includes a hash of the email, so a corrected retry is not mistaken for a duplicate.
 */
export async function sendWithResend(email: OutgoingEmail, draftId: string): Promise<string> {
  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("EMAIL_FROM");
  if (!key || !from) {
    throw new HttpError(503, "Sending emails from BüroKI is not set up yet. Open the email in your email app instead.", "email_off");
  }
  const payload = JSON.stringify(resendPayload(email, from));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload)));
  const hash = [...digest.slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `draft-${draftId}-${hash}` },
    body: payload,
  });
  const body = await res.json().catch(() => ({})) as { id?: string; message?: string };
  if (!res.ok || !body.id) {
    if (res.status === 422 || res.status === 400) {
      throw new HttpError(422, `The email could not be sent: ${body.message ?? "invalid email"}`, "email_rejected");
    }
    throw new HttpError(502, "The email service is unavailable right now. Please try again.", "upstream");
  }
  return body.id;
}
