// PR-6 AC-D01/AC-D02 (RI-1/RI-2, ADR-0013 Decision 2) — the ⌘K command menu is a themed
// overlay scope, so it MUST set its own text `color` explicitly (never inherit the body's
// computed light-theme color into a .dark scope — the verified offender). Group labels (a
// meta role) must use the tertiary/muted ramp, not the failing --ds-font-color-light ramp.
// jsdom can't measure contrast, so we assert at the CSS-SOURCE level.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const SRC = resolve(process.cwd(), 'src')
const SHEET = 'components/command/command-menu.css'
const css = readFileSync(join(SRC, SHEET), 'utf8')

/* ── The effective cascade ────────────────────────────────────────────────────────────────────
 * Reading the FIRST rule body that names a selector is not reading CSS. A second rule later in
 * the file wins, so an appended `.cm-item[data-child='true'] { font-weight: 700; margin-left:
 * 24px; border-left-width: 3px }` re-inverted the hierarchy the rung exists to state while every
 * guard in this file, the token-vocab scan and the kit-vocab scan all stayed green.
 *
 * So these guards resolve a declaration the way a browser does: every rule that matches the
 * element, ordered by specificity then source, shorthands expanded to the longhands they set.
 * What the resolver cannot read it records, and the first case below fails on it — a guard that
 * silently resolves an unread stylesheet to "nothing declared" is the hole one level up.
 */
type Rule = { selectors: string[]; body: string; media: string | null; order: number }

/** Anything the resolver met and could not model. Non-empty means every answer below is a guess. */
const unreadable: string[] = []

function parse(text: string, media: string | null, out: Rule[]): void {
  let i = 0
  while (i < text.length) {
    const open = text.indexOf('{', i)
    if (open < 0) break
    const prelude = text.slice(i, open).trim()
    let depth = 1
    let j = open + 1
    while (j < text.length && depth > 0) {
      if (text[j] === '{') depth++
      else if (text[j] === '}') depth--
      j++
    }
    const body = text.slice(open + 1, j - 1)
    if (/^@media\b/.test(prelude)) parse(body, prelude.replace(/^@media\s*/, ''), out)
    else if (prelude.startsWith('@')) unreadable.push(`at-rule the resolver does not model: ${prelude}`)
    else out.push({ selectors: prelude.split(',').map((s) => s.trim()).filter(Boolean), body, media, order: out.length })
    i = j
  }
}

const RULES: Rule[] = []
parse(css.replace(/\/\*[\s\S]*?\*\//g, ' '), null, RULES)

/** Each condition under which a different set of rules applies; `null` is the unconditional one. */
const MEDIA: (string | null)[] = [null, ...new Set(RULES.map((r) => r.media).filter((m): m is string => m !== null))]

function specificity(selector: string): number {
  let a = 0
  let b = 0
  let c = 0
  let s = selector
  // :is/:not/:has take the specificity of their most specific argument.
  s = s.replace(/:(?:not|is|has)\(([^()]*)\)/g, (_m, inner: string) => {
    const worst = Math.max(0, ...inner.split(',').map((p) => specificity(p.trim())))
    a += Math.floor(worst / 10000)
    b += Math.floor((worst % 10000) / 100)
    c += worst % 100
    return ' '
  })
  s = s.replace(/\[[^\]]*\]/g, () => { b++; return ' ' })
  s = s.replace(/::[\w-]+/g, () => { c++; return ' ' })
  s = s.replace(/:[\w-]+/g, () => { b++; return ' ' })
  s = s.replace(/#[\w-]+/g, () => { a++; return ' ' })
  s = s.replace(/\.[\w-]+/g, () => { b++; return ' ' })
  c += (s.match(/[a-zA-Z][\w-]*/g) ?? []).length // whatever is left is a type selector
  return a * 10000 + b * 100 + c
}

type Decl = { prop: string; value: string }

/** Split a value on top-level whitespace, so `var(--a) solid var(--b)` stays three parts. */
function parts(value: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of value) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (/\s/.test(ch) && depth === 0) {
      if (cur) out.push(cur)
      cur = ''
    } else cur += ch
  }
  if (cur) out.push(cur)
  return out
}

const SIDES = ['top', 'right', 'bottom', 'left'] as const
const BORDER_STYLE = new Set(['none', 'hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset'])

function box(value: string): Record<string, string> {
  const [t, r = t, b = t, l = r] = parts(value)
  return { top: t, right: r, bottom: b, left: l }
}

/** `1px solid red` in any order → the three longhands it sets. */
function borderParts(value: string): Decl[] {
  const p = parts(value)
  const out: Decl[] = []
  for (const part of p) {
    if (BORDER_STYLE.has(part.toLowerCase())) out.push({ prop: 'style', value: part })
    else out.push({ prop: out.some((d) => d.prop === 'width') ? 'color' : 'width', value: part })
  }
  return out
}

