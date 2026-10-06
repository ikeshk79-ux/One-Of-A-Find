// Semantic design-system palette — Forest Thrift Vision.
// The CSS variables in src/index.css are the source of truth at runtime; these TS exports
// are for in-code references (chart series, inline SVG strokes, test fixtures, etc).

export const colors = {
  primary: "#123C35",
  primaryDim: "#0E2F2A",
  cream: "#FAF7F0",
  surface: "#FFFFFF",
  terracotta: "#D96C4F",
  terracottaDeep: "#B9573D",
  sage: "#DCE9DF",
  sageDeep: "#B9D4C0",
  text: "#18201E",
  textSecondary: "#5E786F",
  border: "#E5E1D4",

  // Dark variant
  darkBg: "#101816",
  darkSurface: "#18211E",
  darkText: "#F5F7F5",
  darkSecondary: "#A8B4AF",
  darkBorder: "#2A3A35",
} as const;

export type AppColor = keyof typeof colors;
