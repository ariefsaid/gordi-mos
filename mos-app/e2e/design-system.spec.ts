import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Design-system adoption e2e (ADR-0009).
 *
 * AC-136 (real-browser half): the .dark scope actually flips a --ds-* token —
 * proven against Chromium because jsdom does not parse CSS custom properties.
 * AC-142: toggling dark renders AA-legible body text (no invisible-on-bg).
 *
 * Robustness note: Vite injects index.css as a JS module *after* the load event,
 * so we wait for the token cascade to be live before reading computed styles
 * (reading too early returned an empty token / default-black body — the original
 * flake). The colour parser also handles `color(display-p3 …)` — the ADR-0009
 * token form — as well as rgb()/rgba(); for our neutral (r=g=b) surfaces the sRGB
 * luminance formula is exact. Goal-oracles are unchanged: the token must flip,
 * and dark body text must clear WCAG AA (≥4.5:1).
 *
 * Complements the unit half of AC-136 in src/theme/useTheme.test.tsx
 * (which locks the class-toggle mechanism).
 */

test.use({ baseURL: 'http://localhost:5173/mos' });

/** Wait until the design-kit token cascade is applied (Vite injects the CSS
 *  module after the initial load event; reading before that yields ''). */
async function waitForTokens(page: Page) {
  await page.waitForFunction(
    () =>
      getComputedStyle(document.documentElement)
        .getPropertyValue('--ds-background-primary')
        .trim().length > 0,
  );
}

test('AC-136: the .dark scope flips --ds-background-primary (white ↔ near-black)', async ({ page }) => {
  await page.goto('/mos/login');
  await waitForTokens(page);

  // Light (default): the canvas background token + painted body background.
  const light = await page.evaluate(() => {
    document.documentElement.classList.remove('dark');
    return {
      tok: getComputedStyle(document.documentElement).getPropertyValue('--ds-background-primary').trim(),
      bodyBg: getComputedStyle(document.body).backgroundColor,
    };
  });
  expect(light.tok.length).toBeGreaterThan(0);

  // Dark: the same token must resolve to a DIFFERENT value (the .dark override),
  // and the cascade must reach the painted body surface.
  const dark = await page.evaluate(() => {
    document.documentElement.classList.add('dark');
    return {
      tok: getComputedStyle(document.documentElement).getPropertyValue('--ds-background-primary').trim(),
      bodyBg: getComputedStyle(document.body).backgroundColor,
    };
  });
  expect(dark.tok.length).toBeGreaterThan(0);
  expect(dark.tok, '.dark must override the light --ds-background-primary value').not.toEqual(light.tok);
  expect(dark.bodyBg, 'body background must repaint light→dark').not.toEqual(light.bodyBg);
});

test('AC-142: dark toggle renders AA-legible body text (no invisible-on-bg)', async ({ page }) => {
  // /login is the always-reachable public surface and carries the same token
  // cascade as the authed app shell.
  await page.goto('/mos/login');
  await waitForTokens(page);
  await page.evaluate(() => document.documentElement.classList.add('dark'));

  // Body text vs background must clear WCAG AA (≥4.5:1) for normal text.
  const contrast = await page.evaluate(() => {
    const bg = getComputedStyle(document.body).backgroundColor;
    const fg = getComputedStyle(document.body).color;
    // Parse rgb()/rgba() OR color(display-p3 r g b [/ a]) → [r,g,b] in 0..255.
    const parse = (s: string): [number, number, number] | null => {
      let m = s.match(/rgba?\(([^)]+)\)/);
      if (m) {
        const [r, g, b] = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
        return [r, g, b];
      }
      m = s.match(/color\(display-p3\s+([^)]+)\)/);
      if (m) {
        const [r, g, b] = m[1].split(/[\s/]+/).filter(Boolean).slice(0, 3).map(Number);
        return [r * 255, g * 255, b * 255];
      }
      return null;
    };
    const lin = (c: number) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    const A = parse(bg), B = parse(fg);
    if (!A || !B) return null;
    const L = (c: [number, number, number]) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    const la = L(A), lb = L(B);
    const [hi, lo] = la > lb ? [la, lb] : [lb, la];
    return (hi + 0.05) / (lo + 0.05);
  });

  expect(contrast, 'body bg/text must be parseable colours').not.toBeNull();
  expect(contrast!, 'dark body text must clear WCAG AA (≥4.5:1)').toBeGreaterThanOrEqual(4.5);
});
