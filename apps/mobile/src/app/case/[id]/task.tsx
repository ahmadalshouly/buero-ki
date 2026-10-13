import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useFeedback } from "@/components/feedback";
import { Button, Chip, ErrorBox, Field, Screen } from "@/components/ui";
import { isIsoDate } from "@/lib/dates";
import { errorMessage, useCreateTask } from "@/lib/queries";
import { space } from "@/lib/theme";

const inDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function NewTask() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { toast } = useFeedback();
  const create = useCreateTask(id);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [touched, setTouched] = useState(false);

  const dueError = due && !isIsoDate(due) ? t("case.taskDueInvalid") : null;
  const titleError = touched && !title.trim() ? t("common.required") : null;

  function save() {
    setTouched(true);
    if (!title.trim() || dueError) return;
    create.mutate({ title, dueDate: due || null }, {
      onSuccess: () => {
        toast(t("common.saved"));
        router.back();
      },
    });
  }

  return (
    <Screen>
      <Field label={t("case.taskTitle")} value={title} onChangeText={setTitle} placeholder={t("case.taskPlaceholder")}
        autoFocus maxLength={200} error={titleError} />
      <Field label={t("case.taskDue")} value={due} onChangeText={setDue} placeholder={t("case.taskDuePlaceholder")}
        keyboardType="numbers-and-punctuation" maxLength={10} error={dueError} />
      <View style={{ flexDirection: "row", gap: space(2), flexWrap: "wrap" }}>
        {[1, 3, 7, 14].map((n) => (
          <Chip key={n} label={`+${n}`} selected={due === inDays(n)} onPress={() => setDue(inDays(n))} />
        ))}
      </View>
      {create.error && <ErrorBox message={errorMessage(create.error)} />}
      <Button title={t("common.save")} icon="checkmark" onPress={save} loading={create.isPending} />
    </Screen>
  );
}
