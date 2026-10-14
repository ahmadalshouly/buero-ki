/** Opens the browser's print dialog, where "Save as PDF" is one of the printers. */
export async function htmlToPdf(html: string, _fileName: string): Promise<void> {
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  await new Promise((r) => setTimeout(r, 250));
  frame.contentWindow!.focus();
  frame.contentWindow!.print();
  setTimeout(() => frame.remove(), 1000);
}

/** Downloads a PDF in the browser. */
export async function downloadPdf(url: string, fileName: string): Promise<void> {
  const blob = await (await fetch(url)).blob();
  const link = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = link;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(link), 1000);
}
