import type { Page } from '@playwright/test'

export type Rgb = readonly [number, number, number]

export const INTERACTION_STATES = ['default', 'hover', 'focus', 'selected', 'open', 'destructive', 'disabled', 'error'] as const
export type InteractionState = (typeof INTERACTION_STATES)[number]

export type ContrastMeasureKind = 'text' | 'boundary'

/** WCAG text uses AA; the 3:1 allowance belongs to large text and non-text indicators. */
export function contrastThreshold(kind: ContrastMeasureKind, largeText = false): number {
  return kind === 'boundary' || largeText ? 3 : 4.5
}

export function interactionStateSelector(state: Exclude<InteractionState, 'default' | 'hover' | 'focus'>): string {
  const selectors: Record<Exclude<InteractionState, 'default' | 'hover' | 'focus'>, string> = {
    selected: '[data-state="selected"], [data-status="selected"], [data-variant="selected"], [aria-selected="true"], [aria-current="true"]',
    open: '[data-state="open"], [data-status="open"], [data-variant="open"], [aria-expanded="true"]',
    destructive: '[data-state="destructive"], [data-status="destructive"], [data-variant="destructive"], [data-tone="destructive"], .btn-destructive',
    disabled: '[data-state="disabled"], [data-status="disabled"], [data-variant="disabled"], [disabled], [aria-disabled="true"]',
    error: '[data-state="error"], [data-status="error"], [data-variant="error"], [aria-invalid="true"], [role="alert"]',
  }
  return selectors[state]
}

export type MutationFixture =
  | { ruleId: 'contrast.body'; foreground: Rgb; background: Rgb }
  | { ruleId: 'touch.phone-target'; width: number; height: number }
  | { ruleId: 'geometry.horizontal-fit'; scrollWidth: number; clientWidth: number }
  | { ruleId: 'actions.primary'; primaryActionCount: number }
  | { ruleId: 'structure.nested-cards'; nestedCardCount: number }
  | { ruleId: 'structure.heading-outline'; headingLevels: number[] }
  | { ruleId: 'a11y.accessible-name'; accessibleName: string }

export type MutationEvaluation = { ruleId: string; passed: boolean; detail: string }

/** Deliberate red fixtures used by the harness self-test. Values are data, not product markup. */
export const MUTATION_FIXTURES: MutationFixture[] = [
  { ruleId: 'contrast.body', foreground: [119, 119, 119], background: [255, 255, 255] },
  { ruleId: 'touch.phone-target', width: 36, height: 36 },
  { ruleId: 'geometry.horizontal-fit', scrollWidth: 401, clientWidth: 390 },
  { ruleId: 'actions.primary', primaryActionCount: 2 },
  { ruleId: 'structure.nested-cards', nestedCardCount: 1 },
  { ruleId: 'structure.heading-outline', headingLevels: [1, 3] },
  { ruleId: 'a11y.accessible-name', accessibleName: '' },
]

function channel(value: number): number {
  const normalized = value / 255
  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(rgb: Rgb): number {
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2])
}

export function contrastRatio(foreground: Rgb, background: Rgb): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background))
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background))
  return (lighter + 0.05) / (darker + 0.05)
}

export function parseCssColor(value: string): Rgb | null {
  const rgb = value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i)
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]

  const wide = value.match(/color\(\s*(srgb|display-p3)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i)
  if (!wide) return null
  const encoded = [Number(wide[2]), Number(wide[3]), Number(wide[4])] as [number, number, number]
  if (wide[1]?.toLowerCase() === 'srgb') return encoded.map((channel) => channel * 255) as [number, number, number]

  const decode = (channel: number) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  const encode = (channel: number) => channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055
  const [red, green, blue] = encoded.map(decode)
  const x = 0.4865709486482162 * red + 0.26566769316909306 * green + 0.1982172852343625 * blue
  const y = 0.2289745640697488 * red + 0.6917385218365064 * green + 0.079286914093745 * blue
  const z = 0.04511338185890264 * green + 1.043944368900976 * blue
  const linear = [
    3.2409699419045226 * x - 1.537383177570094 * y - 0.4986107602930034 * z,
    -0.9692436362808796 * x + 1.8759675015077202 * y + 0.04155505740717559 * z,
    0.05563007969699366 * x - 0.20397695888897652 * y + 1.0569715142428786 * z,
  ]
  return linear.map((channel) => Math.max(0, Math.min(1, encode(channel))) * 255) as [number, number, number]
}

