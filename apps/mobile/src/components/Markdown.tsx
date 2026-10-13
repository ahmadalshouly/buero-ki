// A small Markdown renderer for agent text: headings, bullet and numbered lists, bold.
import { Fragment } from "react";
import { Text, View } from "react-native";
import { colors, space, type } from "@/lib/theme";

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <Text key={i} style={{ fontWeight: "700" }}>{part.slice(2, -2)}</Text>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      )}
    </>
  );
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  return (
    <View style={{ gap: space(2) }}>
      {lines.map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return null;
        const heading = line.match(/^#{1,4}\s+(.*)$/);
        if (heading) {
          return (
            <Text key={i} style={[type.h3, { marginTop: i ? space(2) : 0 }]}>
              <Inline text={heading[1]} />
            </Text>
          );
        }
        const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
        const numbered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
        if (bullet || numbered) {
          return (
            <View key={i} style={{ flexDirection: "row", gap: space(2), paddingStart: space(1) }}>
              <Text style={[type.body, { color: colors.accent, fontWeight: "700" }]}>
                {numbered ? `${numbered[1]}.` : "•"}
              </Text>
              <Text style={[type.body, { flex: 1 }]}>
                <Inline text={(numbered ? numbered[2] : bullet![1])} />
              </Text>
            </View>
          );
        }
        return (
          <Text key={i} style={type.body}>
            <Inline text={line} />
          </Text>
        );
      })}
    </View>
  );
}
