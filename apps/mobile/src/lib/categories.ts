import type { IconName } from "@/components/ui";
import type { CaseCategory } from "./types";

const ICONS: Record<CaseCategory, IconName> = {
  jobcenter: "briefcase-outline",
  auslaenderbehoerde: "id-card-outline",
  familienkasse: "people-outline",
  krankenkasse: "medkit-outline",
  finanzamt: "calculator-outline",
  buergeramt: "business-outline",
  housing: "home-outline",
  work: "construct-outline",
  school: "school-outline",
  other: "folder-open-outline",
};

export const categoryIcon = (c: CaseCategory): IconName => ICONS[c] ?? "folder-open-outline";
