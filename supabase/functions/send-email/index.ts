// Sends an email draft to an office on the person's behalf, after they confirmed it in the app.
// Only the saved draft is sent, exactly as the person last saw it.
import { z } from "npm:zod@4.6.7";
import { DAILY_EMAIL_LIMITS, isEmailAddress, openPlaceholders, sendWithResend } from "../_shared/email.ts";
import { handler, HttpError } from "../_shared/http.ts";

const Input = z.strictObject({
  draft_id: z.uuid(),
  to: z.string().trim().toLowerCase().refine(isEmailAddress, "Please enter one valid email address."),
  /** The person's email for replies, asked for in the app before sending. Defaults to the saved one. */
  reply_to: z.string().trim().toLowerCase().refine(isEmailAddress, "Please enter your email address for replies.").optional(),
  // The app sends this only after the person tapped "Send" in the confirmation.
  confirmed: z.literal(true),
});

Deno.serve(handler("send-email", Input, async (ctx) => {
  const { supabase, input, profile } = ctx;
  const replyTo = input.reply_to ?? profile.contact_email ?? ctx.userEmail;
  if (!replyTo) throw new HttpError(400, "Please enter your email address for replies.", "input");

  const { data: draft } = await supabase.from("drafts")
    .select("id, case_id, kind, subject, body_de, status").eq("id", input.draft_id).single();
  if (!draft) throw new HttpError(404, "Draft not found", "not_found");
  if (draft.kind !== "email") throw new HttpError(400, "Only email drafts can be sent by email.", "input");
  if (draft.status === "sent") throw new HttpError(409, "This email was already sent.", "already_sent");
  const missing = openPlaceholders(`${draft.subject}\n${draft.body_de}`);
  if (missing.length) {
    throw new HttpError(422, `Fill in ${missing.slice(0, 4).join(", ")} before sending.`, "placeholders");
  }

  const { data: count, error: countError } = await supabase.rpc("emails_sent_last_day");
  if (countError) throw new Error(countError.message);
  const limit = DAILY_EMAIL_LIMITS[profile.plan] ?? DAILY_EMAIL_LIMITS.free;
  if ((count as number) >= limit) {
    throw new HttpError(429, `You reached today's limit of ${limit} emails. It resets within 24 hours.`, "limit");
  }

  const providerId = await sendWithResend({
    to: input.to,
    subject: draft.subject,
    body: draft.body_de,
    senderName: profile.full_name,
    replyTo,
  }, `draft-${draft.id}`);
  ctx.log("email sent", { draftId: draft.id, providerId });

  if (replyTo !== profile.contact_email) {
    const { error } = await supabase.from("profiles").update({ contact_email: replyTo }).eq("id", ctx.userId);
    if (error) ctx.log("contact_email update failed", { error: error.message });
  }

  const sentAt = new Date().toISOString();
  const [record, update] = await Promise.all([
    supabase.from("sent_emails").insert({
      case_id: draft.case_id, draft_id: draft.id, to_address: input.to, subject: draft.subject, provider_id: providerId,
    }),
    supabase.from("drafts").update({ status: "sent", sent_at: sentAt, sent_to: input.to, sent_via: "bueroki" })
      .eq("id", draft.id).select().single(),
  ]);
  // The email is out: a failed bookkeeping write must not make the app offer to send it again.
  if (record.error) ctx.logError("sent_emails insert failed", { error: record.error.message });
  if (update.error) ctx.logError("draft update failed", { error: update.error.message });
  return { draft: update.data ?? { ...draft, status: "sent", sent_at: sentAt, sent_to: input.to, sent_via: "bueroki" } };
}));
