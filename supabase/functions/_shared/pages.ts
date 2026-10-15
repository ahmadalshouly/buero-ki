// Turns uploaded pages (photos or a PDF) into what the model can read: images and text.
// The model reads images but not PDF files, so a PDF is sent as the text of each page
// plus the scanned page images it contains (scanner apps store pages as JPEG).
import { encodeBase64 } from "jsr:@std/encoding@1/base64";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream } from "npm:pdf-lib@1.17.1";
import { extractText, getDocumentProxy } from "npm:unpdf@1.8.1";
import type { ContentPart } from "./ai.ts";
import { HttpError } from "./http.ts";

export const MAX_PAGES = 10;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
// Smaller images in a PDF are logos, stamps or icons; scans are much larger.
const MIN_SCAN_SIDE = 500;
const MAX_PDF_IMAGES = 20;
const MAX_PAGE_TEXT = 20000;

export async function pageParts(mime: string, bytes: Uint8Array): Promise<ContentPart[]> {
  if (mime === "application/pdf") return await pdfParts(bytes);
  if (IMAGE_TYPES.includes(mime)) return [{ type: "image_url", image_url: { url: `data:${mime};base64,${encodeBase64(bytes)}` } }];
  throw new HttpError(415, `Unsupported file type ${mime}. Please upload a JPEG, PNG or PDF.`, "file_type");
}

/** All pages of all files, in order, with a short label so the model keeps them apart. */
export async function filesParts(files: { mime: string; bytes: Uint8Array }[]): Promise<ContentPart[]> {
  const parts: ContentPart[] = [];
  for (const [i, f] of files.entries()) {
    if (files.length > 1) parts.push({ type: "text", text: `File ${i + 1} of ${files.length}:` });
    parts.push(...await pageParts(f.mime, f.bytes));
  }
  return parts;
}

async function pdfParts(bytes: Uint8Array): Promise<ContentPart[]> {
  const [texts, images] = await Promise.all([pdfTexts(bytes), pdfScans(bytes)]);
  const pages = Math.max(texts.length, images.length);
  const parts: ContentPart[] = [];
  let imageCount = 0;
  for (let p = 0; p < pages; p++) {
    const text = (texts[p] ?? "").trim().slice(0, MAX_PAGE_TEXT);
    const scans = (images[p] ?? []).slice(0, MAX_PDF_IMAGES - imageCount);
    imageCount += scans.length;
    if (!text && !scans.length) continue;
    parts.push({ type: "text", text: `PDF page ${p + 1} of ${pages}${text ? `, text of the page:\n<page_text>\n${text}\n</page_text>` : ":"}` });
    for (const jpeg of scans) parts.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${encodeBase64(jpeg)}` } });
  }
  if (!parts.length) {
    throw new HttpError(
      415,
      "BüroKI could not read this PDF. Please take a photo of each page instead.",
      "pdf_unreadable",
    );
  }
  return parts;
}

async function pdfTexts(bytes: Uint8Array): Promise<string[]> {
  try {
    // pdf.js takes over the buffer it is given, so it gets a copy.
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: false });
    return text;
  } catch {
    return [];
  }
}

/** The JPEG images on each page that are big enough to be a scanned page. */
export async function pdfScans(bytes: Uint8Array): Promise<Uint8Array[][]> {
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    return doc.getPages().map((page) => {
      const found: Uint8Array[] = [];
      const xobjects = page.node.Resources()?.lookupMaybe(PDFName.of("XObject"), PDFDict);
      if (!xobjects) return found;
      for (const [, ref] of xobjects.entries()) {
        const stream = doc.context.lookup(ref);
        if (!(stream instanceof PDFRawStream)) continue;
        const dict = stream.dict;
        if (dict.lookup(PDFName.of("Subtype")) !== PDFName.of("Image")) continue;
        const filter = dict.lookup(PDFName.of("Filter"));
        const filters = filter instanceof PDFArray ? filter.asArray() : [filter];
        if (filters.length !== 1 || filters[0] !== PDFName.of("DCTDecode")) continue;
        const width = dict.lookup(PDFName.of("Width"));
        const height = dict.lookup(PDFName.of("Height"));
        const side = Math.max(
          width instanceof PDFNumber ? width.asNumber() : 0,
          height instanceof PDFNumber ? height.asNumber() : 0,
        );
        if (side >= MIN_SCAN_SIDE) found.push(stream.contents);
      }
      return found;
    });
  } catch {
    return [];
  }
}
