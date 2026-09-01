/**
 * THE PICTURE AN `<svg>` DRAWS, AS A COMPARABLE STRING.
 *
 * `rail-glyph-uniqueness.test.tsx` asks whether two rail entries draw the same mark. Its first
 * answer compared `svg.innerHTML` — which certifies SPELLING, not shape. Two reviewers proved it
 * independently: the Café cup wrapped in a harmless `<g>` passed, and the Events calendar
 * re-expressed as `<rect x="3.0" …>` with expanded path commands passed. Both drew a
 * pixel-identical copy of a mark already in the rail; both were green.
 *
 * So this canonicalises geometry instead of markup. Every drawing element in the tree, wherever it
 * sits, becomes path data; every path becomes absolute, shorthand-free segments; every coordinate
 * becomes a fraction of the viewBox, quantised; the resulting SUBPATHS are sorted. Two marks that
 * draw the same picture collide however they are spelled — through a `<g>`, through a different
 * primitive, through `3.0` for `3`, through `h18` for `L21 9`, through one `<path>` split into
 * three, through a 48-unit viewBox with doubled coordinates.
 *
 * **Fail-closed, deliberately.** Anything this cannot canonicalise — an unknown element, a
 * non-translate `transform`, a malformed number, a path command it does not implement (the
 * `S`/`T` shorthands among them) — THROWS rather than returning a signature it cannot stand
 * behind. The one exception is a primitive that draws nothing at all — `r=0`, or a `points` list
 * with fewer than two points — which SVG renders as empty, so it is skipped rather than refused.
 * A malformed list (an odd coordinate count) is not that case and throws. A guard that quietly
 * certifies what it does not understand is the exact defect this file exists to close, and a throw
 * inside the guard is a red test, which is the correct outcome: extend the canonicaliser, do not
 * let it shrug.
 *
 * **What it does NOT normalise**, stated so nobody mistakes the guarantee for a bigger one:
 * stroke DIRECTION (a subpath drawn end-to-start renders identically under round caps and
 * signs differently here) and drawing ATTRIBUTES (stroke-width, fill, opacity). Attributes are
 * a real limit, not only a conservative one: a filled dot and a hollow ring of the same radius
 * signature equal, so the guard would call two legitimately distinct marks a collision. Every
 * mark in the set is `fill="none" stroke="currentColor"` today, which is why that has not
 * bitten; a mark that breaks the pattern needs attributes in the signature, not a suppression.
 */

/** Fraction-of-viewBox quantum. 1/1000 of the box ≈ 0.024 units in the 24-unit icon idiom, so
 *  `3`, `3.0` and `3.001` agree while genuinely different marks stay apart. */
const PRECISION = 3

