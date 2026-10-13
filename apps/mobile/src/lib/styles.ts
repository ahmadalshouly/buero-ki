import { useMemo } from "react";
import { StyleSheet } from "react-native";
import { type Palette, useColors } from "./theme";

/** Builds a theme-aware StyleSheet once per palette. */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(build: (c: Palette) => T) {
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
