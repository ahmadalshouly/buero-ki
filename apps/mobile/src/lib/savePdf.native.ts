import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";

async function share(file: File, title: string) {
  await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: title });
}

/** Renders HTML to an A4 PDF and opens the share sheet (save, print, send). */
export async function htmlToPdf(html: string, fileName: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });
  const target = new File(Paths.cache, fileName);
  if (target.exists) target.delete();
  await new File(uri).move(target);
  await share(target, fileName);
}

/** Downloads a PDF (e.g. a filled form) and opens the share sheet. */
export async function downloadPdf(url: string, fileName: string): Promise<void> {
  const target = new File(Paths.cache, fileName);
  if (target.exists) target.delete();
  const file = await File.downloadFileAsync(url, target);
  await share(file, fileName);
}
