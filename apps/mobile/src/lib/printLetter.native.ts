import { letterFileName, letterHtml } from "./letter";
import { htmlToPdf } from "./savePdf";

/** Renders the letter to an A4 PDF and opens the share sheet (save, print, send). */
export async function exportLetterPdf(text: string, subject: string): Promise<void> {
  await htmlToPdf(letterHtml(text, subject), letterFileName(subject));
}
