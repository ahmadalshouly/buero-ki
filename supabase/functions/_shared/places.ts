// Places near the person from OpenStreetMap: doctors, lawyers and Beratungsstellen.
// OpenStreetMap is free, needs no key and covers all of Germany; counseling offices are
// often only findable by name, so those kinds also match on typical words in the name.
import { z } from "npm:zod@4.6.7";

export const HELP_KINDS = [
  "doctor",
  "dentist",
  "psychotherapy",
  "lawyer",
  "migration",
  "social",
  "debt",
  "tenant",
  "consumer",
  "tax",
  "patient",
] as const;
export type HelpKind = (typeof HELP_KINDS)[number];

// Lawyers and doctors are searched by type: nobody needs every lawyer or every doctor.
// Doctor keys are OpenStreetMap healthcare:speciality values.
export const LAWYER_SPECIALTIES = [
  "migration",
  "social",
  "tenancy",
  "labour",
  "family",
  "criminal",
  "traffic",
  "tax",
  "insolvency",
  "contract",
  "inheritance",
  "medical",
] as const;
export const DOCTOR_SPECIALTIES = [
  "general",
  "paediatrics",
  "gynaecology",
  "ophthalmology",
  "otolaryngology",
  "dermatology",
  "orthopaedics",
  "internal",
  "neurology",
  "psychiatry",
  "urology",
  "cardiology",
] as const;
export const SPECIALTIES = [...new Set([...LAWYER_SPECIALTIES, ...DOCTOR_SPECIALTIES])] as [string, ...string[]];
export type Specialty = (typeof LAWYER_SPECIALTIES)[number] | (typeof DOCTOR_SPECIALTIES)[number];

export function specialtiesFor(kind: HelpKind): readonly string[] {
  return kind === "lawyer" ? LAWYER_SPECIALTIES : kind === "doctor" ? DOCTOR_SPECIALTIES : [];
}

// Overpass filters per kind. Each entry is one `nwr…` statement without the area filter.
// Name searches use word stems without the first letter instead of a case-insensitive match:
// "chuldner" finds Schuldnerberatung and Schuldner- und Insolvenzberatung, and the busy public
// servers answer it several times faster.
const name = (stems: string) => `["name"~"${stems}"]`;
const FILTERS: Record<HelpKind, string[]> = {
  doctor: [`["amenity"="doctors"]`, `["healthcare"="doctor"]`, `["amenity"="clinic"]`],
  dentist: [`["amenity"="dentist"]`, `["healthcare"="dentist"]`],
  psychotherapy: [
    `["healthcare"="psychotherapist"]`,
    `["healthcare:speciality"~"psychiatry|psychotherapy|psychosomatic"]`,
  ],
  lawyer: [`["office"="lawyer"]`],
  migration: [
    `["social_facility:for"~"migrant|refugee"]["social_facility"!~"group_home|shelter|housing|assisted_living|nursing_home"]`,
    name("igrationsberatung|igrationsdienst|lüchtlingsberatung|ntegrationszentrum|ntegrationsagentur"),
  ],
  social: [
    `["healthcare"="counselling"]`,
    `["social_facility"="outreach"]`,
    name("ozialberatung|eratungsstelle|eratungszentrum"),
  ],
  debt: [name("chuldner|nsolvenzberatung")],
  tenant: [name("ieterverein|ieterbund|ieterschutz|ieterberatung|ietergemeinschaft")],
  consumer: [name("erbraucherzentrale|erbraucherberatung")],
  tax: [name("ohnsteuerhilfe|ohnsteuerberatung")],
  patient: [name("atientenberatung|atientenfürsprech|atientenstelle")],
};

