import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTheme } from './use-theme';

/**
 * useTheme — ADR-0009 / FR-134. AC-135 (sets class + persists) + AC-136 (token
 * actually flips). The hook is the single seam that toggles the .dark scope on
 * <html>; the mos-design-kit's .dark block re-expresses every --ds-* token.
 */
describe('useTheme (AC-135, AC-136) — ADR-0009 theme seam', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('AC-135: defaults to light, adds .dark to <html> when set to dark, and persists', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current[0]).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    act(() => result.current[1]('dark'));
    expect(result.current[0]).toBe('dark');
    // class applied to <html>…
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    // …and persisted across a remount (re-read from localStorage)
    expect(localStorage.getItem('mos-theme')).toBe('dark');
    const { result: remount } = renderHook(() => useTheme());
    expect(remount.current[0]).toBe('dark');
  });

  it('AC-135: setting back to light removes the class and persists light', () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current[1]('dark'));
    act(() => result.current[1]('light'));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('mos-theme')).toBe('light');
  });

  it('AC-136 (unit half): the .dark class is the documented cascade hook for the token flip', () => {
    // The actual token-value flip (white ↔ near-black) is proven in the e2e suite
    // (e2e/design-system.spec.ts AC-136) against a real browser, because jsdom
    // does not parse CSS custom properties. Here we lock the MECHANISM the e2e
    // depends on: toggling the hook flips class="dark" on <html>, and the kit's
    // .dark { … } scope is what re-expresses every --ds-* token.
    const { result } = renderHook(() => useTheme());
    const root = document.documentElement;

    act(() => result.current[1]('light'));
    expect(root.classList.contains('dark')).toBe(false);

    act(() => result.current[1]('dark'));
    expect(root.classList.contains('dark')).toBe(true); // the .dark scope is now active

    act(() => result.current[1]('light'));
    expect(root.classList.contains('dark')).toBe(false); // scope removed → tokens flip back
  });

  it('reads a pre-existing dark preference from localStorage on mount', () => {
    localStorage.setItem('mos-theme', 'dark');
    const { result } = renderHook(() => useTheme());
    expect(result.current[0]).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
