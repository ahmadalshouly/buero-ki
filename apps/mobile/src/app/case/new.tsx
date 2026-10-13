import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { CaseForm } from "@/components/CaseForm";
import { Screen } from "@/components/ui";
import { errorMessage, useCreateCase } from "@/lib/queries";

export default function NewCase() {
  const { t } = useTranslation();
  const create = useCreateCase();
  return (
    <Screen>
      <CaseForm
        submitLabel={t("newCase.create")}
        busy={create.isPending}
        error={create.error ? errorMessage(create.error) : null}
        onSubmit={(input) => create.mutate(input, { onSuccess: (c) => router.replace(`/case/${c.id}`) })}
      />
    </Screen>
  );
}
