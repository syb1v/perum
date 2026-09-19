export const colors = {
  background: { primary: '#09090b', secondary: '#0f0f12', card: '#13131a' },
  text: { primary: '#f4f4f5', secondary: '#9898a6' },
  accent: { primary: '#0ea5e9', secondary: '#38bdf8' },
  semantic: { success: '#10b981', warning: '#f59e0b', danger: '#ef4444', info: '#3b82f6' },
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 40 } as const;
export const radii = { sm: 6, md: 10, lg: 14, xl: 20, round: 999 } as const;

export const surfaces = {
  primary: '#09090b',
  secondary: '#0f0f12',
  tertiary: '#151518',
  card: '#13131a',
  cardHover: '#1a1a25',
  input: '#1a1a24',
  inputHover: '#1f1f2a',
  inputFocus: '#1e2a3a',
  hover: 'rgba(255, 255, 255, 0.05)',
  overlay: 'rgba(9, 9, 11, 0.8)',
} as const;

export const text = {
  primary: '#f4f4f5',
  secondary: '#9898a6',
  muted: '#5c5c6d',
  placeholder: '#4a4a5a',
  inverse: '#09090b',
} as const;

export const borders = {
  default: 'rgba(56, 189, 248, 0.15)',
  hover: 'rgba(56, 189, 248, 0.3)',
  focus: 'rgba(56, 189, 248, 0.6)',
} as const;

export const typography = {
  family: 'Inter',
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  display: 32,
} as const;

export const shadows = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.4)',
  md: '0 4px 12px rgba(0, 0, 0, 0.4)',
  lg: '0 8px 24px rgba(0, 0, 0, 0.5)',
  glow: '0 0 60px rgba(14, 165, 233, 0.12)',
} as const;
