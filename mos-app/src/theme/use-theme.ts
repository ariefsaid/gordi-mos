
/**
 * useTheme — light/dark/system theme controller (ADR-0009, FR-134).
 *
 * The token system (mos-design-kit) ships both a light theme (:root) and a dark
 * theme (`.dark` scope). This hook is the single seam that flips between them by
 * adding/removing `class="dark"` on `document.documentElement`, persisting the
 * CHOSEN value to `localStorage` (`mos-theme`). The app default is **light** —
 * dark is opt-in, so existing users see no change (ADR-0009).
 *
 * The RESOLVED value is the chosen one, except `'system'` → OS preference
 * (window.matchMedia). When chosen is `'system'`, a change listener re-applies
 * on OS change and is cleaned up on unmount.
 *
 * The hook is SSR-safe (guards `typeof document`).
 */
export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'mos-theme';
const DARK_CLASS = 'dark';

export function readPersisted(): Theme {
  if (typeof window === 'undefined') return 'light';
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'dark') return 'dark';
    if (v === 'system') return 'system';
    return 'light';
  } catch {
    return 'light'; // localStorage unavailable (private mode / denied) → safe default
  }
}

export function resolveTheme(chosen: Theme): 'light' | 'dark' {
  if (chosen !== 'system') return chosen;
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyClass(resolved: 'light' | 'dark'): void {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  if (resolved === 'dark') el.classList.add(DARK_CLASS);
  else el.classList.remove(DARK_CLASS);
}