export const PlacesInput = z.strictObject({
  kind: z.enum(HELP_KINDS),
  lat: z.number().min(47).max(55.2).optional(),
  lon: z.number().min(5.5).max(15.5).optional(),
  // A city, district or postcode in Germany, used when there is no position.
  place: z.string().trim().min(2).max(120).optional(),
  radius_km: z.number().min(1).max(25).default(5),
  // The type of lawyer or doctor; other kinds have none.
  specialty: z.enum(SPECIALTIES).optional(),
}).refine((v) => (v.lat !== undefined && v.lon !== undefined) || !!v.place, { message: "Give a position or a place" })
  .refine((v) => !v.specialty || specialtiesFor(v.kind).includes(v.specialty), { message: "This kind has no such type" });
export type PlacesInput = z.infer<typeof PlacesInput>;

export interface Place {
  id: string;
  kind: HelpKind;
  name: string;
  lat: number;
  lon: number;
  distance_m: number;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  opening_hours: string | null;
  /** ISO 639-1 codes of languages the place says it speaks (from language:xx tags). */
  languages: string[];
  wheelchair: boolean | null;
}

export interface Center {
  lat: number;
  lon: number;
  label: string | null;
}

/** Rounds a position to about 100 m: enough for nearby places, and the exact spot never leaves the function. */
export const coarse = (x: number) => Math.round(x * 1000) / 1000;

/** A box around the position: Overpass servers answer box queries much faster than radius ones. */
export function bbox(lat: number, lon: number, radiusKm: number): string {
  const dLat = radiusKm / 111.32;
  const dLon = radiusKm / (111.32 * Math.cos(lat * Math.PI / 180));
  const r = (x: number) => x.toFixed(4);
  return `${r(lat - dLat)},${r(lon - dLon)},${r(lat + dLat)},${r(lon + dLon)}`;
}

/** OpenStreetMap filters for a kind. A doctor's type narrows the search; lawyers carry no type there. */
function filtersFor(kind: HelpKind, specialty?: string): string[] {
  if (kind === "doctor" && specialty) {
    const s = `["healthcare:speciality"~"${specialty}"]`;
    return [`["amenity"="doctors"]${s}`, `["healthcare"="doctor"]${s}`];
  }
  return FILTERS[kind];
}

export function overpassQuery(kind: HelpKind, lat: number, lon: number, radiusKm: number, limit = 150, specialty?: string): string {
  const box = `(${bbox(coarse(lat), coarse(lon), radiusKm)})`;
  const parts = filtersFor(kind, specialty).map((f) => `nwr${f}${box};`).join("");
  return `[out:json][timeout:15];(${parts});out center tags ${limit};`;
}

export function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * 6371000 * Math.asin(Math.sqrt(h)));
}

interface OsmElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

const first = (tags: Record<string, string>, ...keys: string[]) => {
  for (const k of keys) if (tags[k]?.trim()) return tags[k].split(";")[0].trim();
  return null;
};

function address(tags: Record<string, string>): string | null {
  const street = [tags["addr:street"] ?? tags["addr:place"], tags["addr:housenumber"]].filter(Boolean).join(" ");
  const town = [tags["addr:postcode"], tags["addr:city"]].filter(Boolean).join(" ");
  return [street, town].filter(Boolean).join(", ") || null;
}

