// AC-001: Resolved token values equal the E7 targets (light + dark)
// Unit test (Vitest). Reads source CSS files directly and asserts raw declared values.
// jsdom does NOT resolve var() chains / color-mix() / color(display-p3) — this test
// asserts the SOURCE token definitions match E7 targets (per Director verification note).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function extractToken(css: string, token: string): string | null {
  // Match: --token-name: value;  (handles color(display-p3 ...) with parentheses)
  const escaped = token.replace(/--/g, '--')
  const regex = new RegExp(`${escaped}\\s*:\\s*([^;]+);`)
  const match = css.match(regex)
  return match ? match[1].trim() : null
}

function normalizeColor(val: string): string {
  return val.replace(/\s+/g, ' ').trim()
}

function assertColorClose(actual: string, expected: string, label: string, tolerance = 0.01) {
  const a = normalizeColor(actual)
  const e = normalizeColor(expected)
  if (a.startsWith('color(display-p3') && e.startsWith('color(display-p3')) {
    const aVals = a.match(/[\d.]+/g)!.map(Number)
    const eVals = e.match(/[\d.]+/g)!.map(Number)
    for (let i = 0; i < Math.min(aVals.length, eVals.length); i++) {
      const diff = Math.abs(aVals[i] - eVals[i])
      if (diff > tolerance) {
        throw new Error(`${label}: channel ${i} diff ${diff.toFixed(4)} > ${tolerance}\n  actual:   ${a}\n  expected: ${e}`)
      }
    }
    return
  }
  // For other values (shadows, gradients, color-mix), do normalized string compare
  if (a !== e) {
    throw new Error(`${label}:\n  actual:   ${a}\n  expected: ${e}`)
  }
}