export function evaluateMutationFixture(fixture: MutationFixture): MutationEvaluation {
  switch (fixture.ruleId) {
    case 'contrast.body': {
      const ratio = contrastRatio(fixture.foreground, fixture.background)
      return { ruleId: fixture.ruleId, passed: ratio >= 4.5, detail: `ratio=${ratio.toFixed(2)}` }
    }
    case 'touch.phone-target': {
      const passed = fixture.width >= 44 && fixture.height >= 44
      return { ruleId: fixture.ruleId, passed, detail: `${fixture.width}x${fixture.height}px` }
    }
    case 'geometry.horizontal-fit': {
      const passed = fixture.scrollWidth <= fixture.clientWidth + 1
      return { ruleId: fixture.ruleId, passed, detail: `${fixture.scrollWidth}-${fixture.clientWidth}px` }
    }
    case 'actions.primary': {
      const passed = fixture.primaryActionCount <= 1
      return { ruleId: fixture.ruleId, passed, detail: `primary-actions=${fixture.primaryActionCount}` }
    }
    case 'structure.nested-cards': {
      const passed = fixture.nestedCardCount === 0
      return { ruleId: fixture.ruleId, passed, detail: `nested-cards=${fixture.nestedCardCount}` }
    }
    case 'structure.heading-outline': {
      const h1Count = fixture.headingLevels.filter((level) => level === 1).length
      const skipped = fixture.headingLevels.some((level, index) => index > 0 && level > fixture.headingLevels[index - 1]! + 1)
      const passed = h1Count === 1 && !skipped
      return { ruleId: fixture.ruleId, passed, detail: `levels=${fixture.headingLevels.join(',')}` }
    }
    case 'a11y.accessible-name': {
      const passed = fixture.accessibleName.trim().length > 0
      return { ruleId: fixture.ruleId, passed, detail: `name=${fixture.accessibleName || '<empty>'}` }
    }
  }
}

export type PageAuditContext = {
  route: string
  journey: string
  fixture: string
  viewport: string
  theme: string
  language: string
  state: string
}

export type GeometryRow = PageAuditContext & {
  selector: string
  x: number
  y: number
  right: number
  bottom: number
  width: number
  height: number
  scrollWidth: number
  clientWidth: number
  scrollHeight: number
  clientHeight: number
  overflowX: number
  overflowY: number
}

export type ControlRow = PageAuditContext & {
  selector: string
  elementPath: string
  x: number
  y: number
  right: number
  bottom: number
  role: string
  accessibleName: string
  width: number
  height: number
  disabled: boolean
  primary: boolean
}

export type HeadingRow = PageAuditContext & { level: number; text: string }

export type FocusRow = PageAuditContext & {
  selector: string
  role: string
  name: string
  tabIndex: number
  outlineWidth: number
  outlineStyle: string
  outlineOffset: string
  outlineColor: string
  boxShadow: string
  hasIndicator: boolean
}

export type FocusTraversal = {
  rows: FocusRow[]
  expectedStops: number
  cycleDetected: boolean
}

export type TypographyRow = PageAuditContext & {
  selector: string
  role: 'body' | 'page-title' | 'heading' | 'label' | 'functional' | 'prose'
  text: string
  visualText: boolean
  fontFamily: string
  fontSize: number
  lineHeight: number
  leading: number
  letterSpacing: number
  tracking: number
  readingMeasure: number | null
}

export type TouchSeparationRow = PageAuditContext & {
  groupSelector: string
  authority: string
  first: string
  second: string
  gap: number
  axis: 'horizontal' | 'vertical' | 'overlap'
  observed: boolean
  passes: boolean
}

export type RegionCensusRow = PageAuditContext & {
  ruleId: 'actions.primary' | 'cognitive.decision-load'
  regionSelector: string
  authority: string
  count: number
  observed: boolean
  passes: boolean
}

export type CardNestingRow = PageAuditContext & {
  selector: string
  ancestor: string
  nested: boolean
}

type NamedSelector = { selector: string; authority: string }

