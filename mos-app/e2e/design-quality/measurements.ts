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
  | { ruleId: 'content.text-truncation'; truncated: boolean; fullValuePathExercised: boolean }
  | { ruleId: 'geometry.viewport-occlusion'; intersectionRatio: number; centerCovered: boolean; fullyReachable: boolean }
  | { ruleId: 'touch.phone-separation'; width: number; height: number; nearestDistance: number }
  | { ruleId: 'identity.full-value'; truncated: boolean; ariaLabel: string; visibleReveal: string }
  | { ruleId: 'controls.native-select'; nativeSelectCount: number; exceptionAuthority: string }
  | { ruleId: 'controls.bounded-choice-lifecycle'; opened: boolean; arrowKey: boolean; typeahead: boolean; enter: boolean; escapeDismissed: boolean; outsideDismissed: boolean; focusReturned: boolean }
  | { ruleId: 'controls.popup-containment'; x: number; y: number; right: number; bottom: number; viewportWidth: number; viewportHeight: number; activeReachable: boolean }
  | { ruleId: 'controls.bounded-choice-contrast'; foreground: Rgb; background: Rgb; threshold: number }
  | { ruleId: 'controls.variant-classification'; variant: string; size: string; state: string }
  | { ruleId: 'controls.variant-consistency'; spreadPx: number; colorsIdentical: boolean }

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
  { ruleId: 'content.text-truncation', truncated: true, fullValuePathExercised: false },
  { ruleId: 'geometry.viewport-occlusion', intersectionRatio: 0.2, centerCovered: true, fullyReachable: false },
  { ruleId: 'touch.phone-separation', width: 44, height: 44, nearestDistance: 4 },
  { ruleId: 'identity.full-value', truncated: true, ariaLabel: 'Complete value', visibleReveal: '' },
  { ruleId: 'controls.native-select', nativeSelectCount: 1, exceptionAuthority: '' },
  { ruleId: 'controls.bounded-choice-lifecycle', opened: true, arrowKey: true, typeahead: true, enter: true, escapeDismissed: true, outsideDismissed: true, focusReturned: false },
  { ruleId: 'controls.popup-containment', x: -1, y: 0, right: 400, bottom: 844, viewportWidth: 390, viewportHeight: 844, activeReachable: false },
  { ruleId: 'controls.bounded-choice-contrast', foreground: [170, 170, 170], background: [255, 255, 255], threshold: 4.5 },
  { ruleId: 'controls.variant-classification', variant: '', size: '', state: '' },
  { ruleId: 'controls.variant-consistency', spreadPx: 2, colorsIdentical: true },
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
    case 'content.text-truncation': {
      const passed = !fixture.truncated || fixture.fullValuePathExercised
      return { ruleId: fixture.ruleId, passed, detail: `truncated=${fixture.truncated}; reveal=${fixture.fullValuePathExercised}` }
    }
    case 'geometry.viewport-occlusion': {
      const passed = fixture.intersectionRatio <= 0.1 && !fixture.centerCovered && fixture.fullyReachable
      return { ruleId: fixture.ruleId, passed, detail: `intersection=${fixture.intersectionRatio}; center=${fixture.centerCovered}; reachable=${fixture.fullyReachable}` }
    }
    case 'touch.phone-separation': {
      const passed = fixture.width >= 44 && fixture.height >= 44 && fixture.nearestDistance >= 8
      return { ruleId: fixture.ruleId, passed, detail: `${fixture.width}x${fixture.height}px; gap=${fixture.nearestDistance}px` }
    }
    case 'identity.full-value': {
      const passed = !fixture.truncated || fixture.visibleReveal.trim().length > 0
      return { ruleId: fixture.ruleId, passed, detail: `aria=${fixture.ariaLabel || '<empty>'}; visible=${fixture.visibleReveal || '<empty>'}` }
    }
    case 'controls.native-select': {
      const passed = fixture.nativeSelectCount === 0 || fixture.exceptionAuthority.trim().length > 0
      return { ruleId: fixture.ruleId, passed, detail: `native-selects=${fixture.nativeSelectCount}; authority=${fixture.exceptionAuthority || '<none>'}` }
    }
    case 'controls.bounded-choice-lifecycle': {
      const passed = fixture.opened && fixture.arrowKey && fixture.typeahead && fixture.enter
        && fixture.escapeDismissed && fixture.outsideDismissed && fixture.focusReturned
      return { ruleId: fixture.ruleId, passed, detail: `opened=${fixture.opened}; focus-returned=${fixture.focusReturned}` }
    }
    case 'controls.popup-containment': {
      const contained = fixture.x >= 0 && fixture.y >= 0
        && fixture.right <= fixture.viewportWidth + 1
        && fixture.bottom <= fixture.viewportHeight + 1
      return { ruleId: fixture.ruleId, passed: contained && fixture.activeReachable, detail: `contained=${contained}; active-reachable=${fixture.activeReachable}` }
    }
    case 'controls.bounded-choice-contrast': {
      const ratio = contrastRatio(fixture.foreground, fixture.background)
      return { ruleId: fixture.ruleId, passed: ratio >= fixture.threshold, detail: `ratio=${ratio.toFixed(2)}; threshold=${fixture.threshold}` }
    }
    case 'controls.variant-classification': {
      const passed = [fixture.variant, fixture.size, fixture.state].every((value) => value.trim().length > 0)
      return { ruleId: fixture.ruleId, passed, detail: `variant=${fixture.variant || '<none>'}; size=${fixture.size || '<none>'}; state=${fixture.state || '<none>'}` }
    }
    case 'controls.variant-consistency': {
      return { ruleId: fixture.ruleId, passed: fixture.spreadPx <= 1 && fixture.colorsIdentical, detail: `spread=${fixture.spreadPx}px; colors-identical=${fixture.colorsIdentical}` }
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

export type VisibleContentKind = 'text-truncation' | 'viewport-occlusion' | 'touch-separation'

export type VisibleContentRow = PageAuditContext & {
  cellId: string
  selector: string
  kind: VisibleContentKind
  observed: boolean
  passed: boolean
  measured: string
}

export type TextTruncationMeasure = {
  scrollWidth: number
  clientWidth: number
  scrollHeight: number
  clientHeight: number
  overflow?: string
  overflowX?: string
  overflowY?: string
  lineClamp: string
  textOverflow: string
}

/**
 * CSS `text-overflow: ellipsis` is an authoring hint, not evidence that text
 * is clipped.  A fitting element can still carry that style, so require a
 * measurable overflow before treating ellipsis as truncation.
 */
export function isTextTruncated(measure: TextTruncationMeasure): boolean {
  const overflowClips = ['hidden', 'clip'].includes(measure.overflow || '')
    || ['hidden', 'clip'].includes(measure.overflowX || '')
    || ['hidden', 'clip'].includes(measure.overflowY || '')
  const lineClamp = measure.lineClamp || 'none'
  const horizontallyClipped = measure.scrollWidth > measure.clientWidth + 1
  return horizontallyClipped
    || (overflowClips && measure.scrollHeight > measure.clientHeight + 1)
    || (lineClamp !== 'none' && lineClamp !== '0')
    || (measure.textOverflow === 'ellipsis' && horizontallyClipped)
}

/** Measure visible text, persistent-band overlap, and the complete phone control population. */
export async function collectVisibleContent(
  page: Page,
  context: PageAuditContext,
  cellId: string,
  exercisedFullValueSelectors: readonly string[] = [],
): Promise<VisibleContentRow[]> {
  return page.evaluate(({ pageContext, manifestCellId, exercisedSelectors }) => {
    const rows: VisibleContentRow[] = []
    const actionable = 'button, a[href], input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="tab"]'
    const textSelector = 'h1, h2, h3, h4, h5, h6, p, span, td, th, dt, dd, label, button, a[href], [data-full-value]'
    const visible = (element: HTMLElement): boolean => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 2 && rect.height > 2
    }
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
    const textTargets = Array.from(document.querySelectorAll<HTMLElement>(textSelector))
      .filter((element) => visible(element) && /[\p{L}\p{N}]/u.test(element.innerText?.trim() || ''))
    for (const element of textTargets) {
      const style = getComputedStyle(element)
      const overflowClips = ['hidden', 'clip'].includes(style.overflow)
        || ['hidden', 'clip'].includes(style.overflowX)
        || ['hidden', 'clip'].includes(style.overflowY)
      const lineClamp = style.getPropertyValue('-webkit-line-clamp') || 'none'
      const truncated = element.scrollWidth > element.clientWidth + 1
        || (overflowClips && element.scrollHeight > element.clientHeight + 1)
        || (lineClamp !== 'none' && lineClamp !== '0')
      const fullValuePathExercised = exercisedSelectors.some((selector) => {
        try { return element.matches(selector) } catch { return false }
      })
      rows.push({
        ...pageContext,
        cellId: manifestCellId,
        selector: cssPath(element),
        kind: 'text-truncation',
        observed: true,
        passed: !truncated || fullValuePathExercised,
        measured: JSON.stringify({
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          lineClamp,
          textOverflow: style.textOverflow,
          fullValuePathExercised,
        }),
      })
    }

    const viewportArea = Math.max(1, window.innerWidth * window.innerHeight)
    const persistentBands = Array.from(document.querySelectorAll<HTMLElement>('body *')).filter((element) => {
      if (!visible(element)) return false
      const position = getComputedStyle(element).position
      if (position !== 'fixed' && position !== 'sticky') return false
      // A band is chrome pinned to an edge — a header, a footer, a sticky table head. A layer
      // that covers most of the viewport is a MODE, not a band: an open composer or record
      // overlay is meant to cover the page behind it, and counting it here reported every
      // control on the covered page as unreachable content.
      const rect = element.getBoundingClientRect()
      const covered = (Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0))
        * (Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0))
      return covered / viewportArea < 0.8
    })
    const occlusionTargets = Array.from(new Set([
      ...textTargets,
      ...Array.from(document.querySelectorAll<HTMLElement>(actionable)).filter(visible),
    ]))
    // The contract is reachability: content fails only when it CANNOT be brought clear of a
    // persistent band, not when it happens to sit under one at some scroll offset. Sticky
    // headers and footers are the designed pattern — rows slide beneath them on the way past.
    //
    // No single scroll position can decide that. Measuring at rest failed every below-fold row
    // of every sticky-footer surface. Measuring at the bottom just moves the arbitrariness:
    // whichever row lands behind the sticky table header there fails while the rows after it
    // pass, which is how row 22 of 33 came to be the one Café Log failure. So ask the question
    // directly — scroll each target to the middle of its scroller and see whether it is still
    // covered. Content with nowhere clear to go (a first row under a header with no top
    // reserve, a last row under a footer with no bottom reserve) cannot be centred and still
    // fails, which is the case the rule exists for.
    for (const target of occlusionTargets) {
      target.scrollIntoView({ block: 'center', inline: 'nearest' })
      const targetRect = target.getBoundingClientRect()
      let intersectionRatio = 0
      let centerCovered = false
      // Which band did it, not just that one did: without this a failing row names the covered
      // element and leaves the cover anonymous, and the only way to find it is to re-drive the
      // state by hand and guess.
      let occludedBy: string | null = null
      for (const band of persistentBands) {
        if (band === target || band.contains(target) || target.contains(band)) continue
        const bandRect = band.getBoundingClientRect()
        const width = Math.max(0, Math.min(targetRect.right, bandRect.right) - Math.max(targetRect.left, bandRect.left))
        const height = Math.max(0, Math.min(targetRect.bottom, bandRect.bottom) - Math.max(targetRect.top, bandRect.top))
        const area = Math.max(1, targetRect.width * targetRect.height)
        const ratio = (width * height) / area
        if (ratio > intersectionRatio) {
          intersectionRatio = ratio
          occludedBy = cssPath(band)
        }
        const centerX = targetRect.left + targetRect.width / 2
        const centerY = targetRect.top + targetRect.height / 2
        if (centerX >= bandRect.left && centerX <= bandRect.right && centerY >= bandRect.top && centerY <= bandRect.bottom) {
          centerCovered = true
          occludedBy ??= cssPath(band)
        }
      }
      const topInset = persistentBands.reduce((value, band) => {
        const rect = band.getBoundingClientRect()
        return rect.top <= 1 ? Math.max(value, rect.bottom) : value
      }, 0)
      const bottomInset = persistentBands.reduce((value, band) => {
        const rect = band.getBoundingClientRect()
        return rect.bottom >= window.innerHeight - 1 ? Math.max(value, window.innerHeight - rect.top) : value
      }, 0)
      const fullyReachable = targetRect.height <= window.innerHeight - topInset - bottomInset
      rows.push({
        ...pageContext,
        cellId: manifestCellId,
        selector: cssPath(target),
        kind: 'viewport-occlusion',
        observed: true,
        passed: intersectionRatio <= 0.1 && !centerCovered && fullyReachable,
        measured: JSON.stringify({
          intersectionRatio,
          centerCovered,
          fullyReachable,
          occludedBy,
          persistentBandCount: persistentBands.length,
          measuredAt: 'scrolled-into-centre',
        }),
      })
    }
    // Leave the page where the other rules expect it rather than wherever the last target
    // happened to land.
    for (const scroller of new Set<Element>([
      ...(document.scrollingElement ? [document.scrollingElement] : []),
      ...Array.from(document.querySelectorAll<HTMLElement>('body *')).filter((element) => {
        const style = getComputedStyle(element)
        return (style.overflowY === 'auto' || style.overflowY === 'scroll') && element.scrollHeight > element.clientHeight + 1
      }),
    ])) {
      scroller.scrollTop = 0
    }

    if (pageContext.viewport === 'phone-390x844') {
      const controls = Array.from(document.querySelectorAll<HTMLElement>(actionable)).filter(visible)
      if (controls.length === 0) {
        rows.push({
          ...pageContext,
          cellId: manifestCellId,
          selector: '__empty_phone_control_population__',
          kind: 'touch-separation',
          observed: false,
          passed: false,
          measured: JSON.stringify({ width: 0, height: 0, nearestDistance: null, populationSize: 0 }),
        })
      }
      // A checkbox painted at 16px inside a <label> is hit anywhere on that label, so the
      // label is the target a thumb actually has. Same rule, same scope and same substitution
      // as the control census uses (see `labelledTarget` in collectControlCensus below) —
      // deliberately NOT a union of the two rects, which for a stacked label above a field
      // would span the gap between them and report a target no thumb can press.
      const targetArea = (element: HTMLElement): DOMRect => {
        const own = element.getBoundingClientRect()
        if (!element.matches('input[type="checkbox"], input[type="radio"]')) return own
        const label = element.closest<HTMLElement>('label')
          ?? (element.id ? document.querySelector<HTMLElement>(`label[for="${CSS.escape(element.id)}"]`) : null)
        if (!label || !visible(label)) return own
        const box = label.getBoundingClientRect()
        return box.width > 0 && box.height > 0 ? box : own
      }
      for (const target of controls) {
        const rect = targetArea(target)
        const container = target.closest('form, nav, [role="group"], [role="toolbar"], [role="menu"], [role="listbox"], main, aside, [role="dialog"]')
          || document.body
        const neighbours = controls.filter((candidate) => candidate !== target
          && (candidate.closest('form, nav, [role="group"], [role="toolbar"], [role="menu"], [role="listbox"], main, aside, [role="dialog"]')
            || document.body) === container)
        // A control that scrolls UNDER a sticky bar is not a neighbour of it — their boxes
        // overlap because one layer is above the other, and a pair reported 0px apart that
        // way is not two targets a thumb can confuse. Adjacent targets sit beside each
        // other and never intersect. Same-layer overlap is left alone: that is a real
        // defect, and this only excuses a pair split across a sticky or fixed layer.
        const stickyLayer = (element: HTMLElement): boolean => {
          for (let node: HTMLElement | null = element; node; node = node.parentElement) {
            const position = getComputedStyle(node).position
            if (position === 'fixed' || position === 'sticky') return true
          }
          return false
        }
        const targetSticky = stickyLayer(target)
        let nearestDistance: number | null = null
        let nearestSelector = ''
        for (const neighbour of neighbours) {
          const other = targetArea(neighbour)
          const intersects = other.left < rect.right && other.right > rect.left
            && other.top < rect.bottom && other.bottom > rect.top
          if (intersects && stickyLayer(neighbour) !== targetSticky) continue
          // A control inside the same activating label is the same target, not a neighbour
          // 0px away from itself.
          if (other.left === rect.left && other.top === rect.top
            && other.width === rect.width && other.height === rect.height) continue
          const dx = Math.max(rect.left - other.right, other.left - rect.right, 0)
          const dy = Math.max(rect.top - other.bottom, other.top - rect.bottom, 0)
          const distance = Math.hypot(dx, dy)
          if (nearestDistance === null || distance < nearestDistance) {
            nearestDistance = distance
            nearestSelector = cssPath(neighbour)
          }
        }
        rows.push({
          ...pageContext,
          cellId: manifestCellId,
          selector: cssPath(target),
          kind: 'touch-separation',
          observed: true,
          passed: rect.width >= 44 && rect.height >= 44 && (nearestDistance === null || nearestDistance >= 8),
          measured: JSON.stringify({
            width: rect.width,
            height: rect.height,
            nearestDistance,
            nearestSelector,
            populationSize: controls.length,
          }),
        })
      }
    }
    return rows
  }, { pageContext: context, manifestCellId: cellId, exercisedSelectors: exercisedFullValueSelectors })
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
  /** Only meaningful while a modal is open: this stop is outside it. */
  escaped?: boolean
}

