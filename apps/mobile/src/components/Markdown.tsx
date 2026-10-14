// A small Markdown renderer for agent text: headings, bullet and numbered lists, bold.
import { Fragment } from "react";
import { Text, View } from "react-native";
import { textDir, useRtl } from "@/lib/direction";
import { scriptFont, useScriptFont } from "@/lib/fonts";
import { font, space, useColors } from "@/lib/theme";

export type MdBlock =
  | { kind: "heading"; text: string }
  | { kind: "item"; marker: string; text: string }
  | { kind: "paragraph"; text: string };

export function parseMarkdown(text: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (heading) blocks.push({ kind: "heading", text: heading[1] });
    else if (numbered) blocks.push({ kind: "item", marker: `${numbered[1]}.`, text: numbered[2] });
    else if (bullet) blocks.push({ kind: "item", marker: "•", text: bullet[1] });
    else blocks.push({ kind: "paragraph", text: line });
  }
  return blocks;
}

/** Splits text into plain and **bold** runs. */
export function splitBold(text: string): { text: string; bold: boolean }[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4
      ? { text: part.slice(2, -2), bold: true }
      : { text: part, bold: false }
  );
}

const BOLD = { fontWeight: "700" } as const;

function Inline({ text, rtl }: { text: string; rtl: boolean }) {
  // A bold run needs the bold face of the script font itself, not a synthesized bold.
  const bold = scriptFont(rtl, BOLD) ?? BOLD;
  return (
    <>
      {splitBold(text).map((run, i) =>
        run.bold ? <Text key={i} style={bold}>{run.text}</Text> : <Fragment key={i}>{run.text}</Fragment>
      )}
    </>
  );
}

export function Markdown({ text, color }: { text: string; color?: string }) {
  const c = useColors();
  const rtl = useRtl();
  const script = useScriptFont();
  const ink = color ?? c.ink;
  return (
    <View style={{ gap: space(2) }}>
      {parseMarkdown(text).map((block, i) => {
        if (block.kind === "heading") {
          return (
            <Text key={i} style={script([font.h3, { color: ink, marginTop: i ? space(2) : 0 }, textDir(rtl, block.text)])}>
              <Inline text={block.text} rtl={rtl} />
            </Text>
          );
        }
        if (block.kind === "item") {
          return (
            <View key={i} style={{ flexDirection: "row", gap: space(2), paddingStart: space(1) }}>
              <Text style={script([font.body, { color: c.accent, fontWeight: "700" }])}>{block.marker}</Text>
              <Text style={script([font.body, { color: ink, flexShrink: 1, flexGrow: 1 }, textDir(rtl, block.text)])}>
                <Inline text={block.text} rtl={rtl} />
              </Text>
            </View>
          );
        }
        return (
          <Text key={i} style={script([font.body, { color: ink }, textDir(rtl, block.text)])}>
            <Inline text={block.text} rtl={rtl} />
          </Text>
        );
      })}
    </View>
  );
}
