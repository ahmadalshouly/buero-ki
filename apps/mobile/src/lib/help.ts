// Finding help: which kinds of help exist, which fit a case, and the official
// directories that cover what OpenStreetMap does not (languages spoken, specialties).
import { Platform } from "react-native";
import { useSyncExternalStore } from "react";
import type { IconName } from "@/components/ui";
import { getPrefs, setPrefs } from "./prefs";
import type { CaseCategory, HelpKind, HelpPlace, HelpWhere } from "./types";

export const HELP_GROUPS: { key: "health" | "legal" | "advice"; kinds: HelpKind[] }[] = [
  { key: "advice", kinds: ["migration", "social", "debt", "tenant", "consumer", "tax", "patient"] },
  { key: "legal", kinds: ["lawyer"] },
  { key: "health", kinds: ["doctor", "dentist", "psychotherapy"] },
];

export const HELP_ICONS: Record<HelpKind, IconName> = {
  doctor: "medkit-outline",
  dentist: "medical-outline",
  psychotherapy: "heart-outline",
  lawyer: "shield-checkmark-outline",
  migration: "globe-outline",
  social: "people-outline",
  debt: "wallet-outline",
  tenant: "home-outline",
  consumer: "cart-outline",
  tax: "calculator-outline",
  patient: "pulse-outline",
};

/** Official or nationwide searches, opened in the browser. `label` is a key under help.directory. */
export const HELP_DIRECTORIES: Partial<Record<HelpKind, { label: string; url: string }[]>> = {
  doctor: [{ label: "arztsuche", url: "https://arztsuche.116117.de/" }],
  psychotherapy: [{ label: "arztsuche", url: "https://arztsuche.116117.de/" }],
  lawyer: [{ label: "anwaltssuche", url: "https://anwaltauskunft.de/anwaltssuche" }],
  migration: [
    { label: "bamf", url: "https://bamf-navi.bamf.de/de/" },
    { label: "jmd", url: "https://www.jugendmigrationsdienste.de/" },
  ],
  social: [{ label: "caritas", url: "https://www.caritas.de/" }],
  debt: [{ label: "schulden", url: "https://www.meine-schulden.de/en/hilfe-finden/schuldnerberatungsstellen/bundesland" }],
  tenant: [{ label: "mieterbund", url: "https://www.mieterbund.de/beratung/mieterverein-vor-ort" }],
  consumer: [{ label: "verbraucherzentrale", url: "https://www.verbraucherzentrale.de/" }],
  patient: [{ label: "upd", url: "https://www.patientenberatung.de/" }],
};

// The kinds of help that usually fit a matter, best first.
const FOR_CATEGORY: Record<CaseCategory, HelpKind[]> = {
  jobcenter: ["social", "lawyer", "debt"],
  auslaenderbehoerde: ["migration", "lawyer"],
  familienkasse: ["social", "migration"],
  krankenkasse: ["patient", "social"],
  finanzamt: ["tax", "social"],
  buergeramt: ["migration", "social"],
  housing: ["tenant", "lawyer"],
  work: ["lawyer", "migration"],
  school: ["social", "migration"],
  other: ["migration", "social"],
};

export function helpForCategory(category: CaseCategory): HelpKind[] {
  return FOR_CATEGORY[category] ?? FOR_CATEGORY.other;
}

/** Kinds that fit any of the person's open cases, without repeats, in case order. */
export function helpForCases(categories: CaseCategory[], max = 4): HelpKind[] {
  const out: HelpKind[] = [];
  for (const c of categories) for (const k of helpForCategory(c)) if (!out.includes(k)) out.push(k);
  return out.slice(0, max);
}

/** Places that say they speak the language come first; the rest keep their distance order. */
export function sortForLanguage(places: HelpPlace[], lang: string): HelpPlace[] {
  if (lang === "de") return places;
  return [...places].sort((a, b) => Number(b.languages.includes(lang)) - Number(a.languages.includes(lang)) || a.distance_m - b.distance_m);
}

export function formatDistance(m: number, lang: string): string {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(m / 1000)} km`;
}

export function directionsUrl(place: Pick<HelpPlace, "lat" | "lon" | "name">, os: string = Platform.OS): string {
  const at = `${place.lat},${place.lon}`;
  if (os === "ios") return `https://maps.apple.com/?daddr=${at}&q=${encodeURIComponent(place.name)}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${at}`;
}

export const telUrl = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

// Where to search, shared by the help screens. A typed place is remembered on the device;
// the phone's position is only kept while the app runs.
let where: HelpWhere | null = getPrefs().helpPlace ? { place: getPrefs().helpPlace! } : null;
const listeners = new Set<() => void>();

export function setHelpWhere(next: HelpWhere) {
  where = next;
  if ("place" in next) setPrefs({ helpPlace: next.place });
  listeners.forEach((l) => l());
}

/** The chosen place or position, else the city from the profile, else nothing yet. */
export function useHelpWhere(profileCity: string | null | undefined): HelpWhere | null {
  const chosen = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => where,
    () => where,
  );
  return chosen ?? (profileCity?.trim() ? { place: profileCity.trim() } : null);
}