const FOCUSABLE_SELECTOR = 'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/** Collect stable geometry from real rendered elements. The page is never mutated. */
export async function collectGeometry(
  page: Page,
  context: PageAuditContext,
  selectors = ['body', 'main', '[role="dialog"]', '[role="listbox"]', '[role="menu"]'],
): Promise<GeometryRow[]> {
  return page.evaluate(({ context: pageContext, selectors: selectorList }) => selectorList.flatMap((selector) => {
    return Array.from(document.querySelectorAll<HTMLElement>(selector)).map((element) => {
      const rect = element.getBoundingClientRect()
      return {
        ...pageContext,
        selector,
        x: rect.x,
        y: rect.y,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
        overflowX: Math.max(0, element.scrollWidth - element.clientWidth),
        overflowY: Math.max(0, element.scrollHeight - element.clientHeight),
      }
    })
  }), { context, selectors })
}

/** Enumerate actionable controls and their rendered target boxes for the control census. */
export async function collectControls(page: Page, context: PageAuditContext): Promise<ControlRow[]> {
  return page.evaluate((pageContext) => {
    const selector = 'button, a[href], input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="tab"]'
    const elementPath = (element: HTMLElement): string => {
      const segments: string[] = []
      let current: HTMLElement | null = element
      while (current && current !== document.body) {
        let ordinal = 1
        let sibling = current.previousElementSibling
        while (sibling) {
          if (sibling.tagName === current.tagName) ordinal += 1
          sibling = sibling.previousElementSibling
        }
        segments.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${ordinal})`)
        current = current.parentElement
      }
      return ['body', ...segments].join(' > ')
    }
    return Array.from(document.querySelectorAll<HTMLElement>(selector)).flatMap((element) => {
      const ownRect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      const clipped = style.clipPath !== 'none' || style.clip !== 'auto'
      if (style.display === 'none' || style.visibility === 'hidden' || clipped || ownRect.width <= 2 || ownRect.height <= 2) return []
      const labelledTarget = element.matches('input[type="checkbox"], input[type="radio"]')
        ? element.closest<HTMLElement>('label')
          || (element.id ? document.querySelector<HTMLElement>(`label[for="${CSS.escape(element.id)}"]`) : null)
        : null
      const targetRect = labelledTarget?.getBoundingClientRect()
      const rect = targetRect && targetRect.width > 0 && targetRect.height > 0 ? targetRect : ownRect
      const role = element.getAttribute('role') || element.tagName.toLowerCase()
      const labelledBy = element.getAttribute('aria-labelledby')
      const labelledText = labelledBy
        ? labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim() || '').join(' ').trim()
        : ''
      const accessibleName = element.getAttribute('aria-label') || labelledText || element.getAttribute('title') || element.textContent?.trim() || ''
      const primary = element.matches('[data-variant="primary"], .button-primary, .btn-primary')
      return [{
        ...pageContext,
        selector,
        elementPath: elementPath(element),
        x: rect.x,
        y: rect.y,
        right: rect.right,
        bottom: rect.bottom,
        role,
        accessibleName,
        width: rect.width,
        height: rect.height,
        disabled: (element as HTMLButtonElement).disabled || element.getAttribute('aria-disabled') === 'true',
        primary,
      }]
    })
  }, context)
}

export async function collectHeadings(page: Page, context: PageAuditContext): Promise<HeadingRow[]> {
  return page.evaluate((pageContext) => Array.from(document.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')).map((element) => ({
    ...pageContext,
    level: Number(element.tagName.slice(1)),
    text: element.textContent?.trim() || '',
  })), context)
}

export async function collectFocusStops(page: Page, context: PageAuditContext) {
  return page.evaluate((pageContext) => {
    const selector = 'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    return Array.from(document.querySelectorAll<HTMLElement>(selector)).flatMap((element) => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) return []
      const outlineWidth = Number.parseFloat(style.outlineWidth) || 0
      const labelledBy = element.getAttribute('aria-labelledby')
      const labelledText = labelledBy
        ? labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim() || '').join(' ').trim()
        : ''
      return [{
        ...pageContext,
        role: element.getAttribute('role') || element.tagName.toLowerCase(),
        name: element.getAttribute('aria-label') || labelledText || element.getAttribute('title') || element.textContent?.trim() || '',
        tabIndex: element.tabIndex,
        outlineWidth,
        outlineStyle: style.outlineStyle,
        outlineOffset: style.outlineOffset,
        outlineColor: style.outlineColor,
        boxShadow: style.boxShadow,
      }]
    })
  }, context)
}

/** Walk the real keyboard order and record the indicator on every reachable stop. */
export async function collectFocusTraversal(page: Page, context: PageAuditContext): Promise<FocusTraversal> {
  const stopCounts = await page.locator(FOCUSABLE_SELECTOR).evaluateAll((elements) => {
    const measurable = (element: HTMLElement): boolean => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      const clipped = style.clipPath !== 'none' || style.clip !== 'auto'
      const nativeDisabled = element.matches('button:disabled, input:disabled, select:disabled, textarea:disabled')
      return style.display !== 'none' && style.visibility !== 'hidden' && !clipped
        && !nativeDisabled && element.tabIndex >= 0 && rect.width > 2 && rect.height > 2
    }
    return {
      expected: elements.filter((node) => measurable(node as HTMLElement)).length,
      total: elements.length,
    }
  })
  const expectedStops = stopCounts.expected
  if (expectedStops === 0) return { rows: [], expectedStops, cycleDetected: false }

  await page.evaluate(() => {
    const active = document.activeElement
    if (active instanceof HTMLElement) active.blur()
  })

  const rows: FocusRow[] = []
  const seen = new Set<string>()
  let cycleDetected = false
  for (let order = 0; order < stopCounts.total + 1; order += 1) {
    await page.keyboard.press('Tab')
    const focused = await page.evaluate(() => {
      const element = document.activeElement
      if (!(element instanceof HTMLElement) || element === document.body) return null
      const segments: string[] = []
      let current: HTMLElement | null = element
      while (current && current !== document.body) {
        let ordinal = 1
        let sibling = current.previousElementSibling
        while (sibling) {
          if (sibling.tagName === current.tagName) ordinal += 1
          sibling = sibling.previousElementSibling
        }
        segments.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${ordinal})`)
        current = current.parentElement
      }
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      const measurable = style.display !== 'none' && style.visibility !== 'hidden'
        && style.clipPath === 'none' && style.clip === 'auto' && rect.width > 2 && rect.height > 2
      const indicatorStyles = [element, element.parentElement, element.parentElement?.parentElement]
        .filter((candidate): candidate is HTMLElement => candidate instanceof HTMLElement)
        .map((candidate) => getComputedStyle(candidate))
      const labelledBy = element.getAttribute('aria-labelledby')
      const labelledText = labelledBy
        ? labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim() || '').join(' ').trim()
        : ''
      const selector = ['body', ...segments].join(' > ')
      return {
        selector,
        role: element.getAttribute('role') || element.tagName.toLowerCase(),
        name: element.getAttribute('aria-label') || labelledText || element.getAttribute('title') || element.textContent?.trim() || '',
        tabIndex: element.tabIndex,
        outlineWidth: Number.parseFloat(style.outlineWidth) || 0,
        outlineStyle: style.outlineStyle,
        outlineOffset: style.outlineOffset,
        outlineColor: style.outlineColor,
        boxShadow: style.boxShadow,
        measurable,
        hasIndicator: indicatorStyles.some((candidate) =>
          (Number.parseFloat(candidate.outlineWidth) || 0) >= 2
          || (candidate.boxShadow !== 'none' && candidate.boxShadow.trim() !== '')),
      }
    })
    if (!focused) break
    if (!focused.measurable) continue
    if (seen.has(focused.selector)) {
      cycleDetected = rows.length < expectedStops
      break
    }
    seen.add(focused.selector)
    rows.push({ ...context, ...focused })
  }
  return { rows, expectedStops, cycleDetected }
}