/**
 * Longhands only, so a later `border-left-width` can override an earlier `border-left` the way it
 * does in a browser. A shorthand not expanded here would silently fail to override, so the
 * unmodelled ones are recorded rather than passed through.
 */
function expand({ prop, value }: Decl): Decl[] {
  if (prop === 'margin' || prop === 'padding') {
    const sides = box(value)
    return SIDES.map((side) => ({ prop: `${prop}-${side}`, value: sides[side] }))
  }
  if (prop === 'border-width' || prop === 'border-style' || prop === 'border-color') {
    const axis = prop.slice('border-'.length)
    const sides = box(value)
    return SIDES.map((side) => ({ prop: `border-${side}-${axis}`, value: sides[side] }))
  }
  if (prop === 'border') return SIDES.flatMap((side) => borderParts(value).map((d) => ({ prop: `border-${side}-${d.prop}`, value: d.value })))
  const oneSide = /^border-(top|right|bottom|left)$/.exec(prop)
  if (oneSide) return borderParts(value).map((d) => ({ prop: `${prop}-${d.prop}`, value: d.value }))
  if (prop === 'font' || prop === 'all') {
    unreadable.push(`\`${prop}\` shorthand: it resets longhands this resolver reads, and it is not expanded`)
    return []
  }
  return [{ prop, value }]
}

function declarations(body: string): Decl[] {
  return body
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .flatMap((d) => {
      const k = d.indexOf(':')
      if (k < 0) {
        unreadable.push(`declaration with no colon: ${d}`)
        return []
      }
      return expand({ prop: d.slice(0, k).trim().toLowerCase(), value: d.slice(k + 1).trim() })
    })
}

function matchingSpecificity(el: Element, rule: Rule): number | null {
  let best: number | null = null
  for (const selector of rule.selectors) {
    // A `::pseudo-element` rule styles something this element does not own; not a hole.
    if (selector.includes('::')) continue
    let hit: boolean
    try {
      hit = el.matches(selector)
    } catch {
      unreadable.push(`selector the resolver could not match: ${selector}`)
      continue
    }
    if (hit) best = Math.max(best ?? 0, specificity(selector))
  }
  return best
}

function rulesFor(el: Element, media: string | null): { rule: Rule; spec: number }[] {
  return RULES.filter((r) => r.media === null || r.media === media)
    .map((rule) => ({ rule, spec: matchingSpecificity(el, rule) }))
    .filter((m): m is { rule: Rule; spec: number } => m.spec !== null)
    .sort((x, y) => x.spec - y.spec || x.rule.order - y.rule.order)
}

/** What this element's declarations actually resolve to at `media`. */
function effective(el: Element, media: string | null): Map<string, string> {
  const map = new Map<string, string>()
  for (const { rule } of rulesFor(el, media)) for (const d of declarations(rule.body)) map.set(d.prop, d.value)
  return map
}

/** Declarations that reach `el` and NOT `baseline` — i.e. the ones this variant mints. */
function only(el: Element, baseline: Element): Decl[] {
  return RULES.filter((r) => matchingSpecificity(el, r) !== null && matchingSpecificity(baseline, r) === null)
    .flatMap((r) => declarations(r.body))
}

// The palette's real markup (command-menu.tsx), not an approximation of it: rows are sibling
// divs inside a nested `.cm-group-list`, so a sibling or structural selector resolves here the
// way it resolves on screen. Child, plain and active-child rows sit together because the rung is
// defined against the row above it, and `active` has to out-rank the rung without its other steps.
const row = (name: string, opts: { child?: boolean; active?: boolean } = {}) =>
  `<div class="cm-item${opts.active === true ? ' active' : ''}" role="option" data-row="${name}"` +
  `${opts.child === true ? ' data-child="true"' : ''} data-to="/work/tasks">` +
  `<span class="cm-item-glyph"><svg></svg></span><span class="cm-item-label truncate"></span></div>`
document.body.innerHTML = `
  <div class="modal-shell__surface">
    <div class="cm-panel">
      <div class="cm-input"><span class="cm-input-icon"></span><input /></div>
      <div class="cm-body">
        <div class="cm-group-list" id="cm-list" role="listbox">
          <div role="group">
            <div class="cm-group text-muted-foreground">Work</div>
            <div class="cm-group-list">
              ${row('plain')}
              ${row('child', { child: true })}
              ${row('active', { child: true, active: true })}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`
const el = (q: string): Element => {
  const found = document.querySelector(q)
  if (found === null) throw new Error(`the fixture has no ${q}`)
  return found
}
const PANEL = el('.cm-panel')
const INPUT = el('.cm-input input')
const GROUP = el('.cm-group')

