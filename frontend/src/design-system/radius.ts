// Border-radius scale used across the Forest Thrift Vision UI.
export const radius = {
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  full: 999,
} as const;

export type RadiusKey = keyof typeof radius;
