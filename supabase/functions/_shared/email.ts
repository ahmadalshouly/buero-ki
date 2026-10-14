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

export interface OutgoingEmail {
  to: string;
  subject: string;
  body: string;
  senderName: string | null;
  replyTo: string;
}

/** The request body for Resend's POST /emails. */
export function resendPayload(email: OutgoingEmail, from: string): Record<string, unknown> {
  const name = (email.senderName ?? "").replace(/["<>\r\n]/g, "").trim();
  const footer = [
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
  };
}

/** Sends the email and returns Resend's id. The idempotency key stops a double tap from sending twice. */
export async function sendWithResend(email: OutgoingEmail, idempotencyKey: string): Promise<string> {
  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("EMAIL_FROM");
  if (!key || !from) {
    throw new HttpError(503, "Sending emails from BüroKI is not set up yet. Open the email in your email app instead.", "email_off");
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(resendPayload(email, from)),
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
