/** Reads params from both the query (?code=…) and the fragment (#access_token=…, #error=…). */
export function authParams(url: string | null): Record<string, string> {
  if (!url) return {};
  const out: Record<string, string> = {};
  const query = url.split("#")[0].split("?")[1] ?? "";
  const fragment = url.split("#")[1] ?? "";
  for (const part of [query, fragment]) {
    new URLSearchParams(part).forEach((value, key) => { out[key] = value; });
  }
  return out;
}
