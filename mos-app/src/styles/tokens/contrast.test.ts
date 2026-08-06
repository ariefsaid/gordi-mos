// AC-007: Automated AA contrast check on the warm palette
// Unit test (Vitest). Computes contrast ratios for critical text/background pairs
// using the WCAG 2.1 formula. Must pass ≥4.5:1 for body text, ≥3:1 for large/UI.
import { describe, it, expect } from 'vitest'

type Color = { r: number; g: number; b: number; a: number }

function luminance(r: number, g: number, b: number): number {
  // sRGB relative luminance
  const lin = (c: number) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function contrastRatio(fg: Color, bg: Color): number {
  // Composite over white for transparent backgrounds (conservative)
  const compose = (fg: Color, bg: Color): Color => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1
  })
  const fgComp = fg.a < 1 ? compose(fg, {r:1,g:1,b:1,a:1}) : fg
  const bgComp = bg.a < 1 ? compose(bg, {r:1,g:1,b:1,a:1}) : bg
  const L1 = luminance(fgComp.r, fgComp.g, fgComp.b)
  const L2 = luminance(bgComp.r, bgComp.g, bgComp.b)
  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)
}

function p3ToSrgb(color: Color): Color {
  const decode = (value: number) => value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)
  const encode = (value: number) => value <= 0.0031308 ? 12.92 * value : 1.055 * Math.pow(value, 1 / 2.4) - 0.055
  const linear = [color.r, color.g, color.b].map(decode)
  const xyz = [
    0.48657095 * linear[0] + 0.26566769 * linear[1] + 0.19821729 * linear[2],
    0.22897456 * linear[0] + 0.69173852 * linear[1] + 0.07928691 * linear[2],
    0.04511338 * linear[1] + 1.04394437 * linear[2],
  ]
  return {
    r: Math.min(1, Math.max(0, encode(3.24096994 * xyz[0] - 1.53738318 * xyz[1] - 0.49861076 * xyz[2]))),
    g: Math.min(1, Math.max(0, encode(-0.96924364 * xyz[0] + 1.8759675 * xyz[1] + 0.04155506 * xyz[2]))),
    b: Math.min(1, Math.max(0, encode(0.05563008 * xyz[0] - 0.20397696 * xyz[1] + 1.05697151 * xyz[2]))),
    a: color.a,
  }
}

function hueDegrees(color: Color): number {
  const max = Math.max(color.r, color.g, color.b)
  const min = Math.min(color.r, color.g, color.b)
  const delta = max - min
  if (delta === 0) return 0
  let hue = max === color.r
    ? 60 * (((color.g - color.b) / delta) % 6)
    : max === color.g
      ? 60 * ((color.b - color.r) / delta + 2)
      : 60 * ((color.r - color.g) / delta + 4)
  if (hue < 0) hue += 360
  return hue
}

