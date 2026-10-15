import { emailIn, isEmailAddress, letterAttachments, officeEmail } from "../lib/letter";

describe("sending emails", () => {
  it("accepts exactly one plain address", () => {
    expect(isEmailAddress("poststelle@jobcenter-ge.de")).toBe(true);
    expect(isEmailAddress("a@b.de, c@d.de")).toBe(false);
    expect(isEmailAddress("Amt <amt@stadt.de>")).toBe(false);
    expect(isEmailAddress("amt@stadt")).toBe(false);
  });

  it("finds the office's address in the case", () => {
    expect(emailIn("Jobcenter Mitte, jobcenter-berlin-mitte@jobcenter-ge.de")).toBe("jobcenter-berlin-mitte@jobcenter-ge.de");
    expect(emailIn("Ausländerbehörde")).toBe("");
    expect(emailIn(null)).toBe("");
  });
});

describe("office email from letters", () => {
  const letter = (id: string, created_at: string, sender_email: string | null) =>
    ({ id, created_at, title_de: `Brief ${id}`, analysis: { sender_email } as never });

  it("prefers the letter being answered, then the newest letter with an address", () => {
    const docs = [letter("a", "2026-10-01", "Alt@Amt.de"), letter("b", "2026-10-10", "neu@amt.de"), letter("c", "2026-10-12", null)];
    expect(officeEmail("a", docs, null)).toEqual({ email: "alt@amt.de", letter: "Brief a" });
    expect(officeEmail("c", docs, null)).toEqual({ email: "neu@amt.de", letter: "Brief b" });
    expect(officeEmail(null, docs, null)).toEqual({ email: "neu@amt.de", letter: "Brief b" });
  });

  it("falls back to an address in the office field, and ignores broken ones", () => {
    expect(officeEmail(null, [letter("x", "2026-10-01", "not an email")], "Stadt, buergeramt@stadt.de"))
      .toEqual({ email: "buergeramt@stadt.de", letter: null });
    expect(officeEmail(null, [], null)).toEqual({ email: "", letter: null });
  });
});

describe("attaching letters", () => {
  it("names each page after the letter", () => {
    expect(letterAttachments({ storage_path: "u/c/a.jpg", page_paths: ["u/c/a-1.jpg", "u/c/a-2.jpg"], title_de: "Bescheid", file_name: null }))
      .toEqual([
        { path: "u/c/a-1.jpg", name: "Bescheid Seite 1.jpg", mime: "image/jpeg", own: false },
        { path: "u/c/a-2.jpg", name: "Bescheid Seite 2.jpg", mime: "image/jpeg", own: false },
      ]);
    expect(letterAttachments({ storage_path: "u/c/b.pdf", page_paths: [], title_de: null, file_name: "Mahnung.pdf" }))
      .toEqual([{ path: "u/c/b.pdf", name: "Mahnung.pdf", mime: "application/pdf", own: false }]);
  });
});
