import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { categoryIcon } from "@/lib/categories";
import { useIconFlip } from "@/lib/direction";
import { space, useColors } from "@/lib/theme";
import type { Case } from "@/lib/types";
import { IconCircle, Muted, Txt } from "./ui";

/** Where row separators start in a group of case rows: past the icon, in line with the title. */
export const CASE_ROW_INSET = space(4) + 40 + space(3);

/** A case as a row of a grouped list; place it inside a <Group inset={CASE_ROW_INSET}>. */
export function CaseRow({
  item, subtitle, children, onPress, chevron = true,
}: { item: Pick<Case, "title" | "category" | "status">; subtitle?: string | null; children?: ReactNode; onPress: () => void; chevron?: boolean }) {
  const c = useColors();
  const flip = useIconFlip("chevron-forward");
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        { flexDirection: "row", alignItems: "center", gap: space(3), paddingVertical: space(3), paddingHorizontal: space(4), minHeight: 64 },
        pressed && { backgroundColor: c.raised },
      ]}
    >
      <IconCircle name={categoryIcon(item.category)} tone={item.status === "closed" ? "neutral" : "accent"} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="h3" numberOfLines={2}>{item.title}</Txt>
        {subtitle ? <Muted numberOfLines={2}>{subtitle}</Muted> : null}
        {children}
      </View>
      {chevron && <Ionicons name="chevron-forward" size={17} color={c.faint} style={[{ opacity: 0.7 }, flip]} />}
    </Pressable>
  );
}
