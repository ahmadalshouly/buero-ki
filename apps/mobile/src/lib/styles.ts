import { useMemo } from "react";
import { type ImageStyle, StyleSheet, type TextStyle, type ViewStyle } from "react-native";
import { type Palette, useColors } from "./theme";

/** Style map accepted by StyleSheet.create (RN 0.88 dropped StyleSheet.NamedStyles). */
type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

/** Builds a theme-aware StyleSheet once per palette. */
export function makeStyles<T extends NamedStyles<T>>(build: (c: Palette) => T) {
  const cache = new WeakMap<Palette, T>();
  return function useStyles(): T & { c: Palette } {
    const c = useColors();
    return useMemo(() => {
      let sheet = cache.get(c);
      if (!sheet) {
        sheet = StyleSheet.create(build(c));
        cache.set(c, sheet);
      }
      return Object.assign({}, sheet, { c });
    }, [c]);
  };
}
