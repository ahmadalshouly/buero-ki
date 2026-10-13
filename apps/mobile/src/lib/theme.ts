export const colors = {
  bg: "#F6F3EE",
  card: "#FFFFFF",
  ink: "#1E2421",
  muted: "#5E6762",
  line: "#E4DED4",
  accent: "#0E6B5E",
  accentInk: "#FFFFFF",
  accentSoft: "#E2F0EC",
  warn: "#A9531B",
  warnSoft: "#FBEDE2",
  danger: "#B3261E",
  dangerSoft: "#FBE6E4",
};

export const radius = { sm: 10, md: 16, lg: 24 };
export const space = (n: number) => n * 4;

export const type = {
  title: { fontSize: 28, fontWeight: "700" as const, color: colors.ink },
  h2: { fontSize: 20, fontWeight: "700" as const, color: colors.ink },
  h3: { fontSize: 16, fontWeight: "600" as const, color: colors.ink },
  body: { fontSize: 16, lineHeight: 23, color: colors.ink },
  small: { fontSize: 14, lineHeight: 20, color: colors.muted },
};
