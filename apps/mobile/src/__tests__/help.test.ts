import { demoApi } from "../lib/demo";
import {
  directionsUrl, formatDistance, HELP_DIRECTORIES, HELP_GROUPS, helpForCases, helpForCategory, helpParams, helpTitle, sortForLanguage, specialtiesFor,
  telUrl,
} from "../lib/help";
import { CATEGORIES, HELP_KINDS, type HelpPlace } from "../lib/types";
import en from "../locales/en";

// A minimal t() over the English messages: looks up a dotted key and fills {{placeholders}}.
const t = (key: string, opts?: Record<string, string>) => {
  const found = key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], en);
  return typeof found === "string" ? found.replace(/{{(\w+)}}/g, (_, k) => opts?.[k] ?? "") : key;
};

const place = (id: string, distance_m: number, languages: string[] = []): HelpPlace => ({
  id, kind: "doctor", name: id, lat: 52.5, lon: 13.4, distance_m, address: null, phone: null, email: null, website: null,
  opening_hours: null, languages, wheelchair: null,
});

describe("help catalog", () => {
  it("lists every kind once, with text and an icon", () => {
    const grouped = HELP_GROUPS.flatMap((g) => g.kinds);
    expect([...grouped].sort()).toEqual([...HELP_KINDS].sort());
    for (const kind of HELP_KINDS) {
      expect(en.help.kind[kind]).toBeTruthy();
      expect(en.help.kindHint[kind]).toBeTruthy();
    }
    for (const list of Object.values(HELP_DIRECTORIES)) {
      for (const d of list!) {
        expect(d.url).toMatch(/^https:\/\//);
        expect(en.help.directory[d.label as keyof typeof en.help.directory]).toBeTruthy();
        expect(en.help.directoryHint[d.label as keyof typeof en.help.directoryHint]).toBeTruthy();
      }
    }
  });

  it("suggests help for every case category, with the area of law for lawyers, without repeats across cases", () => {
    for (const c of CATEGORIES) expect(helpForCategory(c).length).toBeGreaterThan(0);
    expect(helpForCategory("housing")).toEqual([{ kind: "tenant" }, { kind: "lawyer", specialty: "tenancy" }]);
    expect(helpForCategory("auslaenderbehoerde")[1]).toEqual({ kind: "lawyer", specialty: "migration" });
    const mixed = helpForCases(["jobcenter", "housing", "jobcenter"]);
    expect(mixed.map((s) => `${s.kind}:${s.specialty ?? ""}`)).toEqual(["social:", "lawyer:social", "debt:", "tenant:"]);
  });

  it("puts the search the letter analysis advised first", () => {
    const list = helpForCategory("jobcenter", { kind: "lawyer", specialty: "social" });
    expect(list[0]).toEqual({ kind: "lawyer", specialty: "social" });
    expect(list.filter((s) => s.kind === "lawyer")).toHaveLength(1);
    expect(helpParams(list[0], "c1")).toEqual({ kind: "lawyer", specialty: "social", caseId: "c1" });
  });

  it("names every lawyer and doctor type, and only lawyers and doctors have types", () => {
    for (const kind of HELP_KINDS) {
      for (const s of specialtiesFor(kind)) expect(helpTitle(t, { kind, specialty: s })).not.toMatch(/help\./);
      if (kind !== "lawyer" && kind !== "doctor") expect(specialtiesFor(kind)).toEqual([]);
    }
    expect(helpTitle(t, { kind: "lawyer", specialty: "tenancy" })).toBe("Lawyer for tenancy law");
    expect(helpTitle(t, { kind: "doctor", specialty: "paediatrics" })).toBe("Paediatrician");
  });
});

describe("help results", () => {
  it("puts places that speak the language first and keeps distance order otherwise", () => {
    const list = [place("a", 100), place("b", 200, ["ar"]), place("c", 300), place("d", 400, ["ar", "tr"])];
    expect(sortForLanguage(list, "ar").map((p) => p.id)).toEqual(["b", "d", "a", "c"]);
    expect(sortForLanguage(list, "de").map((p) => p.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("formats distances and links", () => {
    expect(formatDistance(347, "en")).toBe("350 m");
    expect(formatDistance(1530, "en")).toBe("1.5 km");
    expect(formatDistance(1530, "de")).toBe("1,5 km");
    expect(telUrl("+49 (30) 123-45")).toBe("tel:+493012345");
    expect(directionsUrl({ lat: 52.5, lon: 13.4, name: "Praxis A&B" }, "ios")).toBe("https://maps.apple.com/?daddr=52.5,13.4&q=Praxis%20A%26B");
    expect(directionsUrl({ lat: 52.5, lon: 13.4, name: "x" }, "android")).toContain("destination=52.5,13.4");
  });

  it("demo mode answers with nearby sample places", async () => {
    const res = await demoApi.findHelp("lawyer", { place: "Berlin" });
    expect(res.center.label).toBe("Berlin");
    expect(res.places.length).toBeGreaterThan(0);
    expect(res.places.every((p) => p.kind === "lawyer")).toBe(true);
  });
});
