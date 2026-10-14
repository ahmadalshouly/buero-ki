// Finds doctors, lawyers and Beratungsstellen near the person, from OpenStreetMap.
// Takes the phone's position (rounded to about 100 m) or a place name, which is looked up
// with Nominatim. No AI is involved, so it does not need the AI consent.
import { handler, HttpError } from "../_shared/http.ts";
import { type Center, coarse, overpassQuery, parseGeocode, parsePlaces, type Place, PlacesInput } from "../_shared/places.ts";

// Overpass and Nominatim ask every app to name itself.
const USER_AGENT = "BueroKI/1.0 (https://github.com/ahmadalshouly/buero-ki)";
const OVERPASS = (Deno.env.get("OVERPASS_URLS") ?? "https://overpass-api.de/api/interpreter,https://overpass.private.coffee/api/interpreter")
  .split(",").map((s) => s.trim()).filter(Boolean);
const NOMINATIM = Deno.env.get("NOMINATIM_URL") ?? "https://nominatim.openstreetmap.org/search";
const TTL_MS = 6 * 3600_000;

// Places change slowly; a warm function answers repeat searches without asking OpenStreetMap again.
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

async function geocode(place: string): Promise<Center> {
  const url = `${NOMINATIM}?${new URLSearchParams({ q: place, countrycodes: "de", format: "json", limit: "1", "accept-language": "de" })}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new HttpError(502, "The map service is unavailable right now. Please try again.", "upstream");
  const center = parseGeocode(await res.json());
  if (!center) throw new HttpError(404, "We could not find this place in Germany.", "place_not_found");
  return center;
}

async function overpass(query: string): Promise<unknown> {
  let lastStatus = 0;
  for (const url of OVERPASS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(25_000),
      });
      if (res.ok) return await res.json();
      lastStatus = res.status;
    } catch {
      lastStatus = 0;
    }
  }
  throw new HttpError(502, `The map service is unavailable right now (${lastStatus || "timeout"}). Please try again.`, "upstream");
}

Deno.serve(handler("find-help", PlacesInput, async (ctx) => {
  const { kind, place, radius_km } = ctx.input;
  const center: Center = ctx.input.lat !== undefined && ctx.input.lon !== undefined
    ? { lat: coarse(ctx.input.lat), lon: coarse(ctx.input.lon), label: null }
    : await cached(`geo:${place!.toLowerCase()}`, () => geocode(place!));

  const places = await cached<Place[]>(
    `${kind}:${coarse(center.lat)}:${coarse(center.lon)}:${radius_km}`,
    async () => parsePlaces(kind, center, await overpass(overpassQuery(kind, center.lat, center.lon, radius_km))),
  );
  // Positions are not logged; the count is enough to see whether a kind finds anything.
  ctx.log("found", { kind, radius_km, count: places.length, by: place ? "place" : "position" });
  return { center, places };
}, { requireConsent: false }));
