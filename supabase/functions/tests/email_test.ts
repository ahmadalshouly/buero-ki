import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import { isEmailAddress, openPlaceholders, resendPayload, safeFilename } from "../_shared/email.ts";

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

Deno.test("attachments are sent and listed under the text", () => {
  const p = resendPayload({
    to: "amt@stadt.de", subject: "Unterlagen", body: "Anbei die Unterlagen.", senderName: "Amina", replyTo: "amina@example.org",
    attachments: [{ filename: "Mietvertrag.pdf", content: "JVBERi0=" }, { filename: "Lohnabrechnung.jpg", content: "/9j/" }],
  }, "send@mail.bueroki.app");
  assertEquals((p.attachments as unknown[]).length, 2);
  assert(String(p.text).includes("Anlagen: Mietvertrag.pdf, Lohnabrechnung.jpg"));
  const plain = resendPayload({ to: "amt@stadt.de", subject: "x", body: "y", senderName: null, replyTo: "a@b.de" }, "s@m.de");
  assertFalse("attachments" in plain);
  assertFalse(String(plain.text).includes("Anlagen"));
});

Deno.test("file names are made safe for mail programs", () => {
  assertEquals(safeFilename('../../etc/"pass"\nwd.pdf', "Anlage-1.pdf"), ".. .. etc pass wd.pdf");
  assertEquals(safeFilename("  ", "Anlage-2.jpg"), "Anlage-2.jpg");
  assertEquals(safeFilename("Mietvertrag Seite 1.jpg", "x"), "Mietvertrag Seite 1.jpg");
});
