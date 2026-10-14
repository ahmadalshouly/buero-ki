// Finds doctors, lawyers and Beratungsstellen near the person. With a GOOGLE_MAPS_API_KEY it asks
// Google Places; otherwise, or when Google fails, it asks OpenStreetMap. Takes the phone's position
// (rounded to about 100 m) or a place name, which is looked up with Nominatim.
// No AI is involved, so it does not need the AI consent.
import { handler, HttpError } from "../_shared/http.ts";
import {
  type Center, coarse, GOOGLE_FIELDS, googleRequest, type HelpKind, overpassFailed, overpassQuery, parseGeocode, parseGooglePlaces,
  parsePlaces, type Place, PlacesInput,
} from "../_shared/places.ts";

// Overpass and Nominatim ask every app to name itself.
const USER_AGENT = "BueroKI/1.0 (https://github.com/ahmadalshouly/buero-ki)";
const GOOGLE_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY") ?? "";
// The public Overpass servers are often busy; all are asked at once and the first good answer wins.
const OVERPASS = (Deno.env.get("OVERPASS_URLS") ??
  "https://overpass-api.de/api/interpreter,https://maps.mail.ru/osm/tools/overpass/api/interpreter,https://overpass.kumi.systems/api/interpreter")
  .split(",").map((s) => s.trim()).filter(Boolean);
const NOMINATIM = Deno.env.get("NOMINATIM_URL") ?? "https://nominatim.openstreetmap.org/search";
// The free servers are often busy, so a found answer is kept for a day.
const TTL_MS = 24 * 3600_000;

type Source = "google" | "osm";

// Places change slowly; a warm function answers repeat searches without asking again.
const cache = new Map<string, { at: number; value: unknown }>();
function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.value as T);
  return load().then((value) => {
    if (cache.size > 500) cache.clear();
    cache.set(key, { at: Date.now(), value });
    return value;
  });
}

const unavailable = () => new HttpError(502, "The map service is unavailable right now. Please try again.", "upstream");

async function geocode(place: string): Promise<Center> {
  const url = `${NOMINATIM}?${new URLSearchParams({ q: place, countrycodes: "de", format: "json", limit: "1", "accept-language": "de" })}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!res?.ok) throw unavailable();
  const center = parseGeocode(await res.json());
  if (!center) throw new HttpError(404, "We could not find this place in Germany.", "place_not_found");
  return center;
}

async function google(kind: HelpKind, center: Center, radiusKm: number): Promise<Place[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": GOOGLE_KEY, "X-Goog-FieldMask": GOOGLE_FIELDS },
    body: JSON.stringify(googleRequest(kind, center, radiusKm)),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`google ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return parseGooglePlaces(kind, center, radiusKm, await res.json());
}

async function overpassAt(url: string, query: string): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ data: query }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  const data = await res.json();
  const failed = overpassFailed(data);
  if (failed) throw new Error(`${new URL(url).host} ${failed.slice(0, 120)}`);
  return data;
}

async function osm(kind: HelpKind, center: Center, radiusKm: number): Promise<Place[]> {
  const query = overpassQuery(kind, center.lat, center.lon, radiusKm);
  const data = await Promise.any(OVERPASS.map((url) => overpassAt(url, query)));
  return parsePlaces(kind, center, data, radiusKm);
}

Deno.serve(handler("find-help", PlacesInput, async (ctx) => {
  const { kind, place, radius_km } = ctx.input;
  const center: Center = ctx.input.lat !== undefined && ctx.input.lon !== undefined
    ? { lat: coarse(ctx.input.lat), lon: coarse(ctx.input.lon), label: null }
    : await cached(`geo:${place!.toLowerCase()}`, () => geocode(place!));

  const result = await cached<{ source: Source; places: Place[] }>(
    `${kind}:${coarse(center.lat)}:${coarse(center.lon)}:${radius_km}`,
    async () => {
      if (GOOGLE_KEY) {
        try {
          return { source: "google", places: await google(kind, center, radius_km) };
        } catch (error) {
          ctx.logError("google failed, trying OpenStreetMap", { error: error instanceof Error ? error.message : String(error) });
        }
      }
      try {
        return { source: "osm", places: await osm(kind, center, radius_km) };
      } catch (error) {
        const reasons = error instanceof AggregateError ? error.errors.map(String) : [String(error)];
        ctx.logError("openstreetmap failed", { reasons });
        throw unavailable();
      }
    },
  );
  // Positions are not logged; the count is enough to see whether a kind finds anything.
  ctx.log("found", { kind, radius_km, source: result.source, count: result.places.length, by: place ? "place" : "position" });
  return { center, ...result };
}, { requireConsent: false }));
