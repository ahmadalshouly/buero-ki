import * as Location from "expo-location";

/** The phone's position, asked once with the person's permission. Null when they say no. */
export async function currentPosition(): Promise<{ lat: number; lon: number } | null> {
  const { granted } = await Location.requestForegroundPermissionsAsync();
  if (!granted) return null;
  // A recent position is good enough for "near me" and answers at once.
  const last = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 }).catch(() => null);
  const pos = last ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { lat: pos.coords.latitude, lon: pos.coords.longitude };
}
