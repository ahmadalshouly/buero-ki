// Measures which OpenStreetMap queries and servers answer fast enough for find-help.
const UA = "BueroKI/1.0 (https://github.com/ahmadalshouly/buero-ki)";
const lat = 52.4811, lon = 13.4353, r = 5000; // Berlin-Neukölln
const d = 0.045, b = `${lat - d},${lon - d * 1.6},${lat + d},${lon + d * 1.6}`;
const words = "migrationsberatung|migrationsdienst|jugendmigrationsdienst|flüchtlingsberatung|integrationszentrum";
const VARIANTS: Record<string, string> = {
  regexAround: `[out:json][timeout:25];(nwr(around:${r},${lat},${lon})["name"~"${words}",i];);out center tags 80;`,
  regexBbox: `[out:json][timeout:25];(nwr["name"~"${words}",i](${b}););out center tags 80;`,
  keysAround: `[out:json][timeout:25];(nwr(around:${r},${lat},${lon})["office"];nwr(around:${r},${lat},${lon})["amenity"~"^(social_facility|community_centre|social_centre)$"];nwr(around:${r},${lat},${lon})["healthcare"];);out center tags;`,
  keysBbox: `[out:json][timeout:25];(nwr["office"](${b});nwr["amenity"~"^(social_facility|community_centre|social_centre)$"](${b});nwr["healthcare"](${b}););out center tags;`,
  doctorBbox: `[out:json][timeout:25];(nwr["amenity"="doctors"](${b});nwr["healthcare"="doctor"](${b}););out center tags 80;`,
};
const SERVERS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const nameRe = new RegExp(words, "i");
await Promise.all(SERVERS.flatMap((url) => Object.entries(VARIANTS).map(async ([name, q]) => {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ data: q }), signal: AbortSignal.timeout(35_000) });
    const text = await res.text();
    let info = text.slice(0, 120).replace(/\s+/g, " ");
    try {
      const j = JSON.parse(text);
      const els = j.elements ?? [];
      info = `elements ${els.length}, name matches ${els.filter((e: { tags?: { name?: string } }) => nameRe.test(e.tags?.name ?? "")).length}, remark ${j.remark ?? "-"}`;
    } catch { /* not json */ }
    console.log(`${url.split("/")[2]} ${name} ${res.status} ${Date.now() - t0}ms ${info}`);
  } catch (e) {
    console.log(`${url.split("/")[2]} ${name} FAILED ${Date.now() - t0}ms ${String(e).slice(0, 80)}`);
  }
})));
for (const q of ["Migrationsberatung", "Schuldnerberatung", "Mieterverein", "Rechtsanwalt"]) {
  const t0 = Date.now();
  try {
    const res = await fetch(`https://photon.komoot.io/api/?${new URLSearchParams({ q, lat: String(lat), lon: String(lon), limit: "30", lang: "de" })}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
    const j = await res.json();
    const near = (j.features ?? []).filter((f: { geometry: { coordinates: number[] } }) => Math.abs(f.geometry.coordinates[1] - lat) < 0.1 && Math.abs(f.geometry.coordinates[0] - lon) < 0.15);
    console.log(`photon ${q} ${res.status} ${Date.now() - t0}ms features ${j.features?.length} within ~8km ${near.length}: ${near.slice(0, 4).map((f: { properties: { name?: string; osm_key?: string; osm_value?: string } }) => `${f.properties.name} [${f.properties.osm_key}=${f.properties.osm_value}]`).join("; ")}`);
  } catch (e) {
    console.log(`photon ${q} FAILED ${String(e).slice(0, 80)}`);
  }
}