/** Collect the type values that are enforceable from the rendered CSS, by design role. */
export async function collectTypography(page: Page, context: PageAuditContext): Promise<TypographyRow[]> {
  return page.evaluate((pageContext) => {
    const roleSelectors: Array<[TypographyRow['role'], string]> = [
      ['body', 'body'],
      ['page-title', 'h1'],
      ['heading', 'h2, h3, h4, h5, h6'],
      ['label', 'label, legend, dt, th'],
      ['functional', 'button, a[href], input, select, textarea, [role="button"], [role="link"], [role="tab"]'],
      ['prose', '[data-prose], [class~="prose"]'],
    ]
    const rows: TypographyRow[] = []
    const seen = new Set<HTMLElement>()
    const cssPath = (element: HTMLElement): string => {
      const segments: string[] = []
      let current: HTMLElement | null = element
      while (current && current !== document.body) {
        let ordinal = 1
        let sibling = current.previousElementSibling
        while (sibling) {
          if (sibling.tagName === current.tagName) ordinal += 1
          sibling = sibling.previousElementSibling
        }
        segments.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${ordinal})`)
        current = current.parentElement
      }
      return ['body', ...segments].join(' > ')
    }
    const parsePixels = (value: string, fallback: number): number => {
      const parsed = Number.parseFloat(value)
      return Number.isFinite(parsed) ? parsed : fallback
    }
    for (const [role, selector] of roleSelectors) {
      for (const element of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
        if (seen.has(element)) continue
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) continue
        seen.add(element)
        const fontSize = parsePixels(style.fontSize, 0)
        const lineHeight = parsePixels(style.lineHeight, fontSize * 1.2)
        const letterSpacing = style.letterSpacing === 'normal' ? 0 : parsePixels(style.letterSpacing, 0)
        const canvas = document.createElement('canvas')
        const context2d = canvas.getContext('2d')
        if (context2d) context2d.font = style.font
        const zeroWidth = context2d?.measureText('0').width || fontSize * 0.5
        const visibleText = element.innerText?.trim() || ''
        rows.push({
          ...pageContext,
          selector: cssPath(element),
          role,
          text: visibleText || element.getAttribute('aria-label') || '',
          visualText: /[\p{L}\p{N}]/u.test(visibleText),
          fontFamily: style.fontFamily,
          fontSize,
          lineHeight,
          leading: fontSize > 0 ? lineHeight / fontSize : 0,
          letterSpacing,
          tracking: fontSize > 0 ? letterSpacing / fontSize : 0,
          readingMeasure: role === 'prose' && zeroWidth > 0 ? rect.width / zeroWidth : null,
        })
      }
    }
    return rows
  }, context)
}

/** Measure the minimum gap between adjacent action targets within named manifest groups. */
export async function collectTouchSeparation(
  page: Page,
  context: PageAuditContext,
  groups: readonly NamedSelector[],
): Promise<TouchSeparationRow[]> {
  return page.evaluate(({ context: pageContext, namedGroups }) => {
    const actionable = 'button, a[href], input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="tab"]'
    const rows: TouchSeparationRow[] = []
    const cssPath = (element: HTMLElement): string => {
      const segments: string[] = []
      let current: HTMLElement | null = element
      while (current && current !== document.body) {
        let ordinal = 1
        let sibling = current.previousElementSibling
        while (sibling) {
          if (sibling.tagName === current.tagName) ordinal += 1
          sibling = sibling.previousElementSibling
        }
        segments.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${ordinal})`)
        current = current.parentElement
      }
      return ['body', ...segments].join(' > ')
    }
    for (const group of namedGroups) {
      let root: Element | null = null
      try { root = document.querySelector(group.selector) } catch { root = null }
      const elements = root
        ? Array.from(root.querySelectorAll<HTMLElement>(actionable)).filter((element) => {
          const style = getComputedStyle(element)
          const rect = element.getBoundingClientRect()
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
        })
        : []
      if (elements.length < 2) {
        rows.push({ ...pageContext, groupSelector: group.selector, authority: group.authority, first: '', second: '', gap: 0, axis: 'overlap', observed: false, passes: false })
        continue
      }
      for (let firstIndex = 0; firstIndex < elements.length; firstIndex += 1) {
        for (let secondIndex = firstIndex + 1; secondIndex < elements.length; secondIndex += 1) {
          const firstElement = elements[firstIndex]!
          const secondElement = elements[secondIndex]!
          const firstRect = firstElement.getBoundingClientRect()
          const secondRect = secondElement.getBoundingClientRect()
          const horizontalOverlap = Math.min(firstRect.right, secondRect.right) - Math.max(firstRect.left, secondRect.left)
          const verticalOverlap = Math.min(firstRect.bottom, secondRect.bottom) - Math.max(firstRect.top, secondRect.top)
          let axis: TouchSeparationRow['axis'] = 'overlap'
          let gap = 0
          if (horizontalOverlap > 0 && verticalOverlap <= 0) {
            axis = 'vertical'
            gap = Math.max(0, Math.max(firstRect.top, secondRect.top) - Math.min(firstRect.bottom, secondRect.bottom))
          } else if (verticalOverlap > 0 && horizontalOverlap <= 0) {
            axis = 'horizontal'
            gap = Math.max(0, Math.max(firstRect.left, secondRect.left) - Math.min(firstRect.right, secondRect.right))
          }
          rows.push({
            ...pageContext,
            groupSelector: group.selector,
            authority: group.authority,
            first: cssPath(firstElement),
            second: cssPath(secondElement),
            gap,
            axis,
            observed: true,
            passes: gap >= 8,
          })
        }
      }
    }
    return rows
  }, { context, namedGroups: groups })
}

