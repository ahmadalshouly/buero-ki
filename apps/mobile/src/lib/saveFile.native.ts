import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

/** Writes a JSON file to the cache and opens the share sheet so the person can keep it. */
export async function saveJson(name: string, data: unknown): Promise<void> {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(data, null, 2));
  await Sharing.shareAsync(file.uri, { mimeType: "application/json", dialogTitle: name, UTI: "public.json" });
}
