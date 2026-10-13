import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import type { PickedFile } from "./types";

export class PermissionDenied extends Error {}

function fromImage(result: ImagePicker.ImagePickerResult): PickedFile | null {
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  // quality < 1 makes iOS hand back a JPEG, even for HEIC photos.
  const mimeType = asset.mimeType && asset.mimeType !== "image/heic" ? asset.mimeType : "image/jpeg";
  return { uri: asset.uri, mimeType, name: asset.fileName ?? "letter.jpg" };
}

export async function takePhoto(): Promise<PickedFile | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new PermissionDenied();
  return fromImage(await ImagePicker.launchCameraAsync({ mediaTypes: "images", quality: 0.7 }));
}

export async function choosePhoto(): Promise<PickedFile | null> {
  return fromImage(await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", quality: 0.7 }));
}

export async function choosePdf(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, mimeType: asset.mimeType ?? "application/pdf", name: asset.name };
}
