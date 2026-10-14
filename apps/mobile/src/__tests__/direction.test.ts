import { textDir } from "@/lib/direction";

describe("textDir", () => {
  it("leaves left-to-right languages alone", () => {
    expect(textDir(false, "Hello")).toBeNull();
  });

  it("reads Arabic text right-to-left", () => {
    expect(textDir(true, "مرحبًا، Amina")).toEqual({ writingDirection: "rtl" });
  });

  it("keeps Latin-only text left-to-right but on the reading side", () => {
    // React Native swaps left and right inside an RTL layout, so "left" lands on the right edge.
    expect(textDir(true, "anlagevm_ba033055.pdf")).toEqual({ writingDirection: "ltr", textAlign: "left" });
  });

  it("treats numbers and nested elements as part of the UI language", () => {
    expect(textDir(true, "12")).toEqual({ writingDirection: "rtl" });
    expect(textDir(true, undefined)).toEqual({ writingDirection: "rtl" });
  });
});
