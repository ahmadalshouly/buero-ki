import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, View } from "react-native";
import { Button, Card, DemoBanner, ErrorBox, Footer, IconButton, Muted, Screen, Txt } from "@/components/ui";
import { MAX_PAGES } from "@/lib/api";
import { friendlyError } from "@/lib/errorText";
import { choosePdf, choosePhotos, PermissionDenied, takePhoto } from "@/lib/pick";
import { errorMessage, useAddDocument } from "@/lib/queries";
import { radius, space, useColors } from "@/lib/theme";
import type { PickedFile } from "@/lib/types";

export default function Scan() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const c = useColors();
  const [pages, setPages] = useState<PickedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const add = useAddDocument(id);

  const isPdf = pages[0]?.mimeType === "application/pdf";
  const room = MAX_PAGES - pages.length;

  async function pick(source: () => Promise<PickedFile[]>, pdf = false) {
    setError(null);
    try {
      const picked = await source();
      if (!picked.length) return;
      if (pdf || isPdf) {
        if (pages.length && !isPdf) {
          setError(t("scan.pdfAlone"));
          return;
        }
        setPages(picked.slice(0, 1));
        return;
      }
      if (picked.length > room) setError(t("scan.tooMany", { max: MAX_PAGES }));
      setPages([...pages, ...picked.slice(0, room)]);
    } catch (e) {
      setError(e instanceof PermissionDenied ? t("case.cameraDenied") : errorMessage(e));
    }
  }

  function move(i: number) {
    if (i === 0) return;
    const next = [...pages];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    setPages(next);
  }

  function analyze() {
    setError(null);
    add.mutate(pages, {
      onSuccess: (doc) => router.replace(`/document/${doc.id}`),
      onError: (e) => setError(friendlyError(e, t)),
    });
  }

  if (add.isPending) {
    return (
      <Screen scroll={false}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: space(4), padding: space(6) }}>
          <ActivityIndicator size="large" color={c.accent} />
          <Txt variant="h2" style={{ textAlign: "center" }}>{t("scan.reading")}</Txt>
          <Muted>{t("scan.readingHint")}</Muted>
          <Button variant="ghost" title={t("common.close")} onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      footer={pages.length > 0 ? (
        <Footer>
          <Button icon="sparkles" title={t("scan.analyze", { count: pages.length })} onPress={analyze} />
        </Footer>
      ) : undefined}
    >
      <DemoBanner />
      <Txt tone="muted">{t("scan.intro")}</Txt>

      {pages.map((p, i) => (
        <Card key={`${p.uri}-${i}`} style={{ flexDirection: "row", alignItems: "center", gap: space(3), padding: space(3) }}>
          {p.mimeType === "application/pdf" ? (
            <View style={{ width: 56, height: 72, borderRadius: radius.sm, backgroundColor: c.dangerSoft, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="document-text" size={28} color={c.danger} />
            </View>
          ) : (
            <Image source={{ uri: p.uri }} style={{ width: 56, height: 72, borderRadius: radius.sm, backgroundColor: c.skeleton }} contentFit="cover" />
          )}
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="h3">{isPdf ? p.name : t("scan.page", { n: i + 1 })}</Txt>
            {!isPdf && <Muted numberOfLines={1}>{p.name}</Muted>}
          </View>
          {i > 0 && <IconButton icon="arrow-up" label={t("scan.moveUp")} onPress={() => move(i)} color={c.muted} />}
          <IconButton icon="close-circle" label={t("scan.remove")} onPress={() => setPages(pages.filter((_, j) => j !== i))} color={c.muted} />
        </Card>
      ))}

      {!isPdf && room > 0 && (
        <View style={{ gap: space(2) }}>
          <Button variant={pages.length ? "secondary" : "primary"} icon="camera-outline"
            title={pages.length ? t("scan.addPage") : t("case.takePhoto")} onPress={() => pick(takePhoto)} />
          <Button variant="secondary" icon="images-outline" title={t("case.choosePhoto")} onPress={() => pick(() => choosePhotos(room))} />
          {pages.length === 0 && (
            <Button variant="secondary" icon="document-outline" title={t("case.choosePdf")} onPress={() => pick(choosePdf, true)} />
          )}
        </View>
      )}
      <View style={{ flexDirection: "row", gap: space(2), alignItems: "center" }}>
        <Ionicons name="bulb-outline" size={18} color={c.muted} />
        <Muted>{t("scan.tips")}</Muted>
      </View>
      {error && <ErrorBox message={error} />}
    </Screen>
  );
}
