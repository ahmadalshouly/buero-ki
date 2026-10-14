import { emailIn, isEmailAddress } from "../lib/letter";

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