/** Count primary actions in the manifest's named regions, failing closed for a missing region. */
export async function collectPrimaryActionRegions(
  page: Page,
  context: PageAuditContext,
  regions: readonly NamedSelector[],
): Promise<RegionCensusRow[]> {
  return page.evaluate(({ context: pageContext, namedRegions }) => {
    const controlSelector = 'button, a[href], [role="button"], [role="link"]'
    const rows: RegionCensusRow[] = []
    for (const region of namedRegions) {
      let root: Element | null = null
      try { root = document.querySelector(region.selector) } catch { root = null }
      const controls = root ? Array.from(root.querySelectorAll<HTMLElement>(controlSelector)).filter((element) => {
        const style = getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
      }) : []
      const count = controls.filter((element) => element.matches('[data-variant="primary"], .button-primary, .btn-primary')).length
      rows.push({ ...pageContext, ruleId: 'actions.primary', regionSelector: region.selector, authority: region.authority, count, observed: root !== null, passes: root !== null && count <= 1 })
    }
    return rows
  }, { context, namedRegions: regions })
}

/** Return semantic card containers and whether each one is nested in another card container. */
export async function collectCardNesting(page: Page, context: PageAuditContext): Promise<CardNestingRow[]> {
  return page.evaluate((pageContext) => {
    const isCard = (element: Element): boolean => {
      if (!(element instanceof HTMLElement)) return false
      if (element.hasAttribute('data-card')) return true
      const namedLikeCard = Array.from(element.classList).some((token) => token === 'card' || token.endsWith('-card') || token.endsWith('_card'))
      if (!namedLikeCard) return false
      const style = getComputedStyle(element)
      const hasVisibleBackground = style.backgroundColor !== 'transparent' && !/[,/]\s*0\s*\)$/.test(style.backgroundColor)
      return hasVisibleBackground
        || style.borderTopStyle !== 'none' || style.borderRightStyle !== 'none'
        || style.borderBottomStyle !== 'none' || style.borderLeftStyle !== 'none'
        || style.boxShadow !== 'none'
    }
    const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-card], [class]')).filter(isCard)
    return cards.map((element) => {
      const ancestor = element.parentElement?.closest('[data-card], [class]')
      const cardAncestor = ancestor && isCard(ancestor) ? ancestor : null
      return {
        ...pageContext,
        selector: element.className || element.tagName.toLowerCase(),
        ancestor: cardAncestor?.className || '',
        nested: cardAncestor !== null,
      }
    })
  }, context)
}