// A row is not one box: the glyph and the label carry the rung's size and colour too, so a rule
// aimed at a descendant moves the render exactly as one aimed at the row.
const partsOf = (row: string) => ({
  row: el(`[data-row="${row}"]`),
  glyph: el(`[data-row="${row}"] .cm-item-glyph`),
  icon: el(`[data-row="${row}"] .cm-item-glyph svg`),
  label: el(`[data-row="${row}"] .cm-item-label`),
})
const PART_KEYS = ['row', 'glyph', 'icon', 'label'] as const
const PLAIN = partsOf('plain')
const CHILD = partsOf('child')
const ACTIVE = partsOf('active')

// Resolve everything once, up front, so the sight check below runs against a completed read.
const RESOLVED = new Map<Element, Map<string | null, Map<string, string>>>()
for (const group of [PLAIN, CHILD, ACTIVE]) for (const key of PART_KEYS) {
  RESOLVED.set(group[key], new Map(MEDIA.map((m) => [m, effective(group[key], m)])))
}
for (const node of [PANEL, INPUT, GROUP]) {
  RESOLVED.set(node, new Map(MEDIA.map((m) => [m, effective(node, m)])))
}
/** Everything the child row's parts declare that the plain row's do not — the rung itself. */
const RUNG: (Decl & { part: string })[] = PART_KEYS.flatMap((key) =>
  only(CHILD[key], PLAIN[key]).map((d) => ({ ...d, part: key })),
)
const value = (node: Element, prop: string, media: string | null = null): string | undefined =>
  RESOLVED.get(node)?.get(media)?.get(prop)
const weight = (node: Element, media: string | null): number => Number(value(node, 'font-weight', media) ?? 400)
const at = (media: string | null): string => (media === null ? 'unconditionally' : `under @media ${media}`)

