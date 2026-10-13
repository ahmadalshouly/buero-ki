import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { CaseForm } from "@/components/CaseForm";
import { useFeedback } from "@/components/feedback";
import { ErrorBox, Screen, SkeletonList } from "@/components/ui";
import { errorMessage, useCase, useUpdateCase } from "@/lib/queries";

export default function EditCase() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { toast } = useFeedback();
  const query = useCase(id);
  const update = useUpdateCase(id);

  if (!query.data) {
    return <Screen>{query.error ? <ErrorBox message={errorMessage(query.error)} onRetry={() => query.refetch()} /> : <SkeletonList rows={2} />}</Screen>;
  }
  return (
    <Screen>
      <CaseForm
        initial={query.data}
        submitLabel={t("common.save")}
        busy={update.isPending}
        error={update.error ? errorMessage(update.error) : null}
        onSubmit={(input) => update.mutate(input, {
          onSuccess: () => {
            toast(t("common.saved"));
            router.back();
          },
        })}
      />
    </Screen>
  );
}
