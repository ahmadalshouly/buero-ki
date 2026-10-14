import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { letterFileName, letterHtml } from "./letter";

/** Renders the letter to an A4 PDF and opens the share sheet (save, print, send). */
export async function exportLetterPdf(text: string, subject: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html: letterHtml(text, subject), width: 595, height: 842 });
  // Give the file a readable name before sharing it.
  const target = new File(Paths.cache, letterFileName(subject));
  if (target.exists) target.delete();
  await new File(uri).move(target);
  await Sharing.shareAsync(target.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: subject });
}
