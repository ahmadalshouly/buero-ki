// Turns a drafted German letter into a printable A4 page laid out after DIN 5008
// (form B), so the recipient address sits in the window of a standard DL or C5/6
// window envelope and the fold marks line up.

export interface LetterParts {
  sender: string[];
  recipient: string[];
  date: string | null;
  subject: string | null;
  body: string[];
}

const SUBJECT = /^\s*(betreff|betr\.)\s*:?\s*/i;
const DATE = /\d{1,2}\.\s?\d{1,2}\.\s?\d{2,4}|\d{1,2}\.\s+[A-Za-zäÄ]+\s+\d{4}/;
const PLACEHOLDER = /\[[^\]\n]{1,60}\]/g;

function blocks(lines: string[]): string[][] {
  const out: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line.trim()) current.push(line.trim());
    else if (current.length) {
      out.push(current);
      current = [];
    }
  }
  if (current.length) out.push(current);
  return out;
}

/**
 * Splits the letter into sender, recipient, date, subject and body. Everything
 * before the "Betreff" line is the head: the first block is the sender, the next
 * one the recipient, and a block that contains a date is the place and date.
 * Without a Betreff line the whole text is treated as body.
 */
export function parseLetter(text: string, fallbackSubject?: string): LetterParts {
  const lines = text.replace(/\r/g, "").split("\n");
  const subjectAt = lines.findIndex((l) => SUBJECT.test(l));
  if (subjectAt < 0) {
    return { sender: [], recipient: [], date: null, subject: fallbackSubject ?? null, body: lines };
  }
  const head = blocks(lines.slice(0, subjectAt));
  const dateIndex = head.findIndex((b) => b.length <= 2 && b.some((l) => DATE.test(l)));
  const date = dateIndex >= 0 ? head[dateIndex].join(" ") : null;
  const rest = head.filter((_, i) => i !== dateIndex);
  const subject = lines[subjectAt].replace(SUBJECT, "").trim() || fallbackSubject || null;

  // Drop the blank lines between the subject and the salutation; keep the body's own spacing.
  const body = lines.slice(subjectAt + 1);
  while (body.length && !body[0].trim()) body.shift();
  while (body.length && !body[body.length - 1].trim()) body.pop();

  return {
    sender: rest[0] ?? [],
    recipient: rest.slice(1).flat(),
    date,
    subject,
    body,
  };
}

/** Fields the person still has to fill in, such as "[Ihre Adresse]". */
export function placeholders(text: string): string[] {
  return [...new Set(text.match(PLACEHOLDER) ?? [])].filter((p) => !/^\[\s*unterschrift\s*\]$/i.test(p));
}

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function lineHtml(line: string): string {
  if (/^\s*\[\s*unterschrift\s*\]\s*$/i.test(line)) return '<div class="sign"></div>';
  const html = escape(line).replace(/\[([^\]\n]{1,60})\]/g, '<span class="ph">[$1]</span>');
  return html.trim() ? `<div>${html}</div>` : '<div class="gap"></div>';
}

/** Full HTML document for one A4 page (more if the body is long). */
export function letterHtml(text: string, fallbackSubject?: string): string {
  const p = parseLetter(text, fallbackSubject);
  const senderLine = p.sender.join(", ");
  const structured = p.recipient.length > 0;
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>${escape(p.subject ?? "Brief")}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.38; color: #111; }
  .page { position: relative; width: 210mm; min-height: 297mm; padding: 27mm 20mm 20mm 25mm; }
  .mark { position: absolute; left: 0; width: 6mm; border-top: 0.3pt solid #888; }
  .sender { position: absolute; top: 18mm; right: 20mm; text-align: right; font-size: 9.5pt; line-height: 1.35; }
  .window { position: absolute; top: 45mm; left: 25mm; width: 85mm; height: 45mm; }
  .return { font-size: 7pt; color: #444; border-bottom: 0.3pt solid #999; padding-bottom: 1mm; margin-bottom: 2mm;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .date { position: absolute; top: 98mm; right: 20mm; }
  .content { padding-top: ${structured ? "84mm" : "0"}; }
  .subject { font-weight: bold; margin-bottom: 8mm; }
  .gap { height: 1.38em; }
  .sign { height: 16mm; }
  .ph { background: #fff2b3; }
</style></head>
<body><div class="page">
  <div class="mark" style="top:105mm"></div>
  <div class="mark" style="top:148.5mm; width:9mm"></div>
  <div class="mark" style="top:210mm"></div>
  ${structured ? `
  <div class="sender">${p.sender.map(lineHtml).join("")}</div>
  <div class="window">
    ${senderLine ? `<div class="return">${escape(senderLine)}</div>` : ""}
    ${p.recipient.map(lineHtml).join("")}
  </div>
  ${p.date ? `<div class="date">${escape(p.date)}</div>` : ""}` : ""}
  <div class="content">
    ${p.subject ? `<div class="subject">${escape(p.subject)}</div>` : ""}
    ${p.body.map(lineHtml).join("")}
  </div>
</div></body></html>`;
}

/** A file name like "2026-10-14_Einreichung-von-Unterlagen.pdf". */
export function letterFileName(subject: string, date = new Date()): string {
  const slug = subject
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 60) || "Brief";
  return `${date.toISOString().slice(0, 10)}_${slug}.pdf`;
}
