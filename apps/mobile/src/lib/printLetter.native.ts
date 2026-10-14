import { letterFileName, letterHtml } from "./letter";
import { makePdf, sharePdf } from "./savePdf.native";
import type { PickedFile } from "./types";

/** Renders the letter to an A4 PDF, opens the share sheet (save, print, send) and returns the file to keep. */
export async function exportLetterPdf(text: string, subject: string): Promise<PickedFile | null> {
  const name = letterFileName(subject);
  const file = await makePdf(letterHtml(text, subject), name);
  await sharePdf(file, name);
  return { uri: file.uri, mimeType: "application/pdf", name };
}
