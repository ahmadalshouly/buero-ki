// Reads the fillable fields of a PDF form and writes values into them, so the person
// gets the official PDF back filled in.
import {
  PDFCheckBox, PDFDocument, PDFDropdown, type PDFField, type PDFFont, PDFHexString, PDFName, PDFOptionList, PDFRadioGroup,
  PDFString, PDFTextField, StandardFonts,
} from "npm:pdf-lib@1.17.1";

export interface PdfFieldInfo {
  name: string;
  type: "text" | "checkbox" | "choice";
  page: number | null;
  /** The field's tooltip, which on German forms often holds the printed label. */
  tooltip: string | null;
  options: string[];
}

/** More fields than this are cut from the agent's prompt; such forms are rare. */
export const MAX_PDF_FIELDS = 500;

async function load(bytes: Uint8Array): Promise<PDFDocument | null> {
  try {
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
    // Encrypted PDFs load but cannot be saved correctly; treat them as scans.
    return pdf.isEncrypted ? null : pdf;
  } catch {
    return null;
  }
}

function tooltip(field: PDFField): string | null {
  const tu = field.acroField.dict.lookup(PDFName.of("TU"));
  if (tu instanceof PDFString || tu instanceof PDFHexString) return tu.decodeText().trim() || null;
  return null;
}

function pageOf(pdf: PDFDocument, field: PDFField): number | null {
  const ref = field.acroField.getWidgets()[0]?.P();
  if (!ref) return null;
  const index = pdf.getPages().findIndex((p) => p.ref === ref);
  return index >= 0 ? index + 1 : null;
}

export async function readPdfFields(bytes: Uint8Array): Promise<PdfFieldInfo[]> {
  const pdf = await load(bytes);
  if (!pdf) return [];
  const out: PdfFieldInfo[] = [];
  for (const field of pdf.getForm().getFields()) {
    let type: PdfFieldInfo["type"] | null = null;
    let options: string[] = [];
    if (field instanceof PDFTextField) type = "text";
    else if (field instanceof PDFCheckBox) type = "checkbox";
    else if (field instanceof PDFRadioGroup || field instanceof PDFDropdown || field instanceof PDFOptionList) {
      type = "choice";
      options = field.getOptions();
    }
    // Buttons and signature fields are skipped: there is nothing to type into them.
    if (!type || field.isReadOnly()) continue;
    out.push({ name: field.getName(), type, page: pageOf(pdf, field), tooltip: tooltip(field), options });
  }
  return out;
}

/** Drops characters the standard PDF font cannot draw (e.g. Arabic script), instead of failing the whole file. */
function printable(font: PDFFont, text: string): string {
  try {
    font.encodeText(text);
    return text;
  } catch {
    return [...text].filter((ch) => {
      try {
        font.encodeText(ch);
        return true;
      } catch {
        return false;
      }
    }).join("");
  }
}

const TRUE = /^(true|ja|yes|x|1)$/i;

export async function fillPdf(
  bytes: Uint8Array,
  values: { pdf_field: string; value: string }[],
): Promise<{ bytes: Uint8Array; filled: number; skipped: string[] }> {
  const pdf = await load(bytes);
  if (!pdf) throw new Error("This PDF cannot be filled in.");
  const form = pdf.getForm();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  // Dynamic (XFA) forms would ignore the values we write into the regular fields.
  form.deleteXFA();

  let filled = 0;
  const skipped: string[] = [];
  for (const { pdf_field, value } of values) {
    const field = form.getFieldMaybe(pdf_field);
    try {
      if (field instanceof PDFTextField) {
        const max = field.getMaxLength();
        const text = printable(font, value);
        field.setText(max ? text.slice(0, max) : text);
      } else if (field instanceof PDFCheckBox) {
        if (TRUE.test(value.trim())) field.check();
        else field.uncheck();
      } else if (field instanceof PDFRadioGroup || field instanceof PDFDropdown || field instanceof PDFOptionList) {
        const option = field.getOptions().find((o) => o.toLowerCase() === value.trim().toLowerCase());
        if (!option) throw new Error("not an option");
        field.select(option);
      } else {
        throw new Error("no such field");
      }
      filled++;
    } catch {
      skipped.push(pdf_field);
    }
  }
  form.updateFieldAppearances(font);
  return { bytes: await pdf.save(), filled, skipped };
}
