import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, render, screen } from '@testing-library/react';
import { ThemeProvider, useThemeContext } from './theme-provider';

/**
 * ThemeProvider + useThemeContext tests.
 * Covers: system resolution, OS-change listener, chosen vs resolved theme,
 * persistence, and the context consumer hook.
 */

// Minimal mock for matchMedia
function makeMatchMedia(dark: boolean) {
  let listener: ((e: { matches: boolean }) => void) | null = null;
  const mql = {
    matches: dark,
    addEventListener: vi.fn((_t: string, cb: (e: { matches: boolean }) => void) => {
      listener = cb;
    }),
    removeEventListener: vi.fn(() => {
      listener = null;
    }),
  };
  return { mql, triggerChange: (newDark: boolean) => listener?.({ matches: newDark }) };
}

describe('ThemeProvider (AC-137 — system/OS preference)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('AC-137a: setTheme("system") resolves to OS pref (dark OS → resolvedTheme="dark", .dark applied)', () => {
    const { mql } = makeMatchMedia(true);
    vi.spyOn(window, 'matchMedia').mockReturnValue(mql as unknown as MediaQueryList);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ThemeProvider>{children}</ThemeProvider>
    );
    const { result } = renderHook(() => useThemeContext(), { wrapper });

    act(() => result.current.setTheme('system'));

    expect(result.current.theme).toBe('system');
    expect(result.current.resolvedTheme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('mos-theme')).toBe('system');
  });

  it('AC-137b: setTheme("system") on light OS → resolvedTheme="light", no .dark class', () => {
    const { mql } = makeMatchMedia(false);
    vi.spyOn(window, 'matchMedia').mockReturnValue(mql as unknown as MediaQueryList);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ThemeProvider>{children}</ThemeProvider>
    );
    const { result } = renderHook(() => useThemeContext(), { wrapper });

    act(() => result.current.setTheme('system'));

    expect(result.current.resolvedTheme).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('AC-137c: system re-resolves on OS change (light→dark)', () => {
    const { mql, triggerChange } = makeMatchMedia(false);
    vi.spyOn(window, 'matchMedia').mockReturnValue(mql as unknown as MediaQueryList);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ThemeProvider>{children}</ThemeProvider>
    );
    const { result } = renderHook(() => useThemeContext(), { wrapper });

    act(() => result.current.setTheme('system'));
    expect(result.current.resolvedTheme).toBe('light');

    act(() => triggerChange(true));
    expect(result.current.resolvedTheme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('AC-137d: switching system→light→dark persists chosen and applies resolved', () => {
    const { mql } = makeMatchMedia(false);
    vi.spyOn(window, 'matchMedia').mockReturnValue(mql as unknown as MediaQueryList);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ThemeProvider>{children}</ThemeProvider>
    );
    const { result } = renderHook(() => useThemeContext(), { wrapper });

    act(() => result.current.setTheme('system'));
    expect(localStorage.getItem('mos-theme')).toBe('system');

    act(() => result.current.setTheme('light'));
    expect(localStorage.getItem('mos-theme')).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    act(() => result.current.setTheme('dark'));
    expect(localStorage.getItem('mos-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('AC-135 compat: defaults to light when nothing is persisted', () => {
    const { mql } = makeMatchMedia(false);
    vi.spyOn(window, 'matchMedia').mockReturnValue(mql as unknown as MediaQueryList);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ThemeProvider>{children}</ThemeProvider>
    );
    const { result } = renderHook(() => useThemeContext(), { wrapper });

    expect(result.current.theme).toBe('light');
    expect(result.current.resolvedTheme).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('AC-135 compat: persisted dark → resolvedTheme dark on mount', () => {
    localStorage.setItem('mos-theme', 'dark');
    const { mql } = makeMatchMedia(false);
    vi.spyOn(window, 'matchMedia').mockReturnValue(mql as unknown as MediaQueryList);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ThemeProvider>{children}</ThemeProvider>
    );
    const { result } = renderHook(() => useThemeContext(), { wrapper });

    expect(result.current.theme).toBe('dark');
    expect(result.current.resolvedTheme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('useThemeContext throws when used outside ThemeProvider', () => {
    // Suppress the expected error output in test console
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useThemeContext())).toThrow(
      /ThemeProvider/
    );
    consoleError.mockRestore();
  });

  it('ThemeProvider renders children', () => {
    const { mql } = makeMatchMedia(false);
    vi.spyOn(window, 'matchMedia').mockReturnValue(mql as unknown as MediaQueryList);

    render(
      <ThemeProvider>
        <span data-testid="child">hello</span>
      </ThemeProvider>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