export type ContrastRow = PageAuditContext & {
  selector: string
  state: string
  kind: ContrastMeasureKind
  threshold: number
  foreground: string
  background: string
  ratio: number | null
  largeText: boolean
  observed: boolean
  passes: boolean
}

export type ContrastCollectionOptions = {
  measure?: ContrastMeasureKind | 'both'
  allowForegroundBoundary?: boolean
}

/** Measure text and control contrast using the browser's resolved colors. */
export async function collectContrast(
  page: Page,
  context: PageAuditContext,
  state: string,
  selector = 'body, main, h1, h2, h3, p, label, button, a[href], [role="button"]',
  options: ContrastCollectionOptions = {},
): Promise<ContrastRow[]> {
  return page.evaluate(({ context: pageContext, state: contrastState, selector: selectorText, options: collectionOptions }) => {
    type CssColor = { rgb: [number, number, number]; alpha: number }
    const parse = (value: string): CssColor | null => {
      const rgb = value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/i)
      if (rgb) {
        const alphaText = rgb[4]
        const alpha = alphaText ? (alphaText.endsWith('%') ? Number.parseFloat(alphaText) / 100 : Number(alphaText)) : 1
        return { rgb: [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])], alpha: Math.max(0, Math.min(1, alpha)) }
      }
      const wide = value.match(/color\(\s*(srgb|display-p3)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)/i)
      if (!wide) return null
      const alphaText = wide[5]
      const alpha = alphaText ? (alphaText.endsWith('%') ? Number.parseFloat(alphaText) / 100 : Number(alphaText)) : 1
      const encoded = [Number(wide[2]), Number(wide[3]), Number(wide[4])] as [number, number, number]
      if (wide[1]?.toLowerCase() === 'srgb') {
        return { rgb: encoded.map((channel) => channel * 255) as [number, number, number], alpha: Math.max(0, Math.min(1, alpha)) }
      }
      const decode = (channel: number) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
      const encode = (channel: number) => channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055
      const [red, green, blue] = encoded.map(decode)
      const x = 0.4865709486482162 * red + 0.26566769316909306 * green + 0.1982172852343625 * blue
      const y = 0.2289745640697488 * red + 0.6917385218365064 * green + 0.079286914093745 * blue
      const z = 0.04511338185890264 * green + 1.043944368900976 * blue
      const linear = [
        3.2409699419045226 * x - 1.537383177570094 * y - 0.4986107602930034 * z,
        -0.9692436362808796 * x + 1.8759675015077202 * y + 0.04155505740717559 * z,
        0.05563007969699366 * x - 0.20397695888897652 * y + 1.0569715142428786 * z,
      ]
      return {
        rgb: linear.map((channel) => Math.max(0, Math.min(1, encode(channel))) * 255) as [number, number, number],
        alpha: Math.max(0, Math.min(1, alpha)),
      }
    }
    const blend = (foreground: CssColor, background: [number, number, number]): [number, number, number] => [
      foreground.rgb[0] * foreground.alpha + background[0] * (1 - foreground.alpha),
      foreground.rgb[1] * foreground.alpha + background[1] * (1 - foreground.alpha),
      foreground.rgb[2] * foreground.alpha + background[2] * (1 - foreground.alpha),
    ]
    const luminance = (rgb: [number, number, number]): number => rgb.reduce((total, value, index) => {
      const channel = value / 255
      const linear = channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
      return total + linear * [0.2126, 0.7152, 0.0722][index]!
    }, 0)
    const ratio = (foreground: [number, number, number], background: [number, number, number]): number => {
      const fg = luminance(foreground)
      const bg = luminance(background)
      return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05)
    }
    const backgroundFor = (element: HTMLElement): [number, number, number] => {
      const ancestors: HTMLElement[] = []
      let current: HTMLElement | null = element
      while (current) {
        ancestors.push(current)
        current = current.parentElement
      }
      let background: [number, number, number] = [255, 255, 255]
      for (const ancestor of ancestors.reverse()) {
        const color = parse(getComputedStyle(ancestor).backgroundColor)
        if (color && color.alpha > 0) background = blend(color, background)
      }
      return background
    }
    const cssColorMatches = (value: string): CssColor[] => {
      const matches = value.matchAll(/rgba?\(\s*[\d.]+[\s,]+[\d.]+[\s,]+[\d.]+(?:[\s,/]+[\d.]+%?)?\s*\)|color\(\s*(?:srgb|display-p3)\s+[\d.]+\s+[\d.]+\s+[\d.]+(?:\s*\/\s*[\d.]+%?)?\s*\)/gi)
      return [...matches].map((match) => parse(match[0])).filter((color): color is CssColor => color !== null)
    }
    const emptyRow = (kind: 'text' | 'boundary'): ContrastRow => ({
      ...pageContext,
      selector: selectorText,
      state: contrastState,
      kind,
      threshold: kind === 'boundary' ? 3 : 4.5,
      foreground: '',
      background: '',
      ratio: null,
      largeText: false,
      observed: false,
      passes: false,
    })
    const elements = Array.from(document.querySelectorAll<HTMLElement>(selectorText)).filter((element) => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
    })
    if (elements.length === 0) {
      const measure = collectionOptions.measure || 'text'
      return measure === 'both' ? [emptyRow('text'), emptyRow('boundary')] : [emptyRow(measure)]
    }
    const rows: ContrastRow[] = []
    for (const element of elements) {
      const style = getComputedStyle(element)
      const foreground = parse(style.color)
      const background = backgroundFor(element)
      const fontSize = Number.parseFloat(style.fontSize) || 0
      const weight = Number.parseInt(style.fontWeight, 10) || 400
      const largeText = fontSize >= 24 || (fontSize >= 18.67 && weight >= 700)
      const text = element.textContent?.trim() || (element as HTMLInputElement).value?.trim() || (element as HTMLInputElement).placeholder?.trim() || ''
      const measure = collectionOptions.measure || 'text'
      if ((measure === 'text' || measure === 'both') && text.length > 0) {
        if (!foreground) {
          rows.push({ ...emptyRow('text'), foreground: style.color, background: 'unparsed' })
        } else {
          const foregroundRgb = foreground.alpha < 1 ? blend(foreground, background) : foreground.rgb
          const measuredRatio = ratio(foregroundRgb, background)
          const threshold = largeText ? 3 : 4.5
          rows.push({
            ...pageContext,
            selector: selectorText,
            state: contrastState,
            kind: 'text',
            threshold,
            foreground: `rgb(${foregroundRgb.map((value) => Math.round(value)).join(',')})`,
            background: `rgb(${background.join(',')})`,
            ratio: measuredRatio,
            largeText,
            observed: true,
            passes: measuredRatio >= threshold,
          })
        }
      }

      if (measure === 'boundary' || measure === 'both') {
        const boundaries: Array<{ source: string; color: CssColor }> = []
        const outlineWidth = Number.parseFloat(style.outlineWidth) || 0
        if (outlineWidth > 0 && style.outlineStyle !== 'none') {
          const outlineColor = parse(style.outlineColor)
          if (outlineColor) boundaries.push({ source: 'outline', color: outlineColor })
        }
        for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
          const width = Number.parseFloat(style[`border${side}Width`]) || 0
          if (width > 0 && style[`border${side}Style`] !== 'none') {
            const borderColor = parse(style[`border${side}Color`])
            if (borderColor) boundaries.push({ source: `border-${side.toLowerCase()}`, color: borderColor })
          }
        }
        if (contrastState === 'focus' && style.boxShadow !== 'none') {
          const shadowColor = cssColorMatches(style.boxShadow)[0]
          if (shadowColor) boundaries.push({ source: 'box-shadow', color: shadowColor })
        }
        const graphicFallback = collectionOptions.allowForegroundBoundary
          && foreground
          && (element.matches('svg, svg *, img, [role="img"], [data-meaningful-graphic]'))
        if (boundaries.length === 0 && graphicFallback && foreground) boundaries.push({ source: 'foreground', color: foreground })
        if (boundaries.length === 0) {
          rows.push(emptyRow('boundary'))
        } else {
          const measuredBoundaries = boundaries.map(({ source, color }) => {
            const foregroundRgb = color.alpha < 1 ? blend(color, background) : color.rgb
            return { source, foregroundRgb, ratio: ratio(foregroundRgb, background) }
          })
          const weakest = measuredBoundaries.reduce((minimum, current) => current.ratio < minimum.ratio ? current : minimum)
          rows.push({
            ...pageContext,
            selector: `${selectorText} (${weakest.source})`,
            state: contrastState,
            kind: 'boundary',
            threshold: contrastThreshold('boundary'),
            foreground: `rgb(${weakest.foregroundRgb.map((value) => Math.round(value)).join(',')})`,
            background: `rgb(${background.join(',')})`,
            ratio: weakest.ratio,
            largeText: false,
            observed: true,
            passes: weakest.ratio >= contrastThreshold('boundary'),
          })
        }
      }
    }
    if (rows.length === 0) {
      const measure = collectionOptions.measure || 'text'
      return measure === 'both' ? [emptyRow('text'), emptyRow('boundary')] : [emptyRow(measure)]
    }
    return rows
  }, { context, state, selector, options })
}
