import { letterHtml } from "./letter";

/** Opens the browser's print dialog, where "Save as PDF" is one of the printers. */
export async function exportLetterPdf(text: string, subject: string): Promise<void> {
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
}
