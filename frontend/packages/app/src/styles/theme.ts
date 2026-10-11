const base = {
  sizes: {
    sidebar: {
      expanded: '420px',
      collapsed: '80px',
    },
  },
  radii: {
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
  },
  shadows: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.4)',
    md: '0 4px 12px rgba(0, 0, 0, 0.5)',
    lg: '0 8px 24px rgba(0, 0, 0, 0.6)',
  },
  transitions: {
    fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
    base: '200ms cubic-bezier(0.4, 0, 0.2, 1)',
    slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
  },
  fonts: {
    sans: "'DM Sans', system-ui, -apple-system, sans-serif",
    mono: "'JetBrains Mono', 'Fira Code', monospace",
  },
};

/**
 * Selectable accent palettes. Only the accent changes — everything else
 * (backgrounds, text, borders) comes from the dark/light theme, so both modes
 * keep their own look with any accent applied.
 */
export const ACCENTS = {
  purple: {
    label: 'Purple',
    // Radix Themes' own accent scale, kept in step with the styled-components one.
    radix: 'violet',
    colors: {
      main: '#8b5cf6',
      hover: '#7c3aed',
      subtle: 'rgba(139, 92, 246, 0.12)',
      glow: 'rgba(139, 92, 246, 0.25)',
      gradient: 'linear-gradient(135deg, #8b5cf6 0%, #c084fc 100%)',
    },
  },
  // Blue, green and pink take their values straight from the Radix scale so
  // styled-components and Radix controls match: main = step 9 (solid),
  // hover = light-mode step 10, gradient runs to dark-mode step 10.
  blue: {
    label: 'Blue',
    // Radix's 'blue' solid is a bright #0090ff; indigo is the deeper blue.
    radix: 'indigo',
    colors: {
      main: '#3e63dd',
      hover: '#3358d4',
      subtle: 'rgba(62, 99, 221, 0.12)',
      glow: 'rgba(62, 99, 221, 0.25)',
      gradient: 'linear-gradient(135deg, #3e63dd 0%, #5472e4 100%)',
    },
  },
  green: {
    label: 'Green',
    radix: 'jade',
    colors: {
      main: '#29a383',
      hover: '#26997b',
      subtle: 'rgba(41, 163, 131, 0.12)',
      glow: 'rgba(41, 163, 131, 0.25)',
      gradient: 'linear-gradient(135deg, #29a383 0%, #27b08b 100%)',
    },
  },
  pink: {
    label: 'Pink',
    radix: 'crimson',
    colors: {
      main: '#e93d82',
      hover: '#df3478',
      subtle: 'rgba(233, 61, 130, 0.12)',
      glow: 'rgba(233, 61, 130, 0.25)',
      gradient: 'linear-gradient(135deg, #e93d82 0%, #ee518a 100%)',
    },
  },
} as const;

export type AccentName = keyof typeof ACCENTS;

export const DEFAULT_ACCENT: AccentName = 'purple';

export const ACCENT_NAMES = Object.keys(ACCENTS) as AccentName[];

const sharedColors = {
  accent: ACCENTS[DEFAULT_ACCENT].colors,
  status: {
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
  },
};

export const darkTheme = {
  ...base,
  colors: {
    ...sharedColors,
    bg: {
      base: '#0d0d12',
      elevated: '#14141b',
      surface: '#1a1a24',
      surfaceHover: '#22222f',
      overlay: '#252532',
    },
    sidebar: {
      bg: '#111118',
      border: '#2a2a3a',
    },
    text: {
      primary: '#f0f0f5',
      secondary: '#a0a0b8',
      muted: '#6b6b82',
      inverse: '#0d0d12',
    },
    border: {
      subtle: 'rgba(255, 255, 255, 0.06)',
      default: 'rgba(255, 255, 255, 0.1)',
      strong: 'rgba(255, 255, 255, 0.15)',
    },
  },
} as const;

export const lightTheme = {
  ...base,
  colors: {
    ...sharedColors,
    bg: {
      base: '#ececf1',
      elevated: '#e5e5ec',
      surface: '#dcdce5',
      surfaceHover: '#d3d3de',
      overlay: '#cbcbd8',
    },
    sidebar: {
      bg: '#e7e7ee',
      border: '#848488',
    },
    text: {
      primary: '#0e0e16',
      secondary: '#2e2e45',
      muted: '#5a5a76',
      inverse: '#ffffff',
    },
    border: {
      subtle: 'rgba(0, 0, 0, 0.25)',
      default: 'rgba(0, 0, 0, 0.43)',
      strong: 'rgba(0, 0, 0, 0.55)',
    },
  },
} as const;

// backwards-compatible default export
export const theme = darkTheme;

type DeepWiden<T> = T extends string
  ? string
  : T extends object
    ? { [K in keyof T]: DeepWiden<T[K]> }
    : T;

export type Theme = DeepWiden<typeof darkTheme>;

/** The dark/light theme with the chosen accent palette swapped in. */
export function getTheme(
  mode: 'dark' | 'light',
  accent: AccentName = DEFAULT_ACCENT
): Theme {
  const modeTheme = mode === 'light' ? lightTheme : darkTheme;
  return {
    ...modeTheme,
    colors: { ...modeTheme.colors, accent: ACCENTS[accent].colors },
  };
}