describe('the guards below read the real cascade', () => {
  it('the resolver read the whole stylesheet', () => {
    expect(
      [...new Set(unreadable)],
      `THIS GUARD HAS GONE BLIND. It could not model part of command-menu.css, so "no such ` +
        `declaration" below means "I did not read it", not "it is not there". Teach the resolver ` +
        `the construct or express the rule in one it reads — never narrow what it looks at.`,
    ).toEqual([])
  })

  it('the palette is styled in one file, so this one file is the whole answer', () => {
    // Two rules on one element have no tie-break but import order, so a `.cm-*` rule in any other
    // stylesheet silently outranks everything below while this guard reads none of it.
    const strays = (readdirSync(SRC, { recursive: true }) as string[])
      .map((f) => f.split('\\').join('/'))
      .filter((f) => f.endsWith('.css') && f !== SHEET)
      .filter((f) => /\.cm-[\w-]/.test(readFileSync(join(SRC, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ')))
    expect(strays, `these stylesheets also style the palette, and the cascade between them is ` +
      `decided by import order: ${strays.join(', ')}`).toEqual([])
  })
})

describe('AC-D01: the command-menu overlay scope sets text color explicitly', () => {
  it('AC-D01: .cm-panel sets an explicit color (no inheriting the body light-theme color into .dark)', () => {
    expect(value(PANEL, 'color')).toMatch(/^var\(--/)
  })

  it('AC-D01: .cm-item rows set an explicit color', () => {
    expect(value(PLAIN.row, 'color')).toMatch(/^var\(--/)
  })

  it('AC-D01: the input sets an explicit color (not inherited)', () => {
    expect(value(INPUT, 'color')).toMatch(/^var\(--/)
  })
})

describe('AC-D02: command-menu group labels use the muted/tertiary ramp, not the light ramp', () => {
  it('AC-D02: .cm-group label uses --muted-foreground (≈4.6:1), never --ds-font-color-light (≈3.1:1)', () => {
    expect(value(GROUP, 'color')).toBe('var(--muted-foreground)')
  })
})

/**
 * The palette is a FLAT list, and it lists the Work PARENT row ("Work" → /work/tasks) directly
 * above the Tasks CHILD row (→ /work/tasks). Two adjacent rows, one target: if they render at one
 * weight with one indent, the second row has no visible reason to exist. The rail and the drawer
 * are spared this only because their children sit inside a drawn indent guide.
 *
 * DESIGN.md § The Rail Type Ladder binds the answer — "the ladder is per-level, not per-surface":
 * a child wears the Child rung wherever it is listed. So `data-child` must actually carry that
 * rung here, expressed in the shared grammar (type ramp + `--rail-*` geometry tokens) rather than
 * in numbers minted for this one stylesheet.
 *
 * Asserted at the CSS SOURCE, like AC-D01/AC-D02 above: jsdom applies no stylesheet, so a
 * rendered-DOM assertion here would pass against an empty rule.
 */
describe('the ⌘K palette carries the ladder Child rung on data-child rows', () => {
  it('a child row is indented behind the hairline guide, not merely padded', () => {
    for (const media of MEDIA) {
      expect(value(CHILD.row, 'margin-left', media), at(media)).toBe('var(--rail-child-guide-x)')
      expect(value(CHILD.row, 'border-left-width', media), at(media)).toBe('var(--rail-child-guide)')
      expect(value(CHILD.row, 'border-left-style', media), at(media)).toBe('solid')
      expect(value(CHILD.row, 'border-left-color', media), at(media)).toBe('var(--border)')
      expect(value(CHILD.row, 'padding-left', media), at(media)).toBe('var(--rail-child-pad)')
    }
  })

  it('a child label steps down in size AND colour', () => {
    for (const media of MEDIA) {
      // On the label as resolved, not just on the row: `color`/`font-size` inherit, so a rule
      // aimed at `.cm-item-label` overrides the rung without touching it.
      for (const part of [CHILD.row, CHILD.label] as const) {
        expect(value(part, 'font-size', media) ?? value(CHILD.row, 'font-size', media), at(media)).toBe('var(--font-size-mono)')
        expect(value(part, 'color', media) ?? value(CHILD.row, 'color', media), at(media)).toBe('var(--muted-foreground)')
      }
    }
  })

  /**
   * The rung's own defect, caught by measuring the render rather than by reading DESIGN.md:
   * the ladder's Child weight (500) is a step DOWN from its Destination weight (600), but the
   * palette's rows declare no weight at all (400). Importing the 500 alone made Tasks BOLDER
   * than the Work row above it — the hierarchy inverted by the rule meant to state it.
   *
   * So the invariant is the RELATIONSHIP, not the number: a child is never heavier than the
   * row it hangs under. Asserted against the plain row's own resolved weight, so raising the
   * palette's destination voice later stays free while re-introducing the inversion does not.
   */
  it('a child is never heavier than the destination row it hangs under', () => {
    for (const media of MEDIA) for (const key of ['row', 'label'] as const) {
      // `font-weight` inherits, so the row's own weight is the label's floor; undeclared === 400.
      const child = Math.max(weight(CHILD.row, media), weight(CHILD[key], media))
      const parent = Math.max(weight(PLAIN.row, media), weight(PLAIN[key], media))
      expect(child, `child ${key} weight ${child} vs destination row ${parent} ${at(media)}`).toBeLessThanOrEqual(parent)
    }
  })

  it('the rung mints no colour or length of its own — every value is a shared token', () => {
    for (const { part, prop, value: v } of RUNG) {
      expect(v, `${part} \`${prop}\` declares a literal colour`).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i)
      expect(v, `${part} \`${prop}\` declares a raw length`).not.toMatch(/\d+(\.\d+)?(px|rem|em)\b/)
    }
  })

  /**
   * The rung is four steps — indent, size, colour, glyph — and nothing else. A property nobody
   * modelled is how the inversion came back: it arrived as `font-weight` in a rule appended
   * after the rung, and every guard here read only the first one.
   */
  it('the rung declares nothing beyond the steps the ladder names', () => {
    const allowed = new Set([
      'margin-left', 'padding-left', 'font-size', 'font-weight', 'color',
      'border-left-width', 'border-left-style', 'border-left-color',
      'border-top-left-radius', 'border-bottom-left-radius',
    ])
    const strays = [...new Set(RUNG.filter((d) => d.part === 'row').map((d) => d.prop))].filter((p) => !allowed.has(p))
    expect(strays, `the rung declares properties the ladder does not name: ${strays.join(', ')}`).toEqual([])
  })

  /**
   * BOTH axes, and no raw length on either. `width` alone left this rule half-guarded: `height`
   * was asserted by nothing in the repo, so it could be rewritten to a raw `22px` — an oblong
   * glyph, off the rung and off the token vocabulary — with every guard green.
   */
  it('the child glyph steps down on BOTH axes, in tokens', () => {
    for (const media of MEDIA) {
      expect(value(CHILD.icon, 'width', media), at(media)).toBe('var(--rail-icon-child)')
      expect(value(CHILD.icon, 'height', media), at(media)).toBe('var(--rail-icon-child)')
    }
  })

  it('active outranks the rung on SPECIFICITY, not on source order', () => {
    // The scar: two single-class rules on one element have no tie-break. `.cm-item.active` and
    // `.cm-item[data-child]` are both (0,2,0), so without a COMPOUND rule an active child keeps
    // the muted colour against the active background whatever the source order.
    for (const media of MEDIA) {
      expect(value(ACTIVE.row, 'color', media), at(media)).toBe('var(--text-primary)')
      // …and only the colour: size and indent state where the row sits, which selection never changes.
      expect(value(ACTIVE.row, 'font-size', media), at(media)).toBe(value(CHILD.row, 'font-size', media))
      expect(value(ACTIVE.row, 'margin-left', media), at(media)).toBe(value(CHILD.row, 'margin-left', media))
    }
  })
})
