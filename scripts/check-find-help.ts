// Calls OpenStreetMap the way the find-help function does, to see what it answers.
import { overpassQuery, parseGeocode, parsePlaces } from "../supabase/functions/_shared/places.ts";

const UA = "BueroKI/1.0 (https://github.com/ahmadalshouly/buero-ki)";
const geo = await fetch(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q: "Berlin", countrycodes: "de", format: "json", limit: "1" })}`, { headers: { "User-Agent": UA } });
console.log("nominatim", geo.status);
const center = parseGeocode(await geo.json());
console.log("center", center);
for (const url of ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"]) {
  for (const kind of ["doctor", "lawyer", "migration"] as const) {
    const q = overpassQuery(kind, center!.lat, center!.lon, 5);
    const res = await fetch(url, { method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ data: q }) });
    const text = await res.text();
    let count = "n/a";
    try { count = String(parsePlaces(kind, center!, JSON.parse(text)).length); } catch { /* not json */ }
    console.log(url, kind, res.status, "places", count, text.slice(0, 300).replace(/\s+/g, " "));
  }
}
