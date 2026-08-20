/* eslint-disable no-restricted-syntax -- this test measures literal candidate colors by design. */
// #282 — the gradient-primary-sheen measurement, encoded. The sheen's two literal hsl stops are
// KEPT DELIBERATELY: dev's pre-#280 derivation (color-mix(in srgb, var(--accent) 100%, white 3%)
// over var(--accent)) does NOT reproduce them — measured 2026-08 (sRGB, CIELab ΔE76): top stop
// ΔE 2.5 (matches), bottom stop ΔE 11.4 / max channel Δ 21-255 (rgb(41,87,224) vs rgb(62,99,221) —
// the derived gradient is flatter and less saturated). Re-deriving from var(--accent) is only
// lawful after a NEW measurement says the stops match — which is exactly what this test performs
// on the live token sources. Theme reachability is NOT lost: --ds-color-blue is byte-identical in
// theme-light.css and theme-dark.css (asserted below), so the derivation would not have reacted to
// a theme change either.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

type RGB = { r: number; g: number; b: number } // 0..255

const s = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf8')
const indexCss = s('src/index.css')
const themeLight = s('src/styles/tokens/theme-light.css')
const themeDark = s('src/styles/tokens/theme-dark.css')

const token = (css: string, name: string) => css.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))?.[1]?.trim()

function hslToRgb(h: number, sat: number, l: number): RGB {
  const a = sat * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))
  }
  return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 }
}

// display-p3 → sRGB (same machinery as contrast.test.ts)
function p3ToSrgb(r: number, g: number, b: number): RGB {
  const dec = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
  const enc = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)
  const [R, G, B] = [r, g, b].map(dec)
  const x = 0.48657095 * R + 0.26566769 * G + 0.19821729 * B
  const y = 0.22897456 * R + 0.69173852 * G + 0.07928691 * B
  const z = 0.04511338 * G + 1.04394437 * B
  const cl = (v: number) => Math.min(1, Math.max(0, v))
  return {
    r: cl(enc(3.24096994 * x - 1.53738318 * y - 0.49861076 * z)) * 255,
    g: cl(enc(-0.96924364 * x + 1.8759675 * y + 0.04155506 * z)) * 255,
    b: cl(enc(0.05563008 * x - 0.20397696 * y + 1.05697151 * z)) * 255,
  }
}

function deltaE(a: RGB, b: RGB): number {
  const f = (c: number) => {
    const v = c / 255
    const lin = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
    return lin > 0.008856 ? Math.cbrt(lin) : 7.787 * lin + 16 / 116
  }
  const lab = (c: RGB) => {
    const [R, G, B] = [c.r, c.g, c.b].map(f)
    const X = 0.4124564 * R + 0.3575761 * G + 0.1804375 * B
    const Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B
    const Z = 0.0193339 * R + 0.119192 * G + 0.9503041 * B
    return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)]
  }
  const [l1, a1, b1] = lab(a)
  const [l2, a2, b2] = lab(b)
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

describe('#282: --gradient-primary-sheen — measured, literals kept', () => {
  it('index.css still declares the two v4 literal stops (no silent re-derivation)', () => {
    const val = token(indexCss, '--gradient-primary-sheen')
    expect(val).toBeDefined()
    expect(val!).toContain('hsl(225 75% 58%) 0%')
    expect(val!).toContain('hsl(225 75% 52%) 100%')
  })

  it('the accent base is theme-invariant (light == dark) — literals lose no theme reachability', () => {
    expect(token(themeLight, '--ds-color-blue')).toBe(token(themeDark, '--ds-color-blue'))
  })

  it('MEASUREMENT: the var(--accent) derivation does NOT reproduce the bottom stop (ΔE76 > 3)', () => {
    const m = token(themeLight, '--ds-color-blue')!.match(/display-p3\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/)!
    const accent = p3ToSrgb(+m[1], +m[2], +m[3])
    // the old derivation: top = color-mix(in srgb, accent 100%, white 3%) — normalize 100/103 : 3/103
    const derivedTop: RGB = {
      r: (accent.r / 255) * (100 / 103) * 255 + 255 * (3 / 103),
      g: (accent.g / 255) * (100 / 103) * 255 + 255 * (3 / 103),
      b: (accent.b / 255) * (100 / 103) * 255 + 255 * (3 / 103),
    }
    const v4Top = hslToRgb(225, 0.75, 0.58)
    const v4Bottom = hslToRgb(225, 0.75, 0.52)
    // If these assertions ever FAIL, the token sources changed: re-run the measurement before
    // touching the sheen — do not bend the thresholds.
    expect(deltaE(derivedTop, v4Top)).toBeLessThanOrEqual(3) // top stop matches (measured 2.5)
    expect(deltaE(accent, v4Bottom)).toBeGreaterThan(3) // bottom does NOT (measured 11.4)
  })
})
