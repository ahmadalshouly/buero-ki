import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import {
  coarse, distanceM, googleRequest, HELP_KINDS, overpassFailed, overpassQuery, parseGeocode, parseGooglePlaces, parsePlaces, PlacesInput,
} from "../_shared/places.ts";

const center = { lat: 52.4811, lon: 13.4353 }; // Berlin-Neukölln

Deno.test("overpass query searches every filter of a kind around a rounded position", () => {
  const q = overpassQuery("doctor", 52.48114, 13.43529, 3);
  assertMatch(q, /^\[out:json\]/);
  assertEquals(q.match(/\(52\.4541,13\.3907,52\.5079,13\.4793\)/g)?.length, 3);
  assertMatch(q, /\["amenity"="doctors"\]/);
  assertMatch(q, /out center tags \d+;$/);
  for (const kind of HELP_KINDS) assertMatch(overpassQuery(kind, 52.5, 13.4, 5), /^\[out:json\]\[timeout:15\];\(nwr\[/);
});

Deno.test("name searches are case-insensitive", () => {
  assertMatch(overpassQuery("tenant", 52.5, 13.4, 5), /\["name"~"mieterverein[^"]*",i\]/);
});

Deno.test("places: contact details, languages, dedupe, distance order", () => {
  const data = {
    elements: [
      {
        type: "way", id: 2, center: { lat: 52.49, lon: 13.44 },
        tags: { name: "Praxis Dr. Yilmaz", "addr:street": "Sonnenallee", "addr:housenumber": "12", "addr:postcode": "12045",
          "addr:city": "Berlin", "contact:phone": "+49 30 123;+49 30 456", website: "praxis-yilmaz.de", "language:tr": "yes",
          "language:ar": "yes", "language:de": "main", wheelchair: "yes" },
      },
      { type: "node", id: 1, lat: 52.4812, lon: 13.4354, tags: { name: "Hausarztpraxis Neukölln", opening_hours: "Mo-Fr 08:00-12:00" } },
      // The same practice mapped as a point too.
      { type: "node", id: 3, lat: 52.49001, lon: 13.44001, tags: { name: "Praxis Dr. Yilmaz" } },
      { type: "node", id: 4, lat: 52.48, lon: 13.43, tags: { amenity: "doctors" } },
      { type: "node", id: 5, lat: 52.48, lon: 13.43, tags: { name: "Kita Beratungsstelle", amenity: "kindergarten" } },
    ],
  };
  const places = parsePlaces("doctor", center, data);
  assertEquals(places.map((p) => p.id), ["node/1", "way/2"]);
  const [near, far] = places;
  assert(near.distance_m < 50);
  assertEquals(near.opening_hours, "Mo-Fr 08:00-12:00");
  assertEquals(far.address, "Sonnenallee 12, 12045 Berlin");
  assertEquals(far.phone, "+49 30 123");
  assertEquals(far.website, "https://praxis-yilmaz.de");
  assertEquals(far.languages, ["ar", "de", "tr"]);
  assertEquals(far.wheelchair, true);
  assertEquals(near.wheelchair, null);
});

Deno.test("places outside the radius are dropped", () => {
  const data = { elements: [
    { type: "node", id: 1, lat: 52.4812, lon: 13.4354, tags: { name: "Near" } },
    { type: "node", id: 2, lat: 52.52, lon: 13.48, tags: { name: "Corner of the box" } },
  ] };
  assertEquals(parsePlaces("doctor", center, data, 3).map((p) => p.name), ["Near"]);
});

Deno.test("advice kinds skip refugee housing and kindergartens", () => {
  const data = { elements: [
    { type: "node", id: 1, lat: 52.4812, lon: 13.4354, tags: { name: "Gemeinschaftsunterkunft Karl-Marx-Straße" } },
    { type: "node", id: 2, lat: 52.4813, lon: 13.4355, tags: { name: "Migrationsberatung Caritas" } },
  ] };
  assertEquals(parsePlaces("migration", center, data).map((p) => p.name), ["Migrationsberatung Caritas"]);
  assertEquals(parsePlaces("doctor", center, data).length, 2);
});

Deno.test("places survive an empty or odd answer", () => {
  assertEquals(parsePlaces("lawyer", center, null), []);
  assertEquals(parsePlaces("lawyer", center, { elements: [{ type: "node", id: 1 }] }), []);
});

Deno.test("geocode keeps a short label and rejects nothing found", () => {
  assertEquals(parseGeocode([{ lat: "52.48", lon: "13.43", display_name: "Neukölln, Berlin, 12043, Deutschland" }]),
    { lat: 52.48, lon: 13.43, label: "Neukölln, Berlin" });
  assertEquals(parseGeocode([]), null);
});

Deno.test("input needs a position in Germany or a place", () => {
  assert(PlacesInput.safeParse({ kind: "lawyer", lat: 52.5, lon: 13.4 }).success);
  assert(PlacesInput.safeParse({ kind: "debt", place: "12043" }).success);
  assertEquals(PlacesInput.parse({ kind: "debt", place: "Köln" }).radius_km, 5);
  assert(!PlacesInput.safeParse({ kind: "debt" }).success);
  assert(!PlacesInput.safeParse({ kind: "lawyer", lat: 40.7, lon: -74 }).success);
  assert(!PlacesInput.safeParse({ kind: "pizza", place: "Berlin" }).success);
});

Deno.test("distance and rounding", () => {
  assertEquals(coarse(52.481149), 52.481);
  const d = distanceM({ lat: 52.52, lon: 13.405 }, { lat: 48.137, lon: 11.575 }); // Berlin to Munich
  assert(d > 500_000 && d < 510_000);
});

Deno.test("google places: mapped, closed ones and far-away ones dropped, nearest first", () => {
  const data = {
    places: [
      {
        id: "a", displayName: { text: "Schuldnerberatung Neukölln" }, formattedAddress: "Karl-Marx-Straße 1, 12043 Berlin, Deutschland",
        location: { latitude: 52.48, longitude: 13.44 }, nationalPhoneNumber: "030 123456", websiteUri: "https://example.org",
        regularOpeningHours: { weekdayDescriptions: ["Montag: 09:00–16:00", "Dienstag: Geschlossen"] },
        accessibilityOptions: { wheelchairAccessibleEntrance: true }, businessStatus: "OPERATIONAL",
      },
      { id: "b", displayName: { text: "Alte Beratung" }, location: { latitude: 52.481, longitude: 13.435 }, businessStatus: "CLOSED_PERMANENTLY" },
      { id: "c", displayName: { text: "Schuldnerberatung München" }, location: { latitude: 48.137, longitude: 11.575 } },
      { id: "d", displayName: { text: "Schuldnerhilfe Mitte" }, location: { latitude: 52.4812, longitude: 13.4354 } },
    ],
  };
  const places = parseGooglePlaces("debt", center, 5, data);
  assertEquals(places.map((p) => p.id), ["google/d", "google/a"]);
  const a = places[1];
  assertEquals(a.address, "Karl-Marx-Straße 1, 12043 Berlin");
  assertEquals(a.phone, "030 123456");
  assertEquals(a.opening_hours, "Montag: 09:00–16:00; Dienstag: Geschlossen");
  assertEquals(a.wheelchair, true);
  assertEquals(parseGooglePlaces("debt", center, 5, {}), []);
});

Deno.test("google request searches the German term near a rounded position", () => {
  const req = googleRequest("tenant", { lat: 52.48114, lon: 13.43529 }, 10);
  assertEquals(req.textQuery, "Mieterverein");
  assertEquals(req.locationBias.circle, { center: { latitude: 52.481, longitude: 13.435 }, radius: 10000 });
});

Deno.test("an Overpass answer that ran out of time counts as failed", () => {
  assertEquals(overpassFailed({ elements: [], remark: "runtime error: Query timed out in \"query\" at line 1 after 16 seconds." }) !== null, true);
  assertEquals(overpassFailed({ elements: [] }), null);
});
