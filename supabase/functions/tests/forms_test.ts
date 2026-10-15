import { assert, assertEquals } from "jsr:@std/assert@1";
import { PDFDocument, PDFHexString, PDFName } from "npm:pdf-lib@1.17.1";
import { outputSchema } from "../_shared/ai.ts";
import { fillPdf, readPdfFields } from "../_shared/pdfForm.ts";
import * as schemas from "../_shared/schemas.ts";
import { FormAnalysis, FormAnswers } from "../_shared/schemas.ts";

async function sampleForm(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  pdf.addPage([595, 842]);
  const form = pdf.getForm();
  const name = form.createTextField("Familienname");
  name.addToPage(page, { x: 50, y: 700, width: 200, height: 20 });
  name.acroField.dict.set(PDFName.of("TU"), PDFHexString.fromText("Familienname, Vorname"));
  const plz = form.createTextField("PLZ");
  plz.setMaxLength(5);
  plz.addToPage(page, { x: 50, y: 660, width: 80, height: 20 });
  form.createCheckBox("verheiratet").addToPage(page, { x: 50, y: 620, width: 12, height: 12 });
  const status = form.createDropdown("Staatsangehoerigkeit");
  status.addOptions(["deutsch", "syrisch", "ukrainisch"]);
  status.addToPage(page, { x: 50, y: 580, width: 120, height: 20 });
  return await pdf.save();
}

Deno.test("form schemas are strict JSON Schema with every field required", () => {
  for (const schema of [FormAnalysis, FormAnswers]) {
    const js = outputSchema(schema) as { required: string[]; properties: object; additionalProperties: boolean };
    assertEquals(js.additionalProperties, false);
    assertEquals(js.required.sort(), Object.keys(js.properties).sort());
  }
});

Deno.test("output schemas use no keywords structured outputs reject", () => {
  // e.g. z.number().int() adds minimum/maximum, which makes the API answer 400.
  const banned = /"(minimum|maximum|exclusiveMinimum|exclusiveMaximum|multipleOf|minLength|maxLength|minItems|maxItems|pattern|format)"/;
  for (const [name, schema] of Object.entries(schemas)) {
    if (!(schema && typeof schema === "object" && "safeParse" in schema)) continue;
    const json = JSON.stringify(outputSchema(schema as never));
    assert(!banned.test(json), `${name}: ${json.match(banned)?.[0]}`);
  }
});

Deno.test("readPdfFields lists fillable fields with page, tooltip and options", async () => {
  const fields = await readPdfFields(await sampleForm());
  assertEquals(fields.map((f) => f.name), ["Familienname", "PLZ", "verheiratet", "Staatsangehoerigkeit"]);
  assertEquals(fields[0].page, 1);
  assertEquals(fields[0].tooltip, "Familienname, Vorname");
  assertEquals(fields[2].type, "checkbox");
  assertEquals(fields[3].options, ["deutsch", "syrisch", "ukrainisch"]);
});

Deno.test("readPdfFields returns nothing for a scan or a broken file", async () => {
  const plain = await PDFDocument.create();
  plain.addPage();
  assertEquals(await readPdfFields(await plain.save()), []);
  assertEquals(await readPdfFields(new TextEncoder().encode("not a pdf")), []);
});

Deno.test("fillPdf writes values, respects limits and skips what it cannot fill", async () => {
  const { bytes, filled, skipped } = await fillPdf(await sampleForm(), [
    { pdf_field: "Familienname", value: "Müller, Amina مرحبا" },
    { pdf_field: "PLZ", value: "101150" },
    { pdf_field: "verheiratet", value: "true" },
    { pdf_field: "Staatsangehoerigkeit", value: "Syrisch" },
    { pdf_field: "Unbekannt", value: "x" },
  ]);
  assertEquals(filled, 4);
  assertEquals(skipped, ["Unbekannt"]);
  const form = (await PDFDocument.load(bytes)).getForm();
  assertEquals(form.getTextField("Familienname").getText()?.trim(), "Müller, Amina");
  assertEquals(form.getTextField("PLZ").getText(), "10115");
  assert(form.getCheckBox("verheiratet").isChecked());
  assertEquals(form.getDropdown("Staatsangehoerigkeit").getSelected(), ["syrisch"]);
});
