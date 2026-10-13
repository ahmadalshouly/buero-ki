import { router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { Button, Chip, ErrorBox, Field, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { space, type } from "@/lib/theme";
import { CATEGORIES, type CaseCategory } from "@/lib/types";

export default function NewCase() {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<CaseCategory>("jobcenter");
  const [authority, setAuthority] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const c = await api.createCase({ title: title.trim(), category, authority: authority.trim(), reference_number: reference.trim() });
      router.replace(`/case/${c.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Field label={t("newCase.name")} value={title} onChangeText={setTitle} placeholder={t("newCase.namePlaceholder")} autoFocus />
      <View style={{ gap: space(2) }}>
        <Text style={type.h3}>{t("newCase.category")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }}>
          {CATEGORIES.map((c) => (
            <Chip key={c} label={t(`category.${c}`)} selected={category === c} onPress={() => setCategory(c)} />
          ))}
        </View>
      </View>
      <Field label={t("newCase.authority")} value={authority} onChangeText={setAuthority} placeholder={t("newCase.authorityPlaceholder")} />
      <Field label={t("newCase.reference")} value={reference} onChangeText={setReference} placeholder={t("newCase.referencePlaceholder")} autoCapitalize="characters" />
      {error && <ErrorBox message={error} />}
      <Button title={t("newCase.create")} icon="folder-open-outline" onPress={create} loading={busy} disabled={!title.trim()} />
    </Screen>
  );
}
