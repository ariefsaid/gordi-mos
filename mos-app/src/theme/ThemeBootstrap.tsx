import { useTheme } from './useTheme';

/**
 * ThemeBootstrap — mounts once at the app root to apply the persisted theme
 * (ADR-0009, FR-134). Calling useTheme() here reflects the stored preference
 * to <html>'s class list on every render. No UI ships here — a visible toggle
 * comes in a later issue; this just ensures the .dark class is applied from
 * the first paint for users who previously chose dark.
 *
 * Returns nothing; render it as a sibling above the router.
 */
export function ThemeBootstrap() {
  useTheme();
  return null;
}
