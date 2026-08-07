export type ColorMode = 'dark' | 'light';

export const COLOR_MODE_STORAGE_KEY = 'color-mode';

/** Map / UI palette — keep in sync with `styles/theme.css`. */
export const COLOR_PALETTES = {
  dark: {
    bgPrimary: '#2a2a2a',
    bgHover: '#3d3d3d',
    bgDark: '#1a1a1a',
    yellow: '#f5c518',
    yellowMap: '#f5c518',
    mapHover: '#3d3d3d',
    textPrimary: '#f0f0f0',
    textMuted: '#9a9a9a',
    border: '#4a4a4a',
  },
  light: {
    bgPrimary: '#e8e6e3',
    bgHover: '#d4d1cc',
    bgDark: '#f7f6f4',
    yellow: '#f5c518',
    yellowMap: '#8a6f0a',
    mapHover: '#faf8f5',
    textPrimary: '#1c1c1c',
    textMuted: '#6b6b6b',
    border: '#c4c1bb',
  },
} as const;

export type ColorPalette = (typeof COLOR_PALETTES)[ColorMode];

export function isColorMode(value: unknown): value is ColorMode {
  return value === 'dark' || value === 'light';
}

export function getStoredColorMode(): ColorMode {
  try {
    const stored = localStorage.getItem(COLOR_MODE_STORAGE_KEY);
    return isColorMode(stored) ? stored : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyColorMode(mode: ColorMode): void {
  document.documentElement.dataset.theme = mode;
  try {
    localStorage.setItem(COLOR_MODE_STORAGE_KEY, mode);
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function getColorPalette(mode: ColorMode): ColorPalette {
  return COLOR_PALETTES[mode];
}

/** Append the host site's color mode so the phone upload page can match. */
export function withColorModeQuery(url: string, mode: ColorMode): string {
  try {
    const parsed = new URL(url, window.location.origin);
    parsed.searchParams.set('theme', mode);
    return parsed.toString();
  } catch {
    const joiner = url.includes('?') ? '&' : '?';
    return `${url}${joiner}theme=${mode}`;
  }
}
