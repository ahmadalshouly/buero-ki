import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import { isEmailAddress, openPlaceholders, resendPayload } from "../_shared/email.ts";

Deno.test("only one plain email address is accepted as recipient", () => {
  assert(isEmailAddress("poststelle@jobcenter-ge.de"));
  assertFalse(isEmailAddress("a@b.de, c@d.de"));
  assertFalse(isEmailAddress("Amt <amt@stadt.de>"));
  assertFalse(isEmailAddress("amt@stadt"));
  assertFalse(isEmailAddress("amt@stadt.de\nbcc: x@y.de"));
});

Deno.test("open [fields] are found so half-finished emails are not sent", () => {
  assertEquals(openPlaceholders("Sehr geehrte [Name],\nAz. [Aktenzeichen] und [Name]"), ["[Name]", "[Aktenzeichen]"]);
  assertEquals(openPlaceholders("Mit freundlichen Grüßen\nAmina"), []);
});

Deno.test("the email goes from BüroKI, replies and a copy go to the person", () => {
  const p = resendPayload({
    to: "amt@stadt.de", subject: "Termin\r\nBcc: x@y.de", body: "Hallo", senderName: 'Amina "A" <Khalil>', replyTo: "amina@example.org",
  }, "send@mail.bueroki.app");
  assertEquals(p.from, '"Amina A Khalil via BüroKI" <send@mail.bueroki.app>');
  assertEquals(p.to, ["amt@stadt.de"]);
  assertEquals(p.bcc, ["amina@example.org"]);
  assertEquals(p.reply_to, "amina@example.org");
  assertEquals(p.subject, "Termin Bcc: x@y.de");
  assert(String(p.text).includes("im Auftrag von Amina A Khalil"));
  assert(String(p.text).includes("direkt an amina@example.org"));
});
