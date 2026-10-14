import { parseMarkdown, splitBold } from "../components/Markdown";
import { bucketOf, isIsoDate } from "../lib/dates";
import { ApiError, validatePages } from "../lib/errors";
import { daysUntil } from "../lib/i18n";
import { planReminders } from "../lib/reminders";
import type { PickedFile, Task } from "../lib/types";

const iso = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const task = (over: Partial<Task>): Task => ({
  id: "t1", case_id: "c1", document_id: null, title: "Send papers", due_date: null, done: false,
  source: "agent", completed_at: null, created_at: new Date().toISOString(), ...over,
});

describe("dates", () => {
  it("counts days from today", () => {
    expect(daysUntil(iso(0))).toBe(0);
    expect(daysUntil(iso(5))).toBe(5);
    expect(daysUntil(iso(-2))).toBe(-2);
  });

  it("buckets deadlines", () => {
    expect(bucketOf({ due_date: null })).toBe("noDate");
    expect(bucketOf({ due_date: iso(-1) })).toBe("overdue");
    expect(bucketOf({ due_date: iso(0) })).toBe("today");
    expect(bucketOf({ due_date: iso(7) })).toBe("week");
    expect(bucketOf({ due_date: iso(8) })).toBe("later");
  });

  it("accepts only real calendar dates", () => {
    expect(isIsoDate("2026-11-03")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("3.11.2026")).toBe(false);
  });
});

describe("markdown", () => {
  it("parses headings, lists and paragraphs", () => {
    expect(parseMarkdown("## What is this?\nA letter.\n\n- one\n2. two")).toEqual([
      { kind: "heading", text: "What is this?" },
      { kind: "paragraph", text: "A letter." },
      { kind: "item", marker: "•", text: "one" },
      { kind: "item", marker: "2.", text: "two" },
    ]);
  });

  it("splits bold runs", () => {
    expect(splitBold("Send the **Mietvertrag** now")).toEqual([
      { text: "Send the ", bold: false },
      { text: "Mietvertrag", bold: true },
      { text: " now", bold: false },
    ]);
  });
});

describe("reminders", () => {
  it("plans 3 days before and on the day, skipping past and done tasks", () => {
    const plan = planReminders([
      task({ id: "a", due_date: iso(10) }),
      task({ id: "b", due_date: iso(1) }),
      task({ id: "c", due_date: iso(10), done: true }),
      task({ id: "d", due_date: iso(-3) }),
      task({ id: "e" }),
    ]);
    expect(plan.filter((r) => r.taskId === "a").map((r) => r.kind)).toEqual(["soon", "today"]);
    expect(plan.filter((r) => r.taskId === "b").map((r) => r.kind)).toEqual(["today"]);
    expect(plan.some((r) => ["c", "d", "e"].includes(r.taskId))).toBe(false);
    expect(plan.map((r) => r.date.getTime())).toEqual([...plan.map((r) => r.date.getTime())].sort((x, y) => x - y));
  });

  it("stays under the iOS limit", () => {
    const many = Array.from({ length: 100 }, (_, i) => task({ id: `t${i}`, due_date: iso(10 + i) }));
    expect(planReminders(many).length).toBeLessThanOrEqual(60);
  });
});

describe("validatePages", () => {
  const jpg: PickedFile = { uri: "file:///a.jpg", mimeType: "image/jpeg", name: "a.jpg" };
  const pdf: PickedFile = { uri: "file:///a.pdf", mimeType: "application/pdf", name: "a.pdf" };

  it("accepts photos or one PDF", () => {
    expect(() => validatePages([jpg, jpg])).not.toThrow();
    expect(() => validatePages([pdf])).not.toThrow();
  });

  it("rejects empty, too many, mixed and unknown files", () => {
    expect(() => validatePages([])).toThrow(ApiError);
    expect(() => validatePages(Array(11).fill(jpg))).toThrow(/at most 10/);
    expect(() => validatePages([pdf, jpg])).toThrow(/PDF on its own/);
    expect(() => validatePages([{ ...jpg, mimeType: "image/heic" }])).toThrow(ApiError);
  });
});

describe("letter PDF", () => {
  const { letterFileName, letterHtml, parseLetter, placeholders } = jest.requireActual("../lib/letter") as typeof import("../lib/letter");
  const letter = `Amina Haddad
Musterstraße 1
10115 Berlin

Jobcenter Berlin Mitte
Seydelstraße 2-5
10117 Berlin

Berlin, 14.10.2026

Betreff: BG 12345//0067890 – Einreichung von Unterlagen

Sehr geehrte Damen und Herren,

anbei die Unterlagen.

Mit freundlichen Grüßen

[Unterschrift]

Amina Haddad`;

  it("splits a DIN letter into its parts", () => {
    const p = parseLetter(letter);
    expect(p.sender).toEqual(["Amina Haddad", "Musterstraße 1", "10115 Berlin"]);
    expect(p.recipient).toEqual(["Jobcenter Berlin Mitte", "Seydelstraße 2-5", "10117 Berlin"]);
    expect(p.date).toBe("Berlin, 14.10.2026");
    expect(p.subject).toBe("BG 12345//0067890 – Einreichung von Unterlagen");
    expect(p.body[0]).toBe("Sehr geehrte Damen und Herren,");
    expect(p.body.at(-1)).toBe("Amina Haddad");
  });

  it("falls back to plain text without a Betreff line", () => {
    const p = parseLetter("Hallo,\n\nText", "Betreff X");
    expect(p.recipient).toEqual([]);
    expect(p.subject).toBe("Betreff X");
  });

  it("lists fields still to fill in, but not the signature", () => {
    expect(placeholders("[Ihr Name]\n[Ihre Adresse]\n[Ihr Name]\n[Unterschrift]")).toEqual(["[Ihr Name]", "[Ihre Adresse]"]);
  });

  it("escapes text and leaves room for a signature", () => {
    const html = letterHtml(letter.replace("anbei", "<b>anbei</b>"));
    expect(html).toContain("&lt;b&gt;anbei");
    expect(html).toContain('class="sign"');
    expect(html).toContain("top:105mm");
  });

  it("makes a safe file name", () => {
    expect(letterFileName("Widerspruch gegen Bescheid vom 1.10.", new Date("2026-10-14T10:00:00Z")))
      .toBe("2026-10-14_Widerspruch-gegen-Bescheid-vom-1-10.pdf");
  });
});
