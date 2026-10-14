import { ApiError, withTimeout } from "../lib/errors";

describe("withTimeout", () => {
  it("passes the result through when the work is quick", async () => {
    await expect(withTimeout(Promise.resolve("pdf"), 1000)).resolves.toBe("pdf");
  });

  it("stops waiting with a timeout error when the work never finishes", async () => {
    const never = new Promise<string>(() => {});
    const error = await withTimeout(never, 20).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("timeout");
  });
});
