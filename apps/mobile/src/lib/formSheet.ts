// Helpers for forms: progress, grouping, and the printable "filling sheet" for forms
// that are photos or scans, which lists what to write into each field.
import { letterFileName } from "./letter";
import type { CaseForm, FormField } from "./types";

/** A field counts as done when it has a value; signatures are done on paper. */
export function isFilled(f: FormField): boolean {
  return f.type === "signature" || (f.value !== null && f.value.trim() !== "");
}

export function formProgress(fields: FormField[]): { total: number; filled: number; missingRequired: number } {
  return {
    total: fields.length,
    filled: fields.filter(isFilled).length,
    missingRequired: fields.filter((f) => f.required && !isFilled(f)).length,
  };
}

/** What the person put into the form, for the agent to suggest what is worth remembering. */
export function formAnswersText(form: Pick<CaseForm, "title_de" | "file_name" | "fields">): string {
  const lines = form.fields
    .filter((f) => f.type !== "signature" && isFilled(f))
    .map((f) => `- ${f.label_de}: ${f.value!.trim()}`);
  return `I filled in the form "${form.title_de ?? form.file_name ?? "Formular"}" with these answers:\n${lines.join("\n")}`.slice(0, 4000);
}

export interface FieldGroup {
  title: string | null;
  page: number | null;
  fields: FormField[];
}

/** Groups fields under their section heading, keeping the order of the form. */
export function groupFields(fields: FormField[]): FieldGroup[] {
  const groups: FieldGroup[] = [];
  for (const f of fields) {
    const last = groups[groups.length - 1];
    if (last && last.title === f.section) last.fields.push(f);
    else groups.push({ title: f.section, page: f.page, fields: [f] });
  }
  return groups;
}

export function formFileName(form: Pick<CaseForm, "title_de" | "file_name">, suffix: string, date = new Date()): string {
  return letterFileName(`${form.title_de ?? form.file_name ?? "Formular"} ${suffix}`, date);
}

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface SheetLabels {
  heading: string;
  intro: string;
  page: string;
  field: string;
  write: string;
  missing: string;
  sign: string;
  yes: string;
  no: string;
}

function valueHtml(f: FormField, l: SheetLabels): string {
  if (f.type === "signature") return `<span class="sign">${escape(l.sign)}</span>`;
  if (!isFilled(f)) return `<span class="missing">${escape(l.missing)}</span>`;
  if (f.type === "checkbox") return /^(true|ja|yes|x|1)$/i.test(f.value!.trim()) ? `☒ ${escape(l.yes)}` : `☐ ${escape(l.no)}`;
  return `<b>${escape(f.value!)}</b>`;
}

/** Full HTML document for the filling sheet. */
export function formSheetHtml(form: CaseForm, l: SheetLabels): string {
  const groups = groupFields(form.fields);
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escape(form.title_de ?? l.heading)}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; line-height: 1.35; color: #111; margin: 0; }
  h1 { font-size: 15pt; margin: 0 0 1mm; }
  .sub { color: #555; margin: 0 0 4mm; }
  .intro { background: #f3f5f7; padding: 3mm 4mm; border-radius: 2mm; margin-bottom: 5mm; }
  h2 { font-size: 11.5pt; margin: 5mm 0 2mm; border-bottom: 0.4pt solid #999; padding-bottom: 1mm; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; padding: 1.6mm 2mm; border-bottom: 0.3pt solid #ddd; }
  td.label { width: 38%; }
  td.value { width: 34%; }
  td.help { color: #555; font-size: 9pt; }
  tr { page-break-inside: avoid; }
  .missing { background: #fff2b3; padding: 0 1mm; }
  .sign { border-bottom: 0.6pt solid #111; padding: 0 12mm 0 0; color: #555; }
</style></head>
<body>
  <h1>${escape(form.title_de ?? l.heading)}</h1>
  ${form.title ? `<p class="sub" dir="auto">${escape(form.title)}</p>` : ""}
  <div class="intro" dir="auto">${escape(l.intro)}</div>
  ${groups.map((g) => `
  <h2>${escape([g.page ? `${l.page} ${g.page}` : null, g.title].filter(Boolean).join(" · ") || l.heading)}</h2>
  <table>
    <tr><td class="label"><small>${escape(l.field)}</small></td><td class="value"><small>${escape(l.write)}</small></td><td class="help"></td></tr>
    ${g.fields.map((f) => `<tr>
      <td class="label">${escape(f.label_de)}</td>
      <td class="value">${valueHtml(f, l)}</td>
      <td class="help" dir="auto">${escape(f.explanation)}</td>
    </tr>`).join("")}
  </table>`).join("")}
</body></html>`;
}