const NUMBER_HEAD = /^[+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?/
const NUMBER_ALL = /[+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?/g

const ARG_COUNT: Readonly<Record<string, number>> = {
  M: 2, L: 2, H: 1, V: 1, C: 6, Q: 4, A: 7, Z: 0,
}

/** Containers we descend through. A `<g>` is invisible to this function, which is the point. */
const CONTAINERS = new Set(['svg', 'g'])
/** Elements that draw nothing and carry no geometry. */
const NON_DRAWING = new Set(['title', 'desc', 'metadata'])

interface Seg {
  cmd: string
  args: number[]
}

function fail(message: string): never {
  throw new Error(`glyph-shape: ${message}`)
}

function attrNumber(el: Element, name: string, fallback = 0): number {
  const raw = el.getAttribute(name)
  if (raw === null || raw.trim() === '') return fallback
  const n = Number(raw)
  if (!Number.isFinite(n)) fail(`<${el.localName}> ${name}="${raw}" is not a plain number`)
  return n
}

function numbersIn(text: string): number[] {
  return (text.match(NUMBER_ALL) ?? []).map(Number)
}

/** Quantised decimal, with `-0` folded onto `0` so a mirrored zero does not read as a difference. */
function q(value: number): string {
  const rounded = Number(value.toFixed(PRECISION))
  return Object.is(rounded, -0) ? '0' : String(rounded)
}

// ── path data → segment list ────────────────────────────────────────────────────────────────────

/**
 * Tokenise `d` into raw segments, preserving case (relative vs absolute) for `absolutise`.
 * Handles implicit command repetition (including M→L, m→l) and arc flag packing (`a1 1 0 011 2`).
 */
function parsePathData(d: string): Seg[] {
  const segs: Seg[] = []
  let i = 0
  let cmd = ''

  const skipSep = () => {
    while (i < d.length && (d[i] === ' ' || d[i] === ',' || d[i] === '\t' || d[i] === '\n' || d[i] === '\r')) i++
  }
  const readNumber = (): number => {
    skipSep()
    const m = NUMBER_HEAD.exec(d.slice(i))
    if (!m) fail(`expected a number at index ${i} of path data "${d}"`)
    i += m[0].length
    const value = Number(m[0])
    // `1e400` parses to Infinity, which would quantise to a signature rather than refusing.
    if (!Number.isFinite(value)) fail(`"${m[0]}" is not a finite coordinate in path data "${d}"`)
    return value
  }
  const readFlag = (): number => {
    skipSep()
    const c = d[i]
    if (c !== '0' && c !== '1') fail(`expected an arc flag at index ${i} of path data "${d}"`)
    i++
    return Number(c)
  }

  skipSep()
  while (i < d.length) {
    let sawLetter = false
    if (/[a-zA-Z]/.test(d[i])) {
      cmd = d[i]
      i++
      sawLetter = true
    } else if (cmd === '') {
      fail(`path data does not open with a command: "${d}"`)
    } else if (cmd === 'M') {
      cmd = 'L' // implicit repetition after a moveto is a lineto (SVG 1.1 §8.3.2)
    } else if (cmd === 'm') {
      cmd = 'l'
    }

    const up = cmd.toUpperCase()
    const argc = ARG_COUNT[up]
    if (argc === undefined) fail(`unsupported path command "${cmd}" in "${d}"`)
    if (argc === 0 && !sawLetter) fail(`stray argument after a closepath in "${d}"`)

    const args: number[] = []
    if (up === 'A') {
      args.push(readNumber(), readNumber(), readNumber(), readFlag(), readFlag(), readNumber(), readNumber())
    } else {
      for (let k = 0; k < argc; k++) args.push(readNumber())
    }
    segs.push({ cmd, args })
    skipSep()
  }
  return segs
}

/**
 * Absolute, shorthand-free segments: only `M L C Q A Z`. Relative commands are resolved against
 * the running point and `H`/`V` become `L`, so `M3 9h18` and `M3 9L21 9` end up the same list.
 * `S`/`T` never arrive here — parsePathData refuses them (see the file docblock).
 */
function absolutise(segs: readonly Seg[]): Seg[] {
  const out: Seg[] = []
  let x = 0, y = 0, startX = 0, startY = 0

  for (const { cmd, args } of segs) {
    const up = cmd.toUpperCase()
    const relative = cmd !== up
    const ox = relative ? x : 0
    const oy = relative ? y : 0

    switch (up) {
      case 'M':
        x = args[0] + ox; y = args[1] + oy
        startX = x; startY = y
        out.push({ cmd: 'M', args: [x, y] })
        break
      case 'L':
        x = args[0] + ox; y = args[1] + oy
        out.push({ cmd: 'L', args: [x, y] })
        break
      case 'H':
        x = args[0] + ox
        out.push({ cmd: 'L', args: [x, y] })
        break
      case 'V':
        y = args[0] + oy
        out.push({ cmd: 'L', args: [x, y] })
        break
      case 'C': {
        const x1 = args[0] + ox, y1 = args[1] + oy
        const x2 = args[2] + ox, y2 = args[3] + oy
        x = args[4] + ox; y = args[5] + oy
        out.push({ cmd: 'C', args: [x1, y1, x2, y2, x, y] })
        break
      }
      case 'Q': {
        const x1 = args[0] + ox, y1 = args[1] + oy
        x = args[2] + ox; y = args[3] + oy
        out.push({ cmd: 'Q', args: [x1, y1, x, y] })
        break
      }
      case 'A':
        x = args[5] + ox; y = args[6] + oy
        out.push({ cmd: 'A', args: [args[0], args[1], args[2], args[3], args[4], x, y] })
        break
      case 'Z':
        x = startX; y = startY
        out.push({ cmd: 'Z', args: [] })
        break
    }
  }
  return out
}

// ── primitives → path data ──────────────────────────────────────────────────────────────────────

function rectToPathData(el: Element): string {
  const x = attrNumber(el, 'x')
  const y = attrNumber(el, 'y')
  const w = attrNumber(el, 'width')
  const h = attrNumber(el, 'height')
  if (!(w > 0) || !(h > 0)) return ''
  const hasRx = el.getAttribute('rx') !== null
  const hasRy = el.getAttribute('ry') !== null
  let rx = hasRx ? attrNumber(el, 'rx') : hasRy ? attrNumber(el, 'ry') : 0
  let ry = hasRy ? attrNumber(el, 'ry') : hasRx ? attrNumber(el, 'rx') : 0
  rx = Math.min(Math.max(rx, 0), w / 2)
  ry = Math.min(Math.max(ry, 0), h / 2)
  if (rx === 0 || ry === 0) {
    return `M${x} ${y}L${x + w} ${y}L${x + w} ${y + h}L${x} ${y + h}Z`
  }
  return (
    `M${x + rx} ${y}` +
    `L${x + w - rx} ${y}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}` +
    `L${x + w} ${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}` +
    `L${x + rx} ${y + h}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}` +
    `L${x} ${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`
  )
}

function ellipseToPathData(cx: number, cy: number, rx: number, ry: number): string {
  if (!(rx > 0) || !(ry > 0)) return ''
  return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`
}

function pointsToPathData(el: Element, close: boolean): string {
  const nums = numbersIn(el.getAttribute('points') ?? '')
  if (nums.length % 2 !== 0) {
    fail(`<${el.localName} points="${el.getAttribute('points')}"> has an odd coordinate count`)
  }
  if (nums.length < 4) return '' // fewer than two points draws nothing
  let d = `M${nums[0]} ${nums[1]}`
  for (let k = 2; k < nums.length; k += 2) d += `L${nums[k]} ${nums[k + 1]}`
  return close ? d + 'Z' : d
}

function elementToPathData(el: Element): string {
  switch (el.localName) {
    case 'path':
      return el.getAttribute('d') ?? ''
    case 'rect':
      return rectToPathData(el)
    case 'circle': {
      const r = attrNumber(el, 'r')
      return ellipseToPathData(attrNumber(el, 'cx'), attrNumber(el, 'cy'), r, r)
    }
    case 'ellipse':
      return ellipseToPathData(
        attrNumber(el, 'cx'), attrNumber(el, 'cy'), attrNumber(el, 'rx'), attrNumber(el, 'ry'),
      )
    case 'line':
      return `M${attrNumber(el, 'x1')} ${attrNumber(el, 'y1')}L${attrNumber(el, 'x2')} ${attrNumber(el, 'y2')}`
    case 'polyline':
      return pointsToPathData(el, false)
    case 'polygon':
      return pointsToPathData(el, true)
    default:
      return fail(`<${el.localName}> is not a shape this guard can compare — extend glyph-shape.ts rather than trusting it`)
  }
}

// ── transforms ──────────────────────────────────────────────────────────────────────────────────

/**
 * Only `translate` is folded, because only `translate` is exact for every command including arcs.
 * Anything else THROWS: a `<g transform="scale(…)">` around compensated coordinates is precisely
 * the re-spelling this canonicaliser exists to refuse, and refusing loudly beats certifying a
 * picture the walk has not actually resolved.
 */
function translationOf(el: Element): [number, number] {
  const raw = el.getAttribute('transform')
  if (raw === null || raw.trim() === '') return [0, 0]
  let tx = 0, ty = 0
  let seen = 0
  const fn = /([a-zA-Z]+)\s*\(([^)]*)\)/g
  let m: RegExpExecArray | null
  while ((m = fn.exec(raw)) !== null) {
    seen++
    if (m[1] !== 'translate') {
      fail(`<${el.localName} transform="${raw}"> — only translate() can be folded into geometry`)
    }
    const nums = numbersIn(m[2])
    tx += nums[0] ?? 0
    ty += nums[1] ?? 0
  }
  if (seen === 0) fail(`<${el.localName} transform="${raw}"> is not parseable`)
  return [tx, ty]
}

// ── the walk ────────────────────────────────────────────────────────────────────────────────────

interface ViewBox {
  x: number
  y: number
  w: number
  h: number
}

function subpathStrings(segs: readonly Seg[], tx: number, ty: number, vb: ViewBox): string[] {
  const fx = (v: number) => q((v + tx - vb.x) / vb.w)
  const fy = (v: number) => q((v + ty - vb.y) / vb.h)
  const out: string[] = []
  let current: string[] = []
  const flush = () => {
    if (current.length > 0) out.push(current.join(' '))
    current = []
  }
  for (const { cmd, args } of segs) {
    if (cmd === 'M') flush()
    switch (cmd) {
      case 'M':
      case 'L':
        current.push(`${cmd}${fx(args[0])},${fy(args[1])}`)
        break
      case 'C':
        current.push(`C${fx(args[0])},${fy(args[1])} ${fx(args[2])},${fy(args[3])} ${fx(args[4])},${fy(args[5])}`)
        break
      case 'Q':
        current.push(`Q${fx(args[0])},${fy(args[1])} ${fx(args[2])},${fy(args[3])}`)
        break
      case 'A': {
        const [rx, ry, rot, large, sweep, ex, ey] = args
        if (vb.w !== vb.h && rot % 180 !== 0) {
          fail('a rotated arc under a non-square viewBox cannot be canonicalised exactly')
        }
        const turn = ((rot % 360) + 360) % 360
        current.push(`A${q(rx / vb.w)},${q(ry / vb.h)} ${q(turn)} ${large} ${sweep} ${fx(ex)},${fy(ey)}`)
        break
      }
      case 'Z':
        current.push('Z')
        break
    }
  }
  flush()
  return out
}

function collect(el: Element, tx: number, ty: number, vb: ViewBox, into: string[]): void {
  for (const child of Array.from(el.children)) {
    const tag = child.localName
    if (NON_DRAWING.has(tag)) continue
    const [dx, dy] = translationOf(child)
    if (CONTAINERS.has(tag)) {
      collect(child, tx + dx, ty + dy, vb, into)
      continue
    }
    const d = elementToPathData(child)
    if (d.trim() === '') continue
    into.push(...subpathStrings(absolutise(parsePathData(d)), tx + dx, ty + dy, vb))
  }
}

/**
 * The canonical geometric signature of one `<svg>`: every subpath it draws, in viewBox fractions,
 * sorted. Equal signatures ⇒ the same picture. Throws rather than guessing (see the file docblock).
 */
export function glyphShape(svg: Element): string {
  if (svg.localName !== 'svg') fail(`expected an <svg>, got <${svg.localName}>`)
  const vbNums = numbersIn(svg.getAttribute('viewBox') ?? '')
  const vb: ViewBox =
    vbNums.length === 4
      ? { x: vbNums[0], y: vbNums[1], w: vbNums[2], h: vbNums[3] }
      : { x: 0, y: 0, w: attrNumber(svg, 'width'), h: attrNumber(svg, 'height') }
  if (!(vb.w > 0) || !(vb.h > 0)) fail('<svg> declares neither a usable viewBox nor a usable width/height')
  const [tx, ty] = translationOf(svg)
  const shapes: string[] = []
  collect(svg, tx, ty, vb, shapes)
  return shapes.sort().join(' | ')
}
