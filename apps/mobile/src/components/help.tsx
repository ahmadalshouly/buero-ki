import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking, TextInput, View } from "react-native";
import { useFeedback } from "@/components/feedback";
import { Badge, Button, Card, Muted, Txt } from "@/components/ui";
import { useInputDir, useLtrText } from "@/lib/direction";
import { directionsUrl, formatDistance, setHelpWhere, telUrl } from "@/lib/help";
import { currentPosition } from "@/lib/location";
import { radius, space, useColors } from "@/lib/theme";
import { LANGUAGES, type HelpPlace, type HelpWhere } from "@/lib/types";

const languageName = (code: string) => LANGUAGES.find((l) => l.code === code)?.name ?? code.toUpperCase();

/** Where to search: shows the current place and lets the person type another or use their location. */
export function WherePicker({ where, label }: { where: HelpWhere | null; label?: string | null }) {
  const { t } = useTranslation();
  const c = useColors();
  const { toast } = useFeedback();
  const inputDir = useInputDir();
  const [editing, setEditing] = useState(!where);
  const [text, setText] = useState(where && "place" in where ? where.place : "");
  const [locating, setLocating] = useState(false);

  async function useMyLocation() {
    setLocating(true);
    try {
      const pos = await currentPosition();
      if (!pos) {
        toast(t("help.locationDenied"), "error");
        setEditing(true);
        return;
      }
      setHelpWhere(pos);
      setEditing(false);
    } catch {
      toast(t("help.locationFailed"), "error");
      setEditing(true);
    } finally {
      setLocating(false);
    }
  }

  function submit() {
    const place = text.trim();
    if (place.length < 2) return;
    setHelpWhere({ place });
    setEditing(false);
  }

  const shown = where ? ("place" in where ? where.place : label ?? t("help.nearMe")) : null;

  return (
    <Card style={{ gap: space(3) }}>
      {shown && !editing ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space(2) }}>
          <Ionicons name={where && "lat" in where ? "navigate" : "location"} size={18} color={c.accent} />
          <View style={{ flex: 1 }}>
            <Muted>{t("help.searchingNear")}</Muted>
            <Txt variant="h3">{shown}</Txt>
          </View>
          <Button small variant="ghost" title={t("help.change")} onPress={() => setEditing(true)} />
        </View>
      ) : (
        <>
          <Txt variant="h3">{t("help.where")}</Txt>
          <View style={{ flexDirection: "row", gap: space(2) }}>
            <TextInput
              value={text}
              onChangeText={setText}
              onSubmitEditing={submit}
              returnKeyType="search"
              placeholder={t("help.placePlaceholder")}
              placeholderTextColor={c.faint}
              accessibilityLabel={t("help.where")}
              autoCorrect={false}
              style={[{
                flex: 1, backgroundColor: c.raised, borderRadius: radius.sm, borderCurve: "continuous",
                paddingHorizontal: space(3), paddingVertical: space(2.5), fontSize: 17, color: c.ink, outlineWidth: 0,
              }, inputDir]}
            />
            <Button small icon="search" title={t("help.search")} onPress={submit} disabled={text.trim().length < 2} />
          </View>
        </>
      )}
      {(editing || !where || "place" in where) && (
        <Button small variant="secondary" icon="navigate-outline" title={t("help.useLocation")} onPress={useMyLocation} loading={locating} />
      )}
    </Card>
  );
}

/** One place with ways to reach it. With a case, it can also start a letter asking for an appointment. */
export function PlaceCard({ place, speaksMine, caseId }: { place: HelpPlace; speaksMine: boolean; caseId?: string }) {
  const { t, i18n } = useTranslation();
  const c = useColors();
  const ltr = useLtrText();
  const open = (url: string) => Linking.openURL(url).catch(() => {});

  function askForAppointment() {
    router.push({
      pathname: "/case/[id]/draft",
      params: {
        id: caseId!,
        kind: place.email ? "email" : "letter",
        instructions: t("help.appointmentInstructions", {
          name: place.name,
          contact: [place.address, place.email].filter(Boolean).join(", ") || "—",
        }),
      },
    });
  }

  return (
    <Card style={{ gap: space(2) }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space(2) }}>
        <Txt variant="h3" style={{ flex: 1 }} selectable>{place.name}</Txt>
        <Badge label={formatDistance(place.distance_m, i18n.language)} />
      </View>
      {place.address && <Txt variant="small" tone="muted" style={ltr} selectable>{place.address}</Txt>}
      {place.opening_hours && (
        <View style={{ flexDirection: "row", gap: space(1.5), alignItems: "center" }}>
          <Ionicons name="time-outline" size={14} color={c.muted} />
          <Txt variant="small" tone="muted" style={[{ flex: 1 }, ltr]} numberOfLines={2}>{place.opening_hours}</Txt>
        </View>
      )}
      {(place.languages.length > 0 || place.wheelchair) && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(1.5) }}>
          {speaksMine && <Badge tone="accent" icon="chatbubbles-outline" label={t("help.speaksYours")} />}
          {place.languages.length > 0 && (
            <Badge icon="language-outline" label={place.languages.map(languageName).join(" · ")} />
          )}
          {place.wheelchair && <Badge icon="accessibility-outline" label={t("help.wheelchair")} />}
        </View>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }}>
        {place.phone && <Button small icon="call-outline" title={t("help.call")} onPress={() => open(telUrl(place.phone!))} />}
        <Button small variant="secondary" icon="navigate-outline" title={t("help.directions")} onPress={() => open(directionsUrl(place))} />
        {place.website && <Button small variant="secondary" icon="globe-outline" title={t("help.website")} onPress={() => open(place.website!)} />}
        {place.email && !caseId && (
          <Button small variant="secondary" icon="mail-outline" title={t("help.email")} onPress={() => open(`mailto:${place.email}`)} />
        )}
        {caseId && (
          <Button small variant="secondary" icon="create-outline" title={t("help.askAppointment")} onPress={askForAppointment} />
        )}
      </View>
    </Card>
  );
}
