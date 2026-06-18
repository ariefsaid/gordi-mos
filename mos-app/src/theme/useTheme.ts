import { useCallback, useEffect, useState } from 'react';

/**
 * useTheme — light/dark theme controller (ADR-0009, FR-134).
 *
 * The token system (mos-design-kit) ships both a light theme (:root) and a dark
 * theme (`.dark` scope). This hook is the single seam that flips between them by
 * adding/removing `class="dark"` on `document.documentElement`, persisting the
 * choice to `localStorage` (`mos-theme`). The app default is **light** — dark is
 * opt-in, so existing users see no change.
 *
 * The hook is SSR-safe (guards `typeof document`); when document is unavailable
 * it tracks state in memory only. A visible toggle UI ships in a later issue;
 * this ships the capability + the persistence.
 */
export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'mos-theme';
const DARK_CLASS = 'dark';

function readPersisted(): Theme {
  if (typeof window === 'undefined') return 'light';
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light'; // localStorage unavailable (private mode / denied) → safe default
  }
}

function applyClass(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  if (theme === 'dark') el.classList.add(DARK_CLASS);
  else el.classList.remove(DARK_CLASS);
}

export function useTheme(): [Theme, (next: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(readPersisted);

  // Reflect state → DOM + storage whenever it changes (and on mount).
  useEffect(() => {
    applyClass(theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* storage full / denied — state still applies to the DOM */
    }
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
  }, []);

  return [theme, setTheme];
}
