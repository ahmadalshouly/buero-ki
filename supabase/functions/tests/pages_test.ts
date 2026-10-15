import { decodeBase64 } from "jsr:@std/encoding@1/base64";
import { assert, assertEquals, assertMatch, assertRejects } from "jsr:@std/assert@1";
import { PDFDocument, StandardFonts } from "npm:pdf-lib@1.17.1";
import { HttpError } from "../_shared/http.ts";
import { filesParts, pageParts } from "../_shared/pages.ts";

// A blank 500x600 JPEG, as big as a small scanned page.
const scan = decodeBase64(
  "/9j/4AAQSkZJRgABAQAAAAAAAAD/2wBDAKBueIx4ZKCMgoy0qqC+8P//8Nzc8P//////////////////////////////////////////////////////////wAALCAJYAfQBAREA/8QAFQABAQAAAAAAAAAAAAAAAAAAAAP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAA/ALAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//Z",
);

Deno.test("photos are sent as images", async () => {
  const [part] = await pageParts("image/jpeg", scan);
  assert(part.type === "image_url" && part.image_url.url.startsWith("data:image/jpeg;base64,/9j/"));
  const err = await assertRejects(() => pageParts("image/heic", scan), HttpError);
  assertEquals(err.status, 415);
});

Deno.test("a PDF with text is sent as the text of each page", async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage().drawText("Jobcenter Berlin Mitte, Frist 30.11.2026", { x: 50, y: 700, font, size: 12 });
  pdf.addPage().drawText("Seite zwei", { x: 50, y: 700, font, size: 12 });
  const parts = await pageParts("application/pdf", await pdf.save());
  assertEquals(parts.length, 2);
  assert(parts[0].type === "text");
  assertMatch(parts[0].text, /PDF page 1 of 2[\s\S]*Frist 30\.11\.2026/);
  assert(parts[1].type === "text" && parts[1].text.includes("Seite zwei"));
});

Deno.test("a scanned PDF is sent as its page images, small logos are left out", async () => {
  const pdf = await PDFDocument.create();
  const image = await pdf.embedJpg(scan);
  const page = pdf.addPage([595, 842]);
  page.drawImage(image, { x: 0, y: 0, width: 595, height: 842 });
  const parts = await pageParts("application/pdf", await pdf.save());
  assertEquals(parts.map((p) => p.type), ["text", "image_url"]);
  assert(parts[1].type === "image_url" && parts[1].image_url.url.startsWith("data:image/jpeg;base64,/9j/"));
});

Deno.test("an empty or broken PDF asks for photos instead", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const empty = await pdf.save();
  const err = await assertRejects(() => pageParts("application/pdf", empty), HttpError);
  assertEquals(err.code, "pdf_unreadable");
  await assertRejects(() => pageParts("application/pdf", new TextEncoder().encode("not a pdf")), HttpError);
});

Deno.test("several files keep their order", async () => {
  const parts = await filesParts([{ mime: "image/jpeg", bytes: scan }, { mime: "image/png", bytes: scan }]);
  assertEquals(parts.map((p) => p.type), ["text", "image_url", "text", "image_url"]);
});
