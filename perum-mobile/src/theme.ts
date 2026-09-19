import { borders, colors as tokenColors, radii, shadows, spacing, surfaces, text, typography } from '@perum/design-tokens';

export const colors = {
  background: surfaces.primary,
  surface: surfaces.card,
  ink: text.primary,
  muted: text.secondary,
  primary: tokenColors.accent.primary,
  primarySoft: 'rgba(14, 165, 233, 0.15)',
  border: borders.default,
  danger: tokenColors.semantic.danger,
  white: '#FFFFFF',
  secondarySurface: surfaces.secondary,
  input: surfaces.input,
  borderHover: borders.hover,
  placeholder: text.placeholder,
} as const;

export { borders, radii, shadows, spacing, text, typography };
