import { demoApi } from "../lib/demo";
import { directionsUrl, formatDistance, HELP_DIRECTORIES, HELP_GROUPS, helpForCases, helpForCategory, sortForLanguage, telUrl } from "../lib/help";
import { CATEGORIES, HELP_KINDS, type HelpPlace } from "../lib/types";
import en from "../locales/en";

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

  it("suggests help for every case category, without repeats across cases", () => {
    for (const c of CATEGORIES) expect(helpForCategory(c).length).toBeGreaterThan(0);
    expect(helpForCategory("housing")[0]).toBe("tenant");
    expect(helpForCategory("auslaenderbehoerde")[0]).toBe("migration");
    const mixed = helpForCases(["jobcenter", "housing", "jobcenter"]);
    expect(new Set(mixed).size).toBe(mixed.length);
    expect(mixed).toEqual(["social", "lawyer", "debt", "tenant"]);
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