// Known token values (from the updated source files) for contrast testing
const TOKENS = {
  // Light theme surfaces
  '--surface-primary':    { r: 1.0, g: 0.988, b: 0.972, a: 1 },
  '--surface-secondary':  { r: 0.984, g: 0.976, b: 0.957, a: 1 },
  '--surface-tertiary':   { r: 0.969, g: 0.957, b: 0.933, a: 1 },
  // Light theme text
  '--text-primary':       { r: 0.145, g: 0.141, b: 0.133, a: 1 },
  '--text-secondary':     { r: 0.388, g: 0.380, b: 0.365, a: 1 },
  // OD-71ii darkened this one step; the table kept the pre-darkening value {0.541,0.533,0.518}
  // and so measured AA on a colour the app stopped shipping. The reconciliation block at the foot
  // of this file is what caught it, and what stops it recurring.
  '--text-tertiary':      { r: 0.44, g: 0.432, b: 0.418, a: 1 },
  // Status bases (light)
  '--success':            { r: 0.332, g: 0.634, b: 0.442, a: 1 },
  '--warning':            { r: 1.0,   g: 0.77,  b: 0.26,  a: 1 },
  '--destructive':        { r: 0.83,  g: 0.329, b: 0.324, a: 1 },
  '--violet':             { r: 0.417, g: 0.341, b: 0.784, a: 1 },
  // Status AA text (light)
  '--status-open-text':   { r: 0.1001, g: 0.0765, b: 0.4201, a: 1 },
  '--status-won-text':    { r: 0.0704, g: 0.1496, b: 0.0619, a: 1 },
  '--status-lost-text':   { r: 0.45,   g: 0.05,   b: 0.04,   a: 1 },
  '--status-violet-text': { r: 0.1372, g: 0.0724, b: 0.4282, a: 1 },
  '--warning-foreground': { r: 0.28,  g: 0.22,  b: 0.08,  a: 1 },
  // Dark theme surfaces (warmed values as shipped in theme-dark.css)
  '--surface-primary-dark':    { r: 0.102, g: 0.094, b: 0.078, a: 1 },
  '--surface-secondary-dark':  { r: 0.122, g: 0.114, b: 0.099, a: 1 },
  '--text-primary-dark':       { r: 0.954, g: 0.951, b: 0.946, a: 1 },
  '--text-secondary-dark':     { r: 0.767, g: 0.756, b: 0.733, a: 1 },
  // Dark status text (from index.css .dark)
  '--status-open-text-dark':   { r: 0.62,  g: 0.72,  b: 1.0,   a: 1 },
  '--status-won-text-dark':    { r: 0.55,  g: 0.78,  b: 0.55,  a: 1 },
  '--status-lost-text-dark':   { r: 0.92,  g: 0.60,  b: 0.60,  a: 1 },
  '--status-violet-text-dark': { r: 0.70,  g: 0.62,  b: 1.0,   a: 1 },
  // Dark warning: uses dark theme amber tint (amber3 bg, amber11 text)
  '--ds-color-amber3-dark':   { r: 0.178, g: 0.128, b: 0.049, a: 1 },
  '--ds-color-amber11-dark':  { r: 0.64,  g: 0.40,  b: 0.0,   a: 1 },
  '--warning-foreground-dark': { r: 0.85,  g: 0.75,  b: 0.45,  a: 1 },
  // SYS-1 (backfill census): the on-brand-chip foreground. The brand fills are theme-INVARIANT,
  // so their foreground must be too — dark --ds-font-color-inverted now = white (was 0.09 near-black).
  '--ds-color-blue':               { r: 0.276, g: 0.384, b: 0.837, a: 1 }, // The One Blue chip (both themes)
  '--ds-font-color-inverted-dark': { r: 1.0,   g: 1.0,   b: 1.0,   a: 1 }, // SYS-1 corrected dark value
  // SYS-4 (backfill census): theme-aware blue-on-blue-tint text (dark values).
  '--text-on-accent-tint-dark':    { r: 0.62,  g: 0.72,  b: 1.0,   a: 1 },
  '--ds-color-blue3-dark':         { r: 0.105, g: 0.141, b: 0.275, a: 1 }, // active rail pill fill (dark)
}

// Helper to create tinted background (status hue at ~14% alpha over surface)
function tint(base: Color, surface: Color, alpha: number): Color {
  return {
    r: base.r * alpha + surface.r * (1 - alpha),
    g: base.g * alpha + surface.g * (1 - alpha),
    b: base.b * alpha + surface.b * (1 - alpha),
    a: 1
  }
}

