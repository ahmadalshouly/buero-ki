// Calls OpenStreetMap the way the find-help function does, to see what it answers.
import { overpassQuery, parseGeocode, parsePlaces } from "../supabase/functions/_shared/places.ts";

const UA = "BueroKI/1.0 (https://github.com/ahmadalshouly/buero-ki)";
const geo = await fetch(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q: "Berlin", countrycodes: "de", format: "json", limit: "1" })}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
console.log("nominatim", geo.status);
const center = parseGeocode(await geo.json());
console.log("center", center);
for (const url of ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"]) {
  for (const kind of ["doctor", "lawyer", "migration"] as const) {
    const q = overpassQuery(kind, center!.lat, center!.lon, 5);
    const t0 = Date.now();
    let res: Response, text: string;
    try {
      res = await fetch(url, { method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ data: q }), signal: AbortSignal.timeout(40_000) });
      text = await res.text();
    } catch (e) {
      console.log(url, kind, "FAILED after", Date.now() - t0, "ms", String(e));
      continue;
    }
    let count = "n/a";
    try { count = String(parsePlaces(kind, center!, JSON.parse(text)).length); } catch { /* not json */ }
    console.log(url, kind, res.status, Date.now() - t0, "ms", "places", count, text.slice(0, 300).replace(/\s+/g, " "));
  }
}
