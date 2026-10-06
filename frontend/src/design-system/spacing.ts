// 4-step spacing scale (in pixels). Use with Tailwind arbitrary values when needed
// (e.g. `className="p-[16px]"`) or as inline-style values for ad-hoc components.
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export type SpacingKey = keyof typeof spacing;
