import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import type { PickedFile } from "./types";

export class PermissionDenied extends Error {}

function fromImages(result: ImagePicker.ImagePickerResult): PickedFile[] {
  if (result.canceled || !result.assets?.length) return [];
  return result.assets.map((asset, i) => ({
    uri: asset.uri,
    // quality < 1 makes iOS hand back a JPEG, even for HEIC photos.
    mimeType: asset.mimeType && asset.mimeType !== "image/heic" ? asset.mimeType : "image/jpeg",
    name: asset.fileName ?? `page-${i + 1}.jpg`,
  }));
}

export async function takePhoto(): Promise<PickedFile[]> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new PermissionDenied();
  return fromImages(await ImagePicker.launchCameraAsync({ mediaTypes: "images", quality: 0.7 }));
}

export async function choosePhotos(limit: number): Promise<PickedFile[]> {
  return fromImages(await ImagePicker.launchImageLibraryAsync({
    mediaTypes: "images",
    quality: 0.7,
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
    orderedSelection: true,
  }));
}

export async function choosePdf(): Promise<PickedFile[]> {
  const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.length) return [];
  const asset = result.assets[0];
  return [{ uri: asset.uri, mimeType: asset.mimeType ?? "application/pdf", name: asset.name }];
}
