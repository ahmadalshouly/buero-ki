import { Ionicons } from "@expo/vector-icons";
import { Pressable } from "react-native";
import { useToggleTask } from "@/lib/queries";
import { space, useColors } from "@/lib/theme";
import type { Task } from "@/lib/types";
import { Card, DueBadge, Muted, Txt } from "./ui";

export function TaskRow({
  task, caseTitle, onOpen, onLongPress,
}: { task: Task; caseTitle?: string; onOpen?: () => void; onLongPress?: () => void }) {
  const c = useColors();
  const toggle = useToggleTask();
  return (
    <Card style={{ flexDirection: "row", gap: space(3), alignItems: "center" }}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: task.done }}
        accessibilityLabel={task.title}
        onPress={() => toggle.mutate(task)}
        hitSlop={10}
      >
        <Ionicons name={task.done ? "checkmark-circle" : "ellipse-outline"} size={28} color={task.done ? c.accent : c.faint} />
      </Pressable>
      <Pressable style={{ flex: 1, gap: space(1) }} onPress={onOpen} onLongPress={onLongPress} disabled={!onOpen && !onLongPress}>
        <Txt style={task.done ? { textDecorationLine: "line-through", color: c.muted } : undefined}>{task.title}</Txt>
        {caseTitle ? <Muted numberOfLines={1}>{caseTitle}</Muted> : null}
        {!task.done && <DueBadge date={task.due_date} />}
      </Pressable>
    </Card>
  );
}
