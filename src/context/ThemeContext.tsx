import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  applyColorMode,
  getColorPalette,
  getStoredColorMode,
  type ColorMode,
  type ColorPalette,
} from '../lib/colorMode';

interface ThemeContextValue {
  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;
  palette: ColorPalette;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [colorMode, setColorModeState] = useState<ColorMode>(() => {
    const mode = getStoredColorMode();
    applyColorMode(mode);
    return mode;
  });

  const setColorMode = useCallback((mode: ColorMode) => {
    applyColorMode(mode);
    setColorModeState(mode);
  }, []);

  const value = useMemo(
    () => ({
      colorMode,
      setColorMode,
      palette: getColorPalette(colorMode),
    }),
    [colorMode, setColorMode],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
