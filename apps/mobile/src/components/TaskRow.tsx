import { Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { useToggleTask } from "@/lib/queries";
import { space, useColors } from "@/lib/theme";
import type { Task } from "@/lib/types";
import { DueBadge, Muted, Txt } from "./ui";

/** Where row separators start in a group of tasks: in line with the task title. */
export const TASK_ROW_INSET = space(4) + 26 + space(3);

/** A task as a row of a grouped list; place it inside a <Group>. */
export function TaskRow({
  task, caseTitle, onOpen, onLongPress,
}: { task: Task; caseTitle?: string; onOpen?: () => void; onLongPress?: () => void }) {
  const c = useColors();
  const toggle = useToggleTask();
  return (
    <View style={{ flexDirection: "row", gap: space(3), alignItems: "center", paddingVertical: space(3), paddingHorizontal: space(4), minHeight: 56 }}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: task.done }}
        accessibilityLabel={task.title}
        onPress={() => toggle.mutate(task)}
        hitSlop={10}
      >
        <Ionicons name={task.done ? "checkmark-circle" : "ellipse-outline"} size={26} color={task.done ? c.accent : c.faint} />
      </Pressable>
      <Pressable style={{ flex: 1, gap: space(1) }} onPress={onOpen} onLongPress={onLongPress} disabled={!onOpen && !onLongPress}>
        <Txt style={task.done ? { textDecorationLine: "line-through", color: c.muted } : undefined}>{task.title}</Txt>
        {caseTitle ? <Muted numberOfLines={1}>{caseTitle}</Muted> : null}
        {!task.done && <DueBadge date={task.due_date} />}
      </Pressable>
    </View>
  );
}
