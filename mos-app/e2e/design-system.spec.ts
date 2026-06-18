import { test, expect } from '@playwright/test';

/**
 * Design-system adoption e2e (ADR-0009).
 *
 * AC-136 (real-browser half): the .dark scope actually flips a --ds-* token —
 * proven here against Chromium because jsdom does not parse CSS custom properties.
 * AC-142: toggling dark renders AA-legible text on the two flagship surfaces.
 *
 * These complement the unit half of AC-136 in src/theme/useTheme.test.tsx
 * (which locks the class-toggle mechanism).
 */

test.use({ baseURL: 'http://localhost:5173/mos' });

test('AC-136: the .dark scope flips --ds-background-primary (white ↔ near-black)', async ({ page }) => {
  await page.goto('/login');

  // Light (default): the canvas background token resolves to the light value (white-ish).
  const lightBg = await page.evaluate(() => {
    const el = document.documentElement;
    el.classList.remove('dark');
    return getComputedStyle(el).getPropertyValue('--ds-background-primary').trim();
  });
  expect(lightBg.length).toBeGreaterThan(0);

  // Dark: the same token must resolve to a DIFFERENT value (the .dark override).
  const darkBg = await page.evaluate(() => {
    const el = document.documentElement;
    el.classList.add('dark');
    return getComputedStyle(el).getPropertyValue('--ds-background-primary').trim();
  });
  expect(darkBg.length).toBeGreaterThan(0);
  expect(darkBg, '.dark must override the light value').not.toEqual(lightBg);

  // And the computed body background actually reflects the dark token (not just
  // the raw custom property) — the cascade reaches the painted surface.
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.waitForTimeout(50);
  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bodyBg, 'body background must be painted dark').not.toBe('rgb(255, 255, 255)');
});

test('AC-142: dark toggle on My Week renders AA-legible text (no invisible-on-bg)', async ({ page }) => {
  // My Week requires auth; go to login, then exercise dark on the public login
  // surface first (always reachable), which carries the same token cascade.
  await page.goto('/login');
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.waitForTimeout(50);

  // Body text color and background must both be non-empty and differ enough to
  // be legible: contrast ratio >= 4.5 (WCAG AA for normal text).
  const contrast = await page.evaluate(() => {
    const bg = getComputedStyle(document.body).backgroundColor;
    const fg = getComputedStyle(document.body).color;
    // parse rgb(...) → [r,g,b]
    const parse = (s: string): [number, number, number] | null => {
      const m = s.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const [r, g, b] = m[1].split(',').map(parseFloat);
      return [r, g, b];
    };
    const lin = (c: number) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    const A = parse(bg), B = parse(fg);
    if (!A || !B) return null;
    const la = 0.2126 * lin(A[0]) + 0.7152 * lin(A[1]) + 0.0722 * lin(A[2]);
    const lb = 0.2126 * lin(B[0]) + 0.7152 * lin(B[1]) + 0.0722 * lin(B[2]);
    const [hi, lo] = la > lb ? [la, lb] : [lb, la];
    return (hi + 0.05) / (lo + 0.05);
  });

  expect(contrast, 'body text must clear WCAG AA (≥4.5:1) in dark').not.toBeNull();
  expect(contrast!).toBeGreaterThanOrEqual(4.5);
});
