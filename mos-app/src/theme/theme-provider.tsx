/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { type Theme, applyClass, readPersisted, resolveTheme } from './use-theme';

/**
 * ThemeProvider — single shared source of truth for the chosen theme and its
 * resolved value. Exposes { theme, resolvedTheme, setTheme } via context.
 * Replaces ThemeBootstrap in src/app.tsx (ADR-0009, FR-134).
 *
 * - chosen theme ('light' | 'dark' | 'system') persists to localStorage
 * - resolved = chosen, except 'system' → OS preference
 * - applies class="dark" on <html> per the resolved value, on every change
 * - when chosen is 'system', a matchMedia change listener re-applies on OS change
 * - SSR-safe; default is 'light' (dark is opt-in, ADR-0009)
 */
type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (next: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readPersisted);
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() =>
    resolveTheme(readPersisted())
  );

  useEffect(() => {
    const resolved = resolveTheme(theme);
    setResolvedTheme(resolved);
    applyClass(resolved);

    try {
      window.localStorage.setItem('mos-theme', theme);
    } catch {
      /* storage full / denied */
    }

    if (theme !== 'system') return;

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      const next: 'light' | 'dark' = e.matches ? 'dark' : 'light';
      setResolvedTheme(next);
      applyClass(next);
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useThemeContext must be used within a ThemeProvider');
  }
  return ctx;
}
