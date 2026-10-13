import ar from "../locales/ar";
import de from "../locales/de";
import en from "../locales/en";
import fa from "../locales/fa";
import tr from "../locales/tr";
import uk from "../locales/uk";

const PLURAL = /_(zero|one|two|few|many|other)$/;

function paths(obj: unknown, prefix = ""): string[] {
  if (typeof obj === "string" || Array.isArray(obj)) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    paths(v, prefix ? `${prefix}.${k.replace(PLURAL, "")}` : k.replace(PLURAL, "")));
}

function placeholders(obj: unknown, prefix = "", out: Record<string, string[]> = {}): Record<string, string[]> {
  if (typeof obj === "string") {
    out[prefix.replace(PLURAL, "")] = [...new Set(obj.match(/{{\w+}}/g) ?? [])].sort();
  } else if (!Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) placeholders(v, prefix ? `${prefix}.${k}` : k, out);
  }
  return out;
}

const english = new Set(paths(en));
const locales = { de, ar, tr, uk, fa };

describe.each(Object.entries(locales))("%s", (_name, messages) => {
  it("has exactly the English keys", () => {
    const keys = new Set(paths(messages));
    expect([...english].filter((k) => !keys.has(k))).toEqual([]);
    expect([...keys].filter((k) => !english.has(k))).toEqual([]);
  });

  it("keeps every {{placeholder}}", () => {
    const want = placeholders(en);
    const got = placeholders(messages);
    for (const [key, vars] of Object.entries(got)) {
      // A plural form may leave out {{count}} (e.g. Arabic "one" says the word, not the digit).
      expect(vars.filter((v) => v !== "{{count}}")).toEqual((want[key] ?? []).filter((v) => v !== "{{count}}"));
    }
  });

  it("keeps the arrays the same length", () => {
    expect((messages as typeof en).onboarding.consentPoints).toHaveLength(en.onboarding.consentPoints.length);
    expect((messages as typeof en).chat.examples).toHaveLength(en.chat.examples.length);
  });
});
