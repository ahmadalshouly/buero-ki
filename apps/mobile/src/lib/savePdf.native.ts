import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { withTimeout } from "./errors";

const MAKE_SECONDS = 30;
const DOWNLOAD_SECONDS = 60;
// The share sheet stays open as long as the person wants; the caller only waits until it is up.
const SHEET_UP_MS = 1500;

/**
 * Opens the share sheet (save, print, send). Resolves once it is showing, not when it closes,
 * so the button stops loading even if iOS never reports back.
 */
export async function sharePdf(file: File, title: string): Promise<void> {
  const shared = Sharing.shareAsync(file.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: title });
  await Promise.race([shared, new Promise((r) => setTimeout(r, SHEET_UP_MS))]);
  shared.catch(() => {});
}

/** Renders HTML to an A4 PDF file with a readable name. */
export async function makePdf(html: string, fileName: string): Promise<File> {
  const { uri } = await withTimeout(Print.printToFileAsync({ html, width: 595, height: 842 }), MAKE_SECONDS * 1000);
  const target = new File(Paths.cache, fileName);
  if (target.exists) target.delete();
  await new File(uri).move(target);
  return target;
}

/** Renders HTML to an A4 PDF and opens the share sheet. */
export async function htmlToPdf(html: string, fileName: string): Promise<void> {
  await sharePdf(await makePdf(html, fileName), fileName);
}

/** Downloads a PDF (e.g. a filled form) and opens the share sheet. */
export async function downloadPdf(url: string, fileName: string): Promise<void> {
  const target = new File(Paths.cache, fileName);
  if (target.exists) target.delete();
  const file = await withTimeout(File.downloadFileAsync(url, target), DOWNLOAD_SECONDS * 1000);
  await sharePdf(file, fileName);
}
