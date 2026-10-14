import { letterHtml } from "./letter";
import type { PickedFile } from "./types";

/**
 * Opens the browser's print dialog, where "Save as PDF" is one of the printers.
 * The browser keeps the file to itself, so there is none to keep with the draft.
 */
export async function exportLetterPdf(text: string, subject: string): Promise<PickedFile | null> {
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(letterHtml(text, subject));
  doc.close();
  await new Promise((r) => setTimeout(r, 250));
  frame.contentWindow!.focus();
  frame.contentWindow!.print();
  setTimeout(() => frame.remove(), 1000);
  return null;
}
