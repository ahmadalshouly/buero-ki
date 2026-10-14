// Runs the find-help search against the live OpenStreetMap servers, the way the function does.
import { overpassFailed, overpassQuery, parsePlaces } from "../supabase/functions/_shared/places.ts";

const UA = "BueroKI/1.0 (https://github.com/ahmadalshouly/buero-ki)";
const SERVERS = ["https://overpass-api.de/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const center = { lat: 52.481, lon: 13.435 };
for (const kind of ["doctor", "lawyer", "debt", "migration", "social", "tenant"] as const) {
  const q = overpassQuery(kind, center.lat, center.lon, 5);
  const t0 = Date.now();
  try {
    const { data, url } = await Promise.any(SERVERS.map(async (url) => {
      const res = await fetch(url, { method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ data: q }), signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`${url} ${res.status}`);
      const data = await res.json();
      if (overpassFailed(data)) throw new Error(`${url} ${overpassFailed(data)}`);
      return { data, url };
    }));
    const places = parsePlaces(kind, center, data, 5);
    console.log(kind, "OK", Date.now() - t0, "ms via", new URL(url).host, "places", places.length, places.slice(0, 3).map((p) => p.name).join(" | "));
  } catch (e) {
    console.log(kind, "FAILED", Date.now() - t0, "ms", e instanceof AggregateError ? e.errors.map(String).join(" ; ") : String(e));
  }
}
