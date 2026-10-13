import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { TextInput, View } from "react-native";
import { Badge, Card, EmptyState, ErrorBox, Muted, Screen, SkeletonList, Txt } from "@/components/ui";
import { formatDate } from "@/lib/i18n";
import { errorMessage, useSearch } from "@/lib/queries";
import { radius, space, useColors } from "@/lib/theme";

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setV(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return v;
}

export default function Search() {
  const { t } = useTranslation();
  const c = useColors();
  const [q, setQ] = useState("");
  const term = useDebounced(q.trim());
  const results = useSearch(term);

  return (
    <Screen>
      <View style={{
        flexDirection: "row", alignItems: "center", gap: space(2), backgroundColor: c.card,
        borderWidth: 1, borderColor: c.accent, borderRadius: radius.sm, paddingHorizontal: space(3),
      }}>
        <Ionicons name="search" size={18} color={c.accent} />
        <TextInput
          value={q}
          onChangeText={setQ}
          autoFocus
          returnKeyType="search"
          placeholder={t("search.placeholder")}
          placeholderTextColor={c.faint}
          accessibilityLabel={t("search.title")}
          style={{ flex: 1, paddingVertical: space(3), fontSize: 16, color: c.ink, outlineWidth: 0 }}
        />
      </View>

      {term.length < 2 ? <Muted>{t("search.hint")}</Muted>
        : results.isPending ? <SkeletonList rows={3} />
        : results.error ? <ErrorBox message={errorMessage(results.error)} onRetry={() => results.refetch()} />
        : !results.data?.length ? <EmptyState icon="search-outline" title={t("search.empty", { q: term })} />
        : (
          <View style={{ gap: space(3) }}>
            {results.data.map((r) => (
              <Card key={`${r.kind}-${r.id}`} onPress={() => router.push(r.kind === "case" ? `/case/${r.id}` : `/document/${r.id}`)}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space(2) }}>
                  <Badge label={t(`search.${r.kind}`)} tone={r.kind === "case" ? "accent" : "neutral"}
                    icon={r.kind === "case" ? "folder-outline" : "document-text-outline"} />
                  <Txt variant="small" tone="faint">{formatDate(r.at)}</Txt>
                </View>
                <Txt variant="h3">{r.title ?? "—"}</Txt>
                {r.detail ? <Muted numberOfLines={2}>{r.detail}</Muted> : null}
              </Card>
            ))}
          </View>
        )}
    </Screen>
  );
}
