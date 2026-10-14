// Apple-style glass: a soft colour wash behind every screen, and translucent
// surfaces that blur it. iOS 26 gets real Liquid Glass for floating controls;
// other iOS versions and web get a system material blur; Android, where blur
// is costly, gets a frosted fill.
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import type { ReactNode } from "react";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { curve, lift, type Palette, radius, useColors, useScheme, washes } from "@/lib/theme";

export const hasLiquidGlass = Platform.OS === "ios" && isLiquidGlassAvailable();
export const canBlur = Platform.OS === "ios" || Platform.OS === "web";

/** The colour wash that sits behind a screen's content. */
export function Backdrop() {
  const scheme = useScheme();
  const c = useColors();
  const w = washes[scheme];
  const image = [...w.glow, w.base].join(", ");
  const style = Platform.OS === "web"
    ? ({ backgroundImage: image } as ViewStyle)
    : { experimental_backgroundImage: image };
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.bg }, style]} />;
}

export type Material = "thin" | "regular" | "thick" | "chrome";

const TINTS = {
  thin: ["systemThinMaterialLight", "systemThinMaterialDark"],
  regular: ["systemMaterialLight", "systemMaterialDark"],
  thick: ["systemThickMaterialLight", "systemThickMaterialDark"],
  chrome: ["systemChromeMaterialLight", "systemChromeMaterialDark"],
} as const;

export function useBlurTint(material: Material = "thin") {
  const dark = useScheme() === "dark";
  // The web build has no system materials; its plain tints read cleaner.
  if (Platform.OS === "web") return dark ? "dark" : "light";
  return TINTS[material][dark ? 1 : 0];
}

/** Look of a glass surface without the blur layer; pair it with <GlassFill>. */
export function glassSurface(c: Palette, round: number = radius.md, shadow = true): ViewStyle {
  return {
    borderRadius: round,
    ...curve,
    ...(shadow ? lift(c) : null),
    backgroundColor: canBlur ? c.card : c.glassFill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.glassEdge,
  };
}

/** The blur behind a glass surface. Place it as the first child; it fills its parent. */
export function GlassFill({ round = radius.md, material = "thin" }: { round?: number; material?: Material }) {
  const tint = useBlurTint(material);
  if (!canBlur) return null;
  return (
    <BlurView
      pointerEvents="none"
      tint={tint}
      intensity={70}
      style={[StyleSheet.absoluteFill, { borderRadius: round, overflow: "hidden" }, curve]}
    />
  );
}

/**
 * A translucent rounded surface. `liquid` asks for iOS 26 Liquid Glass (for
 * floating controls such as a composer or toolbar); content cards use the
 * quieter system material.
 */
export function Glass({
  children, style, liquid, interactive, round = radius.md, shadow = true, material,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  liquid?: boolean;
  interactive?: boolean;
  round?: number;
  shadow?: boolean;
  material?: Material;
}) {
  const c = useColors();
  if (liquid && hasLiquidGlass) {
    return (
      <GlassView glassEffectStyle="regular" isInteractive={interactive} style={[{ borderRadius: round }, curve, style]}>
        {children}
      </GlassView>
    );
  }
  return (
    <View style={[glassSurface(c, round, shadow), style]}>
      <GlassFill round={round} material={material} />
      {children}
    </View>
  );
}