export type FocusTraversal = {
  rows: FocusRow[]
  expectedStops: number
  cycleDetected: boolean
  /** Set when a modal is open; the traversal population is scoped to it. */
  modalSelector: string | null
  /** Stops a modal let Tab escape to. Non-empty means the trap leaks. */
  escapedStops: string[]
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
  // A modal traps Tab inside itself and makes the page behind it inert — that is the pattern
  // working, not failing. Counting the whole document against it reported the Signals composer
  // as reaching 4 of 16 stops and called its closing cycle a repeated stop. The population is
  // the modal; leaking OUT of it is what the rule below now catches instead.
  const modalSelector = await page.evaluate(() => {
    const open = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'))
      .filter((element) => {
        const style = getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
      })
    // Innermost wins: a dialog opened from a dialog owns the keyboard.
    const target = open.findLast((element) => !open.some((other) => other !== element && element.contains(other)))
    if (!target) return null
    target.setAttribute('data-design-audit-modal', '')
    return '[data-design-audit-modal]'
  })
  const stopCounts = await page.locator(modalSelector ? `${modalSelector} :is(${FOCUSABLE_SELECTOR})` : FOCUSABLE_SELECTOR).evaluateAll((elements) => {
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
  if (expectedStops === 0) return { rows: [], expectedStops, cycleDetected: false, modalSelector, escapedStops: [] }
  // Only the EXPECTED population is scoped to the modal. The walk itself has to be able to step
  // outside it, or a trap that leaks would simply run out of iterations and read as contained.
  const walkLimit = modalSelector
    ? await page.locator(FOCUSABLE_SELECTOR).count()
    : stopCounts.total

  await page.evaluate((modal: string | null) => {
    document.getElementById('design-audit-focus-origin')?.remove()
    const origin = document.createElement('span')
    origin.id = 'design-audit-focus-origin'
    origin.tabIndex = -1
    origin.setAttribute('aria-hidden', 'true')
    // Start inside the modal, or the first Tab measures the trap's entry rather than its order.
    const host = modal ? document.querySelector(modal) : null
    if (host) host.prepend(origin)
    else document.body.prepend(origin)
    origin.focus()
  }, modalSelector)

  const rows: FocusRow[] = []
  const seen = new Set<string>()
  const escapedStops: string[] = []
  let cycleDetected = false
  try {
    for (let order = 0; order < walkLimit + 1; order += 1) {
      await page.keyboard.press('Tab')
      const focused = await page.evaluate((modal: string | null) => {
        const element = document.activeElement
        const host = modal ? document.querySelector(modal) : null
        const escaped = Boolean(host) && element instanceof Node && !host!.contains(element)
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
          escaped,
          hasIndicator: indicatorStyles.some((candidate) =>
            (Number.parseFloat(candidate.outlineWidth) || 0) >= 2
            || (candidate.boxShadow !== 'none' && candidate.boxShadow.trim() !== '')),
        }
      }, modalSelector)
      if (!focused) {
        // Nothing focused. With no modal that is the end of the order; with one open it means
        // the trap let go, so record it and keep walking to see where Tab lands next.
        if (!modalSelector) break
        if (!escapedStops.includes('body')) escapedStops.push('body')
        continue
      }
      if (!focused.measurable) continue
      if (focused.escaped) escapedStops.push(focused.selector)
      if (seen.has(focused.selector)) {
        cycleDetected = rows.length < expectedStops
        break
      }
      seen.add(focused.selector)
      rows.push({ ...context, ...focused })
    }
  } finally {
    await page.evaluate((modal: string | null) => {
      document.getElementById('design-audit-focus-origin')?.remove()
      if (modal) document.querySelector(modal)?.removeAttribute('data-design-audit-modal')
    }, modalSelector)
  }
  return { rows, expectedStops, cycleDetected, modalSelector, escapedStops }
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
      let ancestor: Element | null = element.parentElement
      while (ancestor && !isCard(ancestor)) ancestor = ancestor.parentElement
      const cardAncestor = ancestor
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
    const colorCanvas = document.createElement('canvas')
    colorCanvas.width = 1
    colorCanvas.height = 1
    const colorContext = colorCanvas.getContext('2d')
    const parse = (value: string): CssColor | null => {
      if (!colorContext || !CSS.supports('color', value)) return null
      colorContext.clearRect(0, 0, 1, 1)
      colorContext.fillStyle = value
      colorContext.fillRect(0, 0, 1, 1)
      const [red, green, blue, alpha] = colorContext.getImageData(0, 0, 1, 1).data
      return { rgb: [red!, green!, blue!], alpha: alpha! / 255 }
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
      const matches = value.matchAll(/rgba?\([^)]*\)|(?:oklab|oklch|lab|lch|color)\([^)]*\)/gi)
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
      const directText = Array.from(element.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent?.trim() || '')
        .filter(Boolean)
        .join(' ')
      const semanticText = element.matches('h1, h2, h3, p, label, button, a[href], [role="button"], [role="combobox"], [role="option"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]')
        ? element.innerText?.trim() || directText
        : directText
      const text = semanticText || (element as HTMLInputElement).value?.trim() || (element as HTMLInputElement).placeholder?.trim() || ''
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
        const boundaries: Array<{ source: string; color: CssColor; adjacent: [number, number, number] }> = []
        const boundaryElements = contrastState === 'focus'
          ? [element, element.parentElement, element.parentElement?.parentElement]
            .filter((candidate): candidate is HTMLElement => candidate instanceof HTMLElement)
          : [element]
        for (const [depth, boundaryElement] of boundaryElements.entries()) {
          const boundaryStyle = getComputedStyle(boundaryElement)
          const sourcePrefix = depth === 0 ? '' : `ancestor-${depth}-`
          const outlineWidth = Number.parseFloat(boundaryStyle.outlineWidth) || 0
          if (outlineWidth > 0 && boundaryStyle.outlineStyle !== 'none') {
            const outlineColor = parse(boundaryStyle.outlineColor)
            if (outlineColor) boundaries.push({
              source: `${sourcePrefix}outline`,
              color: outlineColor,
              adjacent: backgroundFor(boundaryElement.parentElement ?? boundaryElement),
            })
          }
          if (contrastState !== 'focus') {
            for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
              const width = Number.parseFloat(boundaryStyle[`border${side}Width`]) || 0
              if (width > 0 && boundaryStyle[`border${side}Style`] !== 'none') {
                const borderColor = parse(boundaryStyle[`border${side}Color`])
                if (borderColor) boundaries.push({ source: `${sourcePrefix}border-${side.toLowerCase()}`, color: borderColor, adjacent: background })
              }
            }
          }
          if (contrastState === 'focus' && boundaryStyle.boxShadow !== 'none') {
            const shadowColor = cssColorMatches(boundaryStyle.boxShadow)[0]
            if (shadowColor) boundaries.push({
              source: `${sourcePrefix}box-shadow`,
              color: shadowColor,
              adjacent: backgroundFor(boundaryElement.parentElement ?? boundaryElement),
            })
          }
        }
        const graphicFallback = collectionOptions.allowForegroundBoundary
          && foreground
          && (element.matches('svg, svg *, img, [role="img"], [data-meaningful-graphic]')
            // DD-MVP-19 allows borderless controls to carry their affordance in the glyph:
            // an actionable element whose visible content is only a graphic (icon button)
            // is measured on that glyph's color. Without this arm the collector reports
            // "unobserved" for every shared borderless icon button even when its glyph
            // clears 3:1, which misclassifies a design-contract affordance as a failure.
            || (element.matches('button, a[href], [role="button"], [role="link"], [role="combobox"], [role="menuitem"], [role="tab"]')
              && element.querySelector(':scope > svg, :scope > img, :scope svg')))
        if (boundaries.length === 0 && graphicFallback && foreground) boundaries.push({ source: 'foreground', color: foreground, adjacent: background })
        if (boundaries.length === 0) {
          rows.push(emptyRow('boundary'))
        } else {
          const measuredBoundaries = boundaries.map(({ source, color, adjacent }) => {
            const foregroundRgb = color.alpha < 1 ? blend(color, adjacent) : color.rgb
            return { source, foregroundRgb, adjacent, ratio: ratio(foregroundRgb, adjacent) }
          })
          const strongest = measuredBoundaries.reduce((maximum, current) => current.ratio > maximum.ratio ? current : maximum)
          rows.push({
            ...pageContext,
            selector: `${selectorText} (${strongest.source})`,
            state: contrastState,
            kind: 'boundary',
            threshold: 3,
            foreground: `rgb(${strongest.foregroundRgb.map((value) => Math.round(value)).join(',')})`,
            background: `rgb(${strongest.adjacent.join(',')})`,
            ratio: strongest.ratio,
            largeText: false,
            observed: true,
            passes: strongest.ratio >= 3,
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