describe('AC-001: Token SOURCE values match E7 warm palette (light + dark)', () => {
  const themeLight = readFileSync(resolve(process.cwd(), 'src/styles/tokens/theme-light.css'), 'utf-8')
  const themeDark = readFileSync(resolve(process.cwd(), 'src/styles/tokens/theme-dark.css'), 'utf-8')
  const aliases = readFileSync(resolve(process.cwd(), 'src/styles/tokens/aliases.css'), 'utf-8')
  const indexCss = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf-8')

  // Combined source for tokens that may be in index.css (brand, status-text, shadows, gradients)
  const allSources = { themeLight, themeDark, aliases, indexCss }

  function getToken(token: string, source: keyof typeof allSources = 'themeLight'): string {
    const val = extractToken(allSources[source], token)
    if (!val) throw new Error(`Token ${token} not found in ${source}`)
    return val
  }

  describe('Light theme — theme-light.css', () => {
    it('--ds-background-primary (surface-primary alias target)', () => {
      assertColorClose(
        getToken('--ds-background-primary'),
        'color(display-p3 1 0.988 0.972)',
        '--ds-background-primary'
      )
    })

    it('--ds-background-secondary', () => {
      assertColorClose(
        getToken('--ds-background-secondary'),
        'color(display-p3 0.984 0.976 0.957)',
        '--ds-background-secondary'
      )
    })

    it('--ds-background-tertiary', () => {
      assertColorClose(
        getToken('--ds-background-tertiary'),
        'color(display-p3 0.969 0.957 0.933)',
        '--ds-background-tertiary'
      )
    })

    it('--ds-background-quaternary', () => {
      assertColorClose(
        getToken('--ds-background-quaternary'),
        'color(display-p3 0.949 0.933 0.902)',
        '--ds-background-quaternary'
      )
    })


    it('--ds-font-color-primary (text-primary alias target)', () => {
      assertColorClose(
        getToken('--ds-font-color-primary'),
        'color(display-p3 0.145 0.141 0.133)',
        '--ds-font-color-primary'
      )
    })

    it('--ds-font-color-secondary', () => {
      assertColorClose(
        getToken('--ds-font-color-secondary'),
        'color(display-p3 0.388 0.380 0.365)',
        '--ds-font-color-secondary'
      )
    })

    it('--ds-font-color-tertiary', () => {
      assertColorClose(
        getToken('--ds-font-color-tertiary'),
        'color(display-p3 0.541 0.533 0.518)',
        '--ds-font-color-tertiary'
      )
    })

    it('--ds-font-color-light', () => {
      assertColorClose(
        getToken('--ds-font-color-light'),
        'color(display-p3 0.686 0.678 0.667)',
        '--ds-font-color-light'
      )
    })

    it('--ds-border-color-medium (Single-Border warm hairline)', () => {
      assertColorClose(
        getToken('--ds-border-color-medium'),
        'color(display-p3 0.922 0.914 0.898)',
        '--ds-border-color-medium'
      )
    })

    it('--ds-border-color-strong (checkboxes/pressed)', () => {
      assertColorClose(
        getToken('--ds-border-color-strong'),
        'color(display-p3 0.867 0.855 0.831)',
        '--ds-border-color-strong'
      )
    })

    it('--ds-color-blue9 (action blue base ≈ --e7-action)', () => {
      assertColorClose(
        getToken('--ds-color-blue9'),
        'color(display-p3 0.276 0.384 0.837)',
        '--ds-color-blue9'
      )
    })

    it('--ds-color-blue10 (action hover)', () => {
      assertColorClose(
        getToken('--ds-color-blue10'),
        'color(display-p3 0.234 0.343 0.801)',
        '--ds-color-blue10'
      )
    })

    it('--ds-color-blue11 (action active)', () => {
      assertColorClose(
        getToken('--ds-color-blue11'),
        'color(display-p3 0.256 0.354 0.755)',
        '--ds-color-blue11'
      )
    })

    it('--ds-color-green (success base)', () => {
      assertColorClose(
        getToken('--ds-color-green'),
        'color(display-p3 0.332 0.634 0.442)',
        '--ds-color-green'
      )
    })

    it('--ds-color-red (destructive base)', () => {
      assertColorClose(
        getToken('--ds-color-red'),
        'color(display-p3 0.83 0.329 0.324)',
        '--ds-color-red'
      )
    })

    it('--ds-color-amber (warning base)', () => {
      assertColorClose(
        getToken('--ds-color-amber'),
        'color(display-p3 1 0.77 0.26)',
        '--ds-color-amber'
      )
    })

    it('--ds-color-violet (categorical)', () => {
      assertColorClose(
        getToken('--ds-color-violet'),
        'color(display-p3 0.417 0.341 0.784)',
        '--ds-color-violet'
      )
    })
  })

  describe('Dark theme — theme-dark.css (warm neutrals, shared hues unchanged)', () => {
    it('--ds-background-primary (warm dark surface)', () => {
      assertColorClose(
        getToken('--ds-background-primary', 'themeDark'),
        'color(display-p3 0.102 0.094 0.078)',
        '--ds-background-primary (dark)'
      )
    })

    it('--ds-background-secondary', () => {
      assertColorClose(
        getToken('--ds-background-secondary', 'themeDark'),
        'color(display-p3 0.122 0.114 0.099)',
        '--ds-background-secondary (dark)'
      )
    })

    it('--ds-background-tertiary', () => {
      assertColorClose(
        getToken('--ds-background-tertiary', 'themeDark'),
        'color(display-p3 0.141 0.134 0.119)',
        '--ds-background-tertiary (dark)'
      )
    })

    it('--ds-background-quaternary', () => {
      assertColorClose(
        getToken('--ds-background-quaternary', 'themeDark'),
        'color(display-p3 0.16 0.154 0.14)',
        '--ds-background-quaternary (dark)'
      )
    })

    it('--ds-font-color-primary (warm near-white)', () => {
      assertColorClose(
        getToken('--ds-font-color-primary', 'themeDark'),
        'color(display-p3 0.954 0.951 0.946)',
        '--ds-font-color-primary (dark)'
      )
    })

    it('--ds-font-color-secondary (warm grey)', () => {
      assertColorClose(
        getToken('--ds-font-color-secondary', 'themeDark'),
        'color(display-p3 0.767 0.756 0.733)',
        '--ds-font-color-secondary (dark)'
      )
    })

    it('--ds-font-color-tertiary', () => {
      assertColorClose(
        getToken('--ds-font-color-tertiary', 'themeDark'),
        'color(display-p3 0.574 0.558 0.527)',
        '--ds-font-color-tertiary (dark)'
      )
    })

    it('--ds-font-color-light', () => {
      assertColorClose(
        getToken('--ds-font-color-light', 'themeDark'),
        'color(display-p3 0.417 0.406 0.383)',
        '--ds-font-color-light (dark)'
      )
    })

    it('--ds-border-color-strong (warm border)', () => {
      assertColorClose(
        getToken('--ds-border-color-strong', 'themeDark'),
        'color(display-p3 0.283 0.261 0.218)',
        '--ds-border-color-strong (dark)'
      )
    })

    it('--ds-border-color-medium', () => {
      assertColorClose(
        getToken('--ds-border-color-medium', 'themeDark'),
        'color(display-p3 0.199 0.186 0.161)',
        '--ds-border-color-medium (dark)'
      )
    })

    it('--ds-border-color-light', () => {
      assertColorClose(
        getToken('--ds-border-color-light', 'themeDark'),
        'color(display-p3 0.152 0.144 0.128)',
        '--ds-border-color-light (dark)'
      )
    })

    // Shared hues must be IDENTICAL to light (action blue, status bases)
    it('--ds-color-blue9 (action blue same as light)', () => {
      assertColorClose(
        getToken('--ds-color-blue9', 'themeDark'),
        'color(display-p3 0.276 0.384 0.837)',
        '--ds-color-blue9 (dark)'
      )
    })

    it('--ds-color-green (success same as light)', () => {
      assertColorClose(
        getToken('--ds-color-green', 'themeDark'),
        'color(display-p3 0.332 0.634 0.442)',
        '--ds-color-green (dark)'
      )
    })

    it('--ds-color-red (destructive same as light)', () => {
      assertColorClose(
        getToken('--ds-color-red', 'themeDark'),
        'color(display-p3 0.83 0.329 0.324)',
        '--ds-color-red (dark)'
      )
    })

    it('--ds-color-amber (warning same as light)', () => {
      assertColorClose(
        getToken('--ds-color-amber', 'themeDark'),
        'color(display-p3 1 0.77 0.26)',
        '--ds-color-amber (dark)'
      )
    })

    it('--ds-color-violet (categorical same as light)', () => {
      assertColorClose(
        getToken('--ds-color-violet', 'themeDark'),
        'color(display-p3 0.417 0.341 0.784)',
        '--ds-color-violet (dark)'
      )
    })

    // Accent ramp unchanged
    it('--ds-accent-tertiary (dark accent subtle unchanged)', () => {
      assertColorClose(
        getToken('--ds-accent-tertiary', 'themeDark'),
        'color(display-p3 0.105 0.141 0.275)',
        '--ds-accent-tertiary (dark)'
      )
    })
  })

  describe('Semantic aliases — aliases.css', () => {
    it('--surface-primary → --ds-background-primary', () => {
      const val = extractToken(aliases, '--surface-primary')!
      expect(val).toBe('var(--ds-background-primary)')
    })

    it('--surface-secondary → --ds-background-secondary', () => {
      const val = extractToken(aliases, '--surface-secondary')!
      expect(val).toBe('var(--ds-background-secondary)')
    })

    it('--surface-tertiary → --ds-background-tertiary', () => {
      const val = extractToken(aliases, '--surface-tertiary')!
      expect(val).toBe('var(--ds-background-tertiary)')
    })

    it('--surface-quaternary → --ds-background-quaternary', () => {
      const val = extractToken(aliases, '--surface-quaternary')!
      expect(val).toBe('var(--ds-background-quaternary)')
    })

    it('--text-primary → --ds-font-color-primary', () => {
      const val = extractToken(aliases, '--text-primary')!
      expect(val).toBe('var(--ds-font-color-primary)')
    })

    it('--text-secondary → --ds-font-color-secondary', () => {
      const val = extractToken(aliases, '--text-secondary')!
      expect(val).toBe('var(--ds-font-color-secondary)')
    })

    it('--text-tertiary → --ds-font-color-tertiary', () => {
      const val = extractToken(aliases, '--text-tertiary')!
      expect(val).toBe('var(--ds-font-color-tertiary)')
    })

    it('--text-light → --ds-font-color-light', () => {
      const val = extractToken(aliases, '--text-light')!
      expect(val).toBe('var(--ds-font-color-light)')
    })

    it('--border-medium → --ds-border-color-medium (Single-Border)', () => {
      const val = extractToken(aliases, '--border-medium')!
      expect(val).toBe('var(--ds-border-color-medium)')
    })

    it('--border-strong → --ds-border-color-strong', () => {
      const val = extractToken(aliases, '--border-strong')!
      expect(val).toBe('var(--ds-border-color-strong)')
    })

    it('--input → --border-medium (Single-Border restored: field border == divider)', () => {
      const val = extractToken(aliases, '--input')!
      expect(val).toBe('var(--border-medium)')
    })

    it('--accent → --ds-color-blue (action blue)', () => {
      const val = extractToken(aliases, '--accent')!
      expect(val).toBe('var(--ds-color-blue)')
    })

    it('--accent-hover → --ds-color-blue10', () => {
      const val = extractToken(aliases, '--accent-hover')!
      expect(val).toBe('var(--ds-color-blue10)')
    })

    it('--accent-active → --ds-color-blue11', () => {
      const val = extractToken(aliases, '--accent-active')!
      expect(val).toBe('var(--ds-color-blue11)')
    })

    it('--accent-subtle → 10% wash of action blue (NOT --ds-accent-tertiary)', () => {
      const val = extractToken(aliases, '--accent-subtle')!
      assertColorClose(val, 'color(display-p3 0.276 0.384 0.837 / 0.10)', '--accent-subtle')
    })

  })

  describe('App entry + brand + Tailwind theme — index.css', () => {
    it('--brand-navy (light) matches E7', () => {
      assertColorClose(
        getToken('--brand-navy', 'indexCss'),
        'color(display-p3 0.0313 0.0311 0.0893)',
        '--brand-navy (light)'
      )
    })

    it('--brand-navy-text (light) matches E7', () => {
      assertColorClose(
        getToken('--brand-navy-text', 'indexCss'),
        'color(display-p3 0.0435 0.0436 0.1192)',
        '--brand-navy-text (light)'
      )
    })

    it('--brand-orange (light) confirmed unchanged', () => {
      assertColorClose(
        getToken('--brand-orange', 'indexCss'),
        'color(display-p3 0.9 0.45 0.2)',
        '--brand-orange (light)'
      )
    })

    it('--brand-navy (dark) matches E7', () => {
      // Extract from .dark block
      const darkBlock = indexCss.match(/\.dark\s*{([\s\S]*?)}/)?.[1] || ''
      assertColorClose(
        extractToken(darkBlock, '--brand-navy')!,
        'color(display-p3 0.18 0.20 0.30)',
        '--brand-navy (dark)'
      )
    })

    it('--brand-navy-text (dark) matches E7', () => {
      const darkBlock = indexCss.match(/\.dark\s*{([\s\S]*?)}/)?.[1] || ''
      assertColorClose(
        extractToken(darkBlock, '--brand-navy-text')!,
        'color(display-p3 0.70 0.74 0.86)',
        '--brand-navy-text (dark)'
      )
    })

    it('--brand-orange (dark) matches E7', () => {
      const darkBlock = indexCss.match(/\.dark\s*{([\s\S]*?)}/)?.[1] || ''
      assertColorClose(
        extractToken(darkBlock, '--brand-orange')!,
        'color(display-p3 0.70 0.42 0.16)',
        '--brand-orange (dark)'
      )
    })

    it('--status-open-text (light) AA-darkened blue', () => {
      assertColorClose(
        getToken('--status-open-text', 'indexCss'),
        'color(display-p3 0.1001 0.0765 0.4201)',
        '--status-open-text (light)'
      )
    })

    it('--status-won-text (light) AA-darkened green', () => {
      assertColorClose(
        getToken('--status-won-text', 'indexCss'),
        'color(display-p3 0.0704 0.1496 0.0619)',
        '--status-won-text (light)'
      )
    })

    it('--status-lost-text (light) AA-darkened red', () => {
      assertColorClose(
        getToken('--status-lost-text', 'indexCss'),
        'color(display-p3 0.2796 0.1396 0.0158)',
        '--status-lost-text (light)'
      )
    })

    it('--status-violet-text (light) AA-darkened violet', () => {
      assertColorClose(
        getToken('--status-violet-text', 'indexCss'),
        'color(display-p3 0.1372 0.0724 0.4282)',
        '--status-violet-text (light)'
      )
    })

    it('--warning-foreground (light) = deep brown (NOT red)', () => {
      assertColorClose(
        getToken('--warning-foreground', 'indexCss'),
        'color(display-p3 0.28 0.22 0.08)',
        '--warning-foreground (light)'
      )
    })

    it('--status-open-text (dark) AA on dark', () => {
      const darkBlock = indexCss.match(/\.dark\s*{([\s\S]*?)}/)?.[1] || ''
      assertColorClose(
        extractToken(darkBlock, '--status-open-text')!,
        'color(display-p3 0.62 0.72 1.0)',
        '--status-open-text (dark)'
      )
    })

    it('--status-won-text (dark) AA on dark', () => {
      const darkBlock = indexCss.match(/\.dark\s*{([\s\S]*?)}/)?.[1] || ''
      assertColorClose(
        extractToken(darkBlock, '--status-won-text')!,
        'color(display-p3 0.55 0.78 0.55)',
        '--status-won-text (dark)'
      )
    })

    it('--status-lost-text (dark) AA on dark', () => {
      const darkBlock = indexCss.match(/\.dark\s*{([\s\S]*?)}/)?.[1] || ''
      assertColorClose(
        extractToken(darkBlock, '--status-lost-text')!,
        'color(display-p3 0.92 0.60 0.60)',
        '--status-lost-text (dark)'
      )
    })

    it('--status-violet-text (dark) AA on dark', () => {
      const darkBlock = indexCss.match(/\.dark\s*{([\s\S]*?)}/)?.[1] || ''
      assertColorClose(
        extractToken(darkBlock, '--status-violet-text')!,
        'color(display-p3 0.70 0.62 1.0)',
        '--status-violet-text (dark)'
      )
    })

    it('--warning-foreground (dark) = light amber-brown', () => {
      const darkBlock = indexCss.match(/\.dark\s*{([\s\S]*?)}/)?.[1] || ''
      assertColorClose(
        extractToken(darkBlock, '--warning-foreground')!,
        'color(display-p3 0.85 0.75 0.45)',
        '--warning-foreground (dark)'
      )
    })

    it('--shadow-overlay: navy-tinted (NOT cool hsl(240...))', () => {
      const val = getToken('--shadow-overlay', 'indexCss')
      // eslint-disable-next-line no-restricted-syntax -- test expectation for E7 shadow value
      expect(val).toContain('hsl(210 40% 24%')
      // eslint-disable-next-line no-restricted-syntax -- test expectation for old shadow value
      expect(val).not.toContain('hsl(240 10% 8%')
    })

    it('--scrim: color-mix from --brand-navy @ 32%', () => {
      const val = getToken('--scrim', 'indexCss')
      expect(val).toContain('color-mix(in srgb, var(--brand-navy) 32%')
    })

    it('--shadow-popover: color-mix from --brand-navy @ 10%', () => {
      const val = getToken('--shadow-popover', 'indexCss')
      expect(val).toContain('color-mix(in srgb, var(--brand-navy) 10%')
    })

    it('--shadow-drawer: color-mix from --brand-navy @ 16%', () => {
      const val = getToken('--shadow-drawer', 'indexCss')
      expect(val).toContain('color-mix(in srgb, var(--brand-navy) 16%')
    })

    it('--gradient-primary-sheen: E7 action blue stops', () => {
      const val = getToken('--gradient-primary-sheen', 'indexCss')
      expect(val).toContain('linear-gradient')
      expect(val).toContain('225 75%')
    })

    it('--gradient-surface-wash: E7 brand-navy wash', () => {
      const val = getToken('--gradient-surface-wash', 'indexCss')
      expect(val).toContain('linear-gradient')
      expect(val).toContain('color-mix(in srgb, var(--brand-navy)')
    })

    it('--color-border (Tailwind) → --border-medium (Single-Border)', () => {
      // Check @theme inline block
      const themeBlock = indexCss.match(/@theme inline\s*{([\s\S]*?)}/)?.[1] || ''
      assertColorClose(
        extractToken(themeBlock, '--color-border')!,
        'var(--border-medium)',
        '--color-border'
      )
    })

    it('--color-input (Tailwind) → --border-medium (Single-Border)', () => {
      const themeBlock = indexCss.match(/@theme inline\s*{([\s\S]*?)}/)?.[1] || ''
      assertColorClose(
        extractToken(themeBlock, '--color-input')!,
        'var(--border-medium)',
        '--color-input'
      )
    })

    it('--color-ring (Tailwind) → --accent (action blue)', () => {
      const themeBlock = indexCss.match(/@theme inline\s*{([\s\S]*?)}/)?.[1] || ''
      assertColorClose(
        extractToken(themeBlock, '--color-ring')!,
        'var(--accent)',
        '--color-ring'
      )
    })

    it('--color-warning-foreground (Tailwind) → --warning-foreground (deep brown)', () => {
      const themeBlock = indexCss.match(/@theme inline\s*{([\s\S]*?)}/)?.[1] || ''
      assertColorClose(
        extractToken(themeBlock, '--color-warning-foreground')!,
        'var(--warning-foreground)',
        '--color-warning-foreground'
      )
    })

    it('--radius-lg = 0.75rem (12px) confirmed', () => {
      assertColorClose(
        getToken('--radius-lg', 'indexCss'),
        '0.75rem',
        '--radius-lg'
      )
    })

    // Bare shadcn compat layer
    it('--border (bare) → --border-medium', () => {
      assertColorClose(
        getToken('--border', 'indexCss'),
        'var(--border-medium)',
        '--border (bare)'
      )
    })

    it('--input (bare) → --border-medium (Single-Border restored)', () => {
      assertColorClose(
        getToken('--input', 'indexCss'),
        'var(--border-medium)',
        '--input (bare)'
      )
    })

    it('--warning-foreground (bare) → deep brown value', () => {
      assertColorClose(
        getToken('--warning-foreground', 'indexCss'),
        'color(display-p3 0.28 0.22 0.08)',
        '--warning-foreground (bare)'
      )
    })
  })
})