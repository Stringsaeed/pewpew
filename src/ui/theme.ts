export const color = {
  bg: '#05050f',
  scrim: 'rgba(5,5,15,0.62)',
  panel: 'rgba(12,14,36,0.86)',
  text: '#e8ecff',
  dim: '#5b6385',
  textDim: '#8a93b8',
  threat: '#ff5a36',
  cyan: '#35f0ff',
  magenta: '#ff3d9a',
  yellow: '#ffd23f',
  green: '#5dff9b',
} as const;

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 40 } as const;

/** The one font. Menlo ships on every iOS device and reads as terminal-neon at all sizes. */
export const font = { family: 'Menlo', body: 15, label: 12, title: 28, hero: 54, score: 24 } as const;

/** Portrait iPhone only (supportsTablet is false), so fixed notch and home-indicator clearances replace a safe-area library. */
export const inset = { top: 58, bottom: 30 } as const;