describe('AC-007: AA contrast on warm palette (light + dark)', () => {
  describe('Light theme', () => {
    it('text-primary on surface-primary ≥ 4.5:1', () => {
      const ratio = contrastRatio(TOKENS['--text-primary'], TOKENS['--surface-primary'])
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    })

    it('text-secondary on surface-secondary ≥ 4.5:1', () => {
      const ratio = contrastRatio(TOKENS['--text-secondary'], TOKENS['--surface-secondary'])
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    })

    it('status-won-text on success/14% ≥ 4.5:1', () => {
      const bg = tint(TOKENS['--success'], TOKENS['--surface-primary'], 0.14)
      const ratio = contrastRatio(TOKENS['--status-won-text'], bg)
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    })

    it('status-lost-text on destructive/12% ≥ 4.5:1', () => {
      const bg = tint(TOKENS['--destructive'], TOKENS['--surface-primary'], 0.12)
      const ratio = contrastRatio(TOKENS['--status-lost-text'], bg)
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    })

    it('status-lost-text stays in the destructive red hue role', () => {
      const hue = hueDegrees(p3ToSrgb(TOKENS['--status-lost-text']))
      expect(hue < 15 || hue > 345).toBe(true)
    })

    it('status-open-text on accent/10% ≥ 4.5:1', () => {
      const accent = { r: 0.276, g: 0.384, b: 0.837, a: 1 }
      const bg = tint(accent, TOKENS['--surface-primary'], 0.10)
      const ratio = contrastRatio(TOKENS['--status-open-text'], bg)
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    })

    it('status-violet-text on violet/12% ≥ 4.5:1', () => {
      const bg = tint(TOKENS['--violet'], TOKENS['--surface-primary'], 0.12)
      const ratio = contrastRatio(TOKENS['--status-violet-text'], bg)
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    })

    it('warning-foreground on warning/18% ≥ 4.5:1 (BUG FIX: was red, now deep brown)', () => {
      const bg = tint(TOKENS['--warning'], TOKENS['--surface-primary'], 0.18)
      const ratio = contrastRatio(TOKENS['--warning-foreground'], bg)
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    })

    it('text-tertiary on surface-tertiary ≥ 3:1 (large/UI)', () => {
      const ratio = contrastRatio(TOKENS['--text-tertiary'], TOKENS['--surface-tertiary'])
      expect(ratio).toBeGreaterThanOrEqual(3)
    })
  })

  describe('Dark theme', () => {
    it('text-primary-dark on surface-primary-dark ≥ 4.5:1', () => {
      const ratio = contrastRatio(TOKENS['--text-primary-dark'], TOKENS['--surface-primary-dark'])
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    })

    it('text-secondary-dark on surface-secondary-dark ≥ 4.5:1', () => {
      const ratio = contrastRatio(TOKENS['--text-secondary-dark'], TOKENS['--surface-secondary-dark'])
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    })

    it('status-won-text-dark on success/14% ≥ 4.5:1', () => {
      const success = { r: 0.332, g: 0.634, b: 0.442, a: 1 }
      const bg = tint(success, TOKENS['--surface-primary-dark'], 0.14)
      const ratio = contrastRatio(TOKENS['--status-won-text-dark'], bg)
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    })

    it('status-lost-text-dark on destructive/12% ≥ 4.5:1', () => {
      const destructive = { r: 0.83, g: 0.329, b: 0.324, a: 1 }
      const bg = tint(destructive, TOKENS['--surface-primary-dark'], 0.12)
      const ratio = contrastRatio(TOKENS['--status-lost-text-dark'], bg)
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    })

    it('status-lost-text-dark remains red in the dark theme', () => {
      const hue = hueDegrees(p3ToSrgb(TOKENS['--status-lost-text-dark']))
      expect(hue < 15 || hue > 345).toBe(true)
    })

    it('status-open-text-dark on accent/10% ≥ 4.5:1', () => {
      const accent = { r: 0.276, g: 0.384, b: 0.837, a: 1 }
      const bg = tint(accent, TOKENS['--surface-primary-dark'], 0.10)
      const ratio = contrastRatio(TOKENS['--status-open-text-dark'], bg)
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    })

    it('status-violet-text-dark on violet/12% ≥ 4.5:1', () => {
      const violet = { r: 0.417, g: 0.341, b: 0.784, a: 1 }
      const bg = tint(violet, TOKENS['--surface-primary-dark'], 0.12)
      const ratio = contrastRatio(TOKENS['--status-violet-text-dark'], bg)
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    })

    it('--warning-foreground-dark on dark amber tint ≥ 3:1 (large/UI)', () => {
      const bg = TOKENS['--ds-color-amber3-dark']
      const fg = TOKENS['--warning-foreground-dark']
      const ratio = contrastRatio(fg, bg)
      expect(ratio).toBeGreaterThanOrEqual(3)
    })

    // SYS-1: the recurrence-class fix. On the theme-invariant blue chip (primary buttons, avatars,
    // checkboxes) the dark foreground was near-black 0.09 → 3.39:1 (buttons measured 3.44). White
    // (matching light, since the surface doesn't flip) = 5.29:1.
    it('inverted-text-dark on the brand blue chip ≥ 4.5:1 (SYS-1)', () => {
      const ratio = contrastRatio(TOKENS['--ds-font-color-inverted-dark'], TOKENS['--ds-color-blue'])
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    })

    // SYS-4: the active rail pill — mid-blue text on the dark blue3 fill was 2.9:1. The theme-aware
    // token lightens the text in dark (mid-blue's luminance can never reach AA on any dark tint).
    it('text-on-accent-tint-dark on the dark rail pill (blue3) ≥ 4.5:1 (SYS-4)', () => {
      const ratio = contrastRatio(TOKENS['--text-on-accent-tint-dark'], TOKENS['--ds-color-blue3-dark'])
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    })

    // SYS-4: the @mention person badge — mid-blue text on --accent-subtle (blue @10%) over the dark
    // surface was 3.1:1. Same theme-aware token restores AA.
    it('text-on-accent-tint-dark on accent-subtle (blue/10% over dark surface) ≥ 4.5:1 (SYS-4)', () => {
      const bg = tint(TOKENS['--ds-color-blue'], TOKENS['--surface-primary-dark'], 0.10)
      const ratio = contrastRatio(TOKENS['--text-on-accent-tint-dark'], bg)
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The reconciliation this file was missing.
//
// Everything above computes AA ratios from the hardcoded TOKENS table, so it can only ever prove
// that those NUMBERS clear AA — never that the app ships them. It read `--text-tertiary` as
// {0.541, 0.533, 0.518} while the shipped `--ds-font-color-tertiary` was {0.44, 0.432, 0.418}:
// a passing AA check on a colour that is not in the product.
//
// So this reads the CSS and asserts the table matches what ships. Change a colour in the theme
// files without re-deriving the ratios above and this goes red, which is the only thing that makes
// the ratios mean anything.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const TOKENS_DIR = join(__dirname)
const APP_CSS = join(__dirname, '..', '..', 'index.css')

function declaredP3(css: string, name: string): Color | null {
  // Last declaration wins, matching the CSS cascade within one file.
  const re = new RegExp(`--${name}:\\s*color\\(display-p3\\s+([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\s*\\)`, 'g')
  let m: RegExpExecArray | null
  let last: Color | null = null
  while ((m = re.exec(css)) !== null) {
    last = { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: 1 }
  }
  return last
}

/** TOKENS key → [file, the custom property it is a transcription of]. */
const RECONCILE: ReadonlyArray<readonly [keyof typeof TOKENS, string, string]> = [
  ['--surface-primary', 'theme-light.css', 'ds-background-primary'],
  ['--surface-secondary', 'theme-light.css', 'ds-background-secondary'],
  ['--surface-tertiary', 'theme-light.css', 'ds-background-tertiary'],
  ['--text-primary', 'theme-light.css', 'ds-font-color-primary'],
  ['--text-secondary', 'theme-light.css', 'ds-font-color-secondary'],
  ['--text-tertiary', 'theme-light.css', 'ds-font-color-tertiary'],
  ['--ds-color-blue', 'theme-light.css', 'ds-color-blue'],
]

describe('AC-007: the contrast table is a transcription of the shipped CSS, not a wish', () => {
  it.each(RECONCILE.map((r) => [r[0], r[1], r[2]] as const))(
    '%s matches %s --%s',
    (tokenKey, file, cssVar) => {
      const css = readFileSync(join(TOKENS_DIR, file), 'utf8')
      const shipped = declaredP3(css, cssVar)
      expect(shipped, `--${cssVar} not found in ${file}`).not.toBeNull()
      const table = TOKENS[tokenKey]
      for (const ch of ['r', 'g', 'b'] as const) {
        expect(
          Math.abs(table[ch] - shipped![ch]),
          `${tokenKey} ${ch}: table has ${table[ch]}, ${file} ships ${shipped![ch]} — ` +
            `the AA ratios above are computed on a colour the app does not use`,
        ).toBeLessThan(0.005)
      }
    },
  )

  it('the two status colours the port reverted are transcribed from index.css', () => {
    const css = readFileSync(APP_CSS, 'utf8')
    for (const [key, cssVar] of [
      ['--status-lost-text', 'status-lost-text'],
      ['--warning-foreground', 'warning-foreground'],
    ] as const) {
      // index.css declares a light value then a `.dark` override; take the FIRST (light).
      const m = new RegExp(`--${cssVar}:\\s*color\\(display-p3\\s+([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\s*\\)`).exec(css)
      expect(m, `--${cssVar} not found in index.css`).not.toBeNull()
      const shipped = { r: Number(m![1]), g: Number(m![2]), b: Number(m![3]), a: 1 }
      const table = TOKENS[key]
      for (const ch of ['r', 'g', 'b'] as const) {
        expect(Math.abs(table[ch] - shipped[ch]), `${key} ${ch} drifted from index.css`).toBeLessThan(0.005)
      }
    }
  })
})