function website(tags: Record<string, string>): string | null {
  const url = first(tags, "website", "contact:website", "url");
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function languages(tags: Record<string, string>): string[] {
  return Object.entries(tags)
    .filter(([k, v]) => /^language:[a-z]{2}$/.test(k) && /^(yes|main|only)$/.test(v))
    .map(([k]) => k.slice(9))
    .sort();
}

// Without a doctor, lawyer or counseling tag a name match is too loose (a shop called "Beratungsstelle Müller" is fine,
// a kindergarten run by a welfare association is not), so name-only kinds drop obvious non-offices.
const NOT_AN_OFFICE = /^(kindergarten|school|place_of_worship|restaurant|cafe|parking|bench|vending_machine|toilets)$/;
// Housing for refugees or the homeless is often tagged like an advice office, but nobody gives advice there.
const NOT_ADVICE = /unterkunft|wohnheim|notunterkunft|wohnprojekt|\bkita\b|kindergarten/i;
const ADVICE_KINDS: HelpKind[] = ["migration", "social", "debt", "tenant", "consumer", "tax", "patient"];

/** The box's corners lie outside the radius; those places are dropped. */
export function parsePlaces(kind: HelpKind, center: { lat: number; lon: number }, data: unknown, radiusKm = Infinity, max = 50): Place[] {
  const elements = ((data as { elements?: OsmElement[] })?.elements ?? []);
  const seen = new Set<string>();
  const places: Place[] = [];
  for (const el of elements) {
    const tags = el.tags ?? {};
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    const label = tags.name?.trim();
    if (!label || lat === undefined || lon === undefined) continue;
    if (NOT_AN_OFFICE.test(tags.amenity ?? "")) continue;
    if (ADVICE_KINDS.includes(kind) && NOT_ADVICE.test(label)) continue;
    // The same practice is often mapped twice (a point and its building).
    const dedupe = `${label.toLowerCase()}|${lat.toFixed(3)}|${lon.toFixed(3)}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    places.push({
      id: `${el.type}/${el.id}`,
      kind,
      name: label,
      lat,
      lon,
      distance_m: distanceM(center, { lat, lon }),
      address: address(tags),
      phone: first(tags, "phone", "contact:phone", "contact:mobile"),
      email: first(tags, "email", "contact:email"),
      website: website(tags),
      opening_hours: first(tags, "opening_hours"),
      languages: languages(tags),
      wheelchair: tags.wheelchair === "yes" ? true : tags.wheelchair === "no" ? false : null,
    });
  }
  return places.filter((p) => p.distance_m <= radiusKm * 1000).sort((a, b) => a.distance_m - b.distance_m).slice(0, max);
}

export function parseGeocode(data: unknown): Center | null {
  const hit = (data as { lat: string; lon: string; display_name?: string }[] | null)?.[0];
  if (!hit) return null;
  const lat = Number(hit.lat);
  const lon = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  // "Neukölln, Berlin, 12043, Deutschland" -> "Neukölln, Berlin"
  const label = hit.display_name?.split(",").map((s) => s.trim()).filter((s) => s && !/^\d{5}$/.test(s) && s !== "Deutschland")
    .slice(0, 2).join(", ") ?? null;
  return { lat, lon, label: label || null };
}

// Google Places (Text Search). Used when a GOOGLE_MAPS_API_KEY is set: it knows far more
// Beratungsstellen than OpenStreetMap, with phone numbers and opening hours.
const GOOGLE_TERMS: Record<HelpKind, string> = {
  doctor: "Hausarzt",
  dentist: "Zahnarzt",
  psychotherapy: "Psychotherapeut",
  lawyer: "Rechtsanwalt",
  migration: "Migrationsberatung",
  social: "Sozialberatung",
  debt: "Schuldnerberatung",
  tenant: "Mieterverein",
  consumer: "Verbraucherzentrale Beratungsstelle",
  tax: "Lohnsteuerhilfeverein",
  patient: "Patientenberatung",
};

export const GOOGLE_FIELDS = [
  "places.id", "places.displayName", "places.formattedAddress", "places.location", "places.nationalPhoneNumber",
  "places.websiteUri", "places.regularOpeningHours.weekdayDescriptions", "places.accessibilityOptions", "places.businessStatus",
].join(",");

const GOOGLE_SPECIALTY_TERMS: Record<Specialty, string> = {
  migration: "Rechtsanwalt Ausländerrecht",
  social: "Rechtsanwalt Sozialrecht",
  tenancy: "Rechtsanwalt Mietrecht",
  labour: "Rechtsanwalt Arbeitsrecht",
  family: "Rechtsanwalt Familienrecht",
  criminal: "Rechtsanwalt Strafrecht",
  traffic: "Rechtsanwalt Verkehrsrecht",
  tax: "Rechtsanwalt Steuerrecht",
  insolvency: "Rechtsanwalt Insolvenzrecht",
  contract: "Rechtsanwalt Vertragsrecht",
  inheritance: "Rechtsanwalt Erbrecht",
  medical: "Rechtsanwalt Medizinrecht",
  general: "Hausarzt",
  paediatrics: "Kinderarzt",
  gynaecology: "Frauenarzt",
  ophthalmology: "Augenarzt",
  otolaryngology: "HNO-Arzt",
  dermatology: "Hautarzt",
  orthopaedics: "Orthopäde",
  internal: "Internist",
  neurology: "Neurologe",
  psychiatry: "Psychiater",
  urology: "Urologe",
  cardiology: "Kardiologe",
};

export function googleRequest(kind: HelpKind, center: { lat: number; lon: number }, radiusKm: number, specialty?: string) {
  return {
    textQuery: (specialty && GOOGLE_SPECIALTY_TERMS[specialty as Specialty]) || GOOGLE_TERMS[kind],
    languageCode: "de",
    regionCode: "DE",
    pageSize: 20,
    locationBias: { circle: { center: { latitude: coarse(center.lat), longitude: coarse(center.lon) }, radius: Math.min(radiusKm, 50) * 1000 } },
  };
}

interface GooglePlace {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  nationalPhoneNumber?: string;
  websiteUri?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  accessibilityOptions?: { wheelchairAccessibleEntrance?: boolean };
  businessStatus?: string;
}

/** Google only biases by distance, so places far outside the chosen radius are dropped here. */
export function parseGooglePlaces(kind: HelpKind, center: { lat: number; lon: number }, radiusKm: number, data: unknown): Place[] {
  const places = ((data as { places?: GooglePlace[] })?.places ?? []);
  return places
    .filter((p) => p.location && p.displayName?.text && p.businessStatus !== "CLOSED_PERMANENTLY")
    .map((p): Place => {
      const lat = p.location!.latitude;
      const lon = p.location!.longitude;
      return {
        id: `google/${p.id}`,
        kind,
        name: p.displayName!.text!,
        lat,
        lon,
        distance_m: distanceM(center, { lat, lon }),
        address: p.formattedAddress?.replace(/, Deutschland$/, "") ?? null,
        phone: p.nationalPhoneNumber ?? null,
        email: null,
        website: p.websiteUri ?? null,
        opening_hours: p.regularOpeningHours?.weekdayDescriptions?.join("; ") ?? null,
        languages: [],
        wheelchair: p.accessibilityOptions?.wheelchairAccessibleEntrance ?? null,
      };
    })
    .filter((p) => p.distance_m <= radiusKm * 1500)
    .sort((a, b) => a.distance_m - b.distance_m);
}

/** Overpass answers 200 with a "remark" when the query ran out of time; that is a failure, not "nothing here". */
export function overpassFailed(data: unknown): string | null {
  const remark = (data as { remark?: string })?.remark;
  return remark && /error|timed out|out of memory/i.test(remark) ? remark : null;
}

// Finding a typed city or postcode with Google, so a search with a key never depends on Nominatim,
// which often turns away requests from shared servers.
export const GOOGLE_GEOCODE_FIELDS = "places.location,places.displayName,places.formattedAddress";

export function googleGeocodeRequest(place: string) {
  return { textQuery: `${place}, Deutschland`, languageCode: "de", regionCode: "DE", pageSize: 1 };
}

export function parseGoogleGeocode(data: unknown): Center | null {
  const hit = (data as { places?: { location?: { latitude: number; longitude: number }; displayName?: { text?: string } }[] })
    ?.places?.[0];
  const lat = hit?.location?.latitude;
  const lon = hit?.location?.longitude;
  if (typeof lat !== "number" || typeof lon !== "number") return null;
  if (!PlacesInput.shape.lat.safeParse(lat).success || !PlacesInput.shape.lon.safeParse(lon).success) return null;
  return { lat, lon, label: hit?.displayName?.text || null };
}
