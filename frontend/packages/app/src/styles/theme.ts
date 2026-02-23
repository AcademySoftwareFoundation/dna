export const theme = {
  colors: {
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
    accent: {
      main: '#8b5cf6',
      hover: '#7c3aed',
      subtle: 'rgba(139, 92, 246, 0.12)',
      glow: 'rgba(139, 92, 246, 0.25)',
      gradient: 'linear-gradient(135deg, #8b5cf6 0%, #c084fc 100%)',
    },
    status: {
      success: '#22c55e',
      warning: '#f59e0b',
      error: '#ef4444',
      info: '#3b82f6',
    },
    border: {
      subtle: 'rgba(255, 255, 255, 0.06)',
      default: 'rgba(255, 255, 255, 0.1)',
      strong: 'rgba(255, 255, 255, 0.15)',
    },
  },
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
} as const;

export type Theme = typeof theme;
