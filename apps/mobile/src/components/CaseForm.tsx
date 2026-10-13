import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { categoryIcon } from "@/lib/categories";
import { space } from "@/lib/theme";
import { CATEGORIES, type CaseCategory, type NewCase } from "@/lib/types";
import { Button, Chip, ErrorBox, Field, Txt } from "./ui";

export function CaseForm({
  initial, submitLabel, onSubmit, busy, error,
}: {
  initial?: Partial<NewCase>;
  submitLabel: string;
  onSubmit: (input: NewCase) => void;
  busy?: boolean;
  error?: string | null;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [category, setCategory] = useState<CaseCategory>(initial?.category ?? "jobcenter");
  const [authority, setAuthority] = useState(initial?.authority ?? "");
  const [reference, setReference] = useState(initial?.reference_number ?? "");
  const [touched, setTouched] = useState(false);
  const titleError = touched && !title.trim() ? t("common.required") : null;

  function submit() {
    setTouched(true);
    if (!title.trim()) return;
    onSubmit({
      title: title.trim(),
      category,
      authority: authority.trim() || null,
      reference_number: reference.trim() || null,
    });
  }

  return (
    <>
      <Field label={t("newCase.name")} value={title} onChangeText={setTitle} placeholder={t("newCase.namePlaceholder")}
        error={titleError} maxLength={120} autoFocus={!initial} />
      <View style={{ gap: space(2) }}>
        <Txt variant="h3">{t("newCase.category")}</Txt>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }}>
          {CATEGORIES.map((cat) => (
            <Chip key={cat} label={t(`category.${cat}`)} selected={category === cat} onPress={() => setCategory(cat)} />
          ))}
        </View>
      </View>
      <Field label={t("newCase.authority")} value={authority} onChangeText={setAuthority} placeholder={t("newCase.authorityPlaceholder")} maxLength={160} />
      <Field label={t("newCase.reference")} value={reference} onChangeText={setReference} placeholder={t("newCase.referencePlaceholder")}
        hint={t("newCase.referenceHint")} autoCapitalize="characters" autoCorrect={false} maxLength={80} />
      {error && <ErrorBox message={error} />}
      <Button title={submitLabel} icon={categoryIcon(category)} onPress={submit} loading={busy} />
    </>
  );
}
