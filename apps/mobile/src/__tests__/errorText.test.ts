import { ApiError } from "../lib/errors";
import { friendlyError } from "../lib/errorText";
import i18n from "../lib/i18n";

const t = ((key: string) => (key === "common.error" ? "Something went wrong" : key)) as never;

describe("error text", () => {
  beforeAll(() => i18n.changeLanguage("ar"));
  afterAll(() => i18n.changeLanguage("en"));

  it("shows why an email was not sent, in every language", () => {
    expect(friendlyError(new ApiError("The email was not sent: boom", "send_failed"), t)).toBe("The email was not sent: boom");
  });

  it("adds a short reference to unexpected errors", () => {
    expect(friendlyError(new ApiError("Something went wrong on our side.", "internal" as never, "1234abcd-ffff"), t))
      .toBe("Something went wrong (internal · 1234abcd)");
    expect(friendlyError(new Error("x"), t)).toBe("Something went wrong");
  });
});
