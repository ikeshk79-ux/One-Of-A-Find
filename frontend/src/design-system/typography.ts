// Typography scale (brief: Inter primary, Manrope fallback). Weights echo the brief.
export const typography = {
  family: {
    sans: "'Inter Variable', 'Manrope Variable', 'Geist Variable', sans-serif",
    display: "'Space Grotesk Variable', 'Inter Variable', sans-serif",
    mono: "'Geist Mono Variable', monospace",
  },
  weight: {
    body: 400,
    emphasis: 500,
    heading: 700,
    value: 800,
  },
  size: {
    xs: 12,
    sm: 13,
    base: 15,
    lg: 17,
    xl: 20,
    heading: 28,
    hero: 36,
  },
  tracking: {
    display: "0.12em",
    heading: "-0.02em",
    body: "normal",
  },
} as const;
