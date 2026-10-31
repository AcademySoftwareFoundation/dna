import type {CSSProperties} from 'react';
import {getTheme} from '@dna-app/styles/theme';

// The app's styled-components theme, handed to the CSS module as custom
// properties so the mock takes the real app's colours in both modes.
export function themeVars(mode: 'dark' | 'light'): CSSProperties {
  const {colors} = getTheme(mode, 'blue');
  return {
    '--c-bg-base': colors.bg.base,
    '--c-bg-surface': colors.bg.surface,
    '--c-bg-hover': colors.bg.surfaceHover,
    '--c-bg-overlay': colors.bg.overlay,
    '--c-sidebar-bg': colors.sidebar.bg,
    '--c-sidebar-border': colors.sidebar.border,
    '--c-text': colors.text.primary,
    '--c-text-2': colors.text.secondary,
    '--c-text-muted': colors.text.muted,
    '--c-border-subtle': colors.border.subtle,
    '--c-border': colors.border.default,
    '--c-border-strong': colors.border.strong,
    '--c-accent': colors.accent.main,
    '--c-accent-hover': colors.accent.hover,
    '--c-accent-subtle': colors.accent.subtle,
    '--c-accent-gradient': colors.accent.gradient,
    '--c-error': colors.status.error,
  } as CSSProperties;
}
