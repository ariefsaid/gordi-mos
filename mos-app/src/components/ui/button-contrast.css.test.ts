import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const button = read('src/components/ui/Button.css')
const iconButton = read('src/components/ui/IconButton.css')
const cafe = read('src/pages/cafe-opening-page.css')
const index = read('src/index.css')
const themeLight = read('src/styles/tokens/theme-light.css')
const themeDark = read('src/styles/tokens/theme-dark.css')

type Rgb = [number, number, number]
const decodeSrgb = (value: number) => value <= 0.04045
  ? value / 12.92
  : ((value + 0.055) / 1.055) ** 2.4
const encodeSrgb = (value: number) => value <= 0.0031308
  ? 12.92 * value
  : 1.055 * Math.max(value, 0) ** (1 / 2.4) - 0.055
const p3ToSrgb = (value: Rgb): Rgb => {
  const p3 = value.map(decodeSrgb)
  const xyz = [
    0.48657095 * p3[0] + 0.26566769 * p3[1] + 0.19821729 * p3[2],
    0.22897456 * p3[0] + 0.69173852 * p3[1] + 0.07928691 * p3[2],
    0.04511338 * p3[1] + 1.04394437 * p3[2],
  ]
  return [
    encodeSrgb(3.2404542 * xyz[0] - 1.5371385 * xyz[1] - 0.4985314 * xyz[2]),
    encodeSrgb(-0.969266 * xyz[0] + 1.8760108 * xyz[1] + 0.041556 * xyz[2]),
    encodeSrgb(0.0556434 * xyz[0] - 0.2040259 * xyz[1] + 1.0572252 * xyz[2]),
  ].map((channel) => Math.max(0, Math.min(1, channel))) as Rgb
}
const luminance = (value: Rgb) => {
  const [r, g, b] = value.map(decodeSrgb)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: Rgb, b: Rgb) => {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (lighter + 0.05) / (darker + 0.05)
}
const p3Token = (css: string, token: string): Rgb => {
  const match = css.match(new RegExp(`${token}:\\s*color\\(display-p3\\s+([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\)`))
  if (!match) throw new Error(`missing ${token}`)
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

const productionCss = readdirSync(resolve(process.cwd(), 'src'), { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.css') && !entry.name.includes('.test.'))
  .map((entry) => ({
    path: resolve(entry.parentPath, entry.name),
    css: readFileSync(resolve(entry.parentPath, entry.name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''),
  }))

describe('shared button contrast states', () => {
  it('uses a quiet surface for neutral hover states instead of the solid action blue', () => {
    const violations: string[] = []
    for (const { path, css } of productionCss) {
      for (const block of css.split('}')) {
        const open = block.lastIndexOf('{')
        if (open < 0) continue
        const selector = block.slice(0, open).split('}').at(-1) ?? ''
        if (!selector.includes(':hover')) continue
        const body = block.slice(open + 1)
        if (/background(?:-color)?\s*:\s*[^;]*var\(--accent\)/.test(body)) {
          violations.push(`${path}: ${selector.trim()}`)
        }
      }
    }
    expect(
      violations,
      '--accent is solid action blue; neutral hover paint must use a quiet surface token',
    ).toEqual([])
  })

  it('darkens the primary hover without compositing the action blue over the page', () => {
    const primaryRules = [
      button.match(/\.btn-primary:hover[^{}]*\{([^}]*)\}/)?.[1] ?? '',
      iconButton.match(/\.mk-iconbtn--primary:hover[^{}]*\{([^}]*)\}/)?.[1] ?? '',
    ]
    for (const rule of primaryRules) {
      expect(rule).toContain('var(--brand-navy)')
      expect(rule).not.toContain('transparent')
    }
  })

  it('uses a theme-aware destructive action fill in text and icon buttons', () => {
    expect(button).toMatch(/\.btn-destructive\s*\{[^}]*var\(--destructive-action\)/s)
    expect(iconButton).toMatch(/\.mk-iconbtn--primary\.mk-accent--danger\s*\{[^}]*var\(--destructive-action\)/s)
    expect(index).toMatch(/:root,[\s\S]*--destructive-action:\s*var\(--ds-color-red12\)/)
    expect(index).toMatch(/\.dark\s*\{[\s\S]*--destructive-action:\s*var\(--ds-color-red8\)/)
    expect(iconButton).toMatch(/\.mk-iconbtn--primary\.mk-accent--danger:hover[^}]*var\(--destructive-action\)[^}]*var\(--shadow-cast\)/s)
  })

  it('uses the contrast-safe control boundary for outlined controls', () => {
    expect(index).toMatch(/--control-border:\s*color-mix\(in srgb, var\(--foreground\) 50%, var\(--background\)\)/)
    expect(button).toMatch(/\.btn-outline\s*\{[^}]*var\(--control-border\)/s)
    expect(iconButton).toMatch(/\.mk-iconbtn--secondary\s*\{[^}]*var\(--control-border\)/s)
    expect(cafe).toMatch(/\.cafe-location-choice__option\s*\{[^}]*var\(--control-border\)/s)

    for (const theme of [themeLight, themeDark]) {
      const foreground = p3ToSrgb(p3Token(theme, '--ds-font-color-primary'))
      const background = p3ToSrgb(p3Token(theme, '--ds-background-primary'))
      const boundary = foreground.map((channel, i) => (channel + background[i]) / 2) as Rgb
      expect(contrast(boundary, background)).toBeGreaterThanOrEqual(3)
    }
  })

  it('does not apply hover paint to aria-disabled shared controls', () => {
    for (const css of [button, iconButton]) {
      for (const selector of css.matchAll(/([^{}]*:hover[^{}]*)\{/g)) {
        expect(selector[1]).toContain(':not([aria-disabled="true"])')
      }
    }
  })
})
