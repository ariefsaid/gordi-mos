import type { Locator, Page } from '@playwright/test'

import { collectContrast, contrastRatio, parseCssColor, type PageAuditContext } from './measurements.ts'

export type ControlVariantEntry = {
  selector: string
  component: string
  variant: string
  authority: string
}

export type ClassifiedControlMetrics = {
  component: string
  variant: string
  size: string
  state: string
  height: number
  radius: number
  borderWidth: number
  foreground: string
  background: string
}

export type ControlGroupSummary = {
  group: string
  members: number
  heightSpread: number
  radiusSpread: number
  borderWidthSpread: number
  distinctForegrounds: number
  distinctBackgrounds: number
  passed: boolean
}

export type ControlConsistencyRow = {
  cellId: string
  kind: 'population' | 'control' | 'control-state' | 'bounded-choice' | 'native-select'
  selector: string
  component: string
  variant: string
  size: string
  state: string
  authority: string
  observed: boolean
  passed: boolean
  measured: string
}

/**
 * A bounded choice's semantic identity is the caller-owned id on its visible
 * trigger. The generated path and label are snapshots for diagnostics only.
 */
export type BoundedChoiceIdentity = {
  id: string
  role: string
  label: string
  marker: BoundedChoiceMarker
  diagnosticSelector: string
  valid: boolean
  invalidReason?: BoundedChoiceInvalidReason
}

type BoundedChoiceMarker = 'role=combobox' | 'aria-haspopup=listbox' | 'picker-trigger' | 'select-field'
type BoundedChoiceInvalidReason = 'keyless' | 'invalid-id' | 'duplicate'

export type BoundedChoiceLifecyclePopulationResult = {
  expectedCount: number
  lifecycleCount: number
  missingIdentities: string[]
  duplicateIdentities: string[]
  extraIdentities: string[]
  failedIdentities: string[]
  keylessIdentities: string[]
  invalidIdentities: string[]
  passed: boolean
}

export type BoundedChoiceResolutionResult = {
  id: string
  matchCount: number
  roleMatched: boolean
  markerMatched: boolean
  reason: BoundedChoiceResolutionFailureReason | null
  passed: boolean
}

export type BoundedChoiceResolutionFailureReason =
  | 'keyless'
  | 'invalid-id'
  | 'missing'
  | 'ambiguous'
  | 'duplicate'
  | 'role-mismatched'
  | 'action-failed'
  | 'popup-unassociated'
  | 'popup-missing'
  | 'popup-ambiguous'
  | 'popup-role-mismatched'
  | 'popup-not-open'
  | 'outside-dismissal-failed'
  | 'active-option-missing'
  | 'active-option-ambiguous'
  | 'active-option-role-mismatched'
  | 'selected-option-missing'
  | 'selected-option-ambiguous'
  | 'selected-option-id-missing'

export type BoundedChoiceResolutionFailureMeasurement = {
  lifecycleApplicable: true
  resolutionFailure: {
    identity: string
    id: string
    role: string
    marker: BoundedChoiceMarker
    label: string
    diagnosticSelector: string
    matchCount: number
    roleMatched: boolean
    markerMatched: boolean
    reason: BoundedChoiceResolutionFailureReason
    passed: false
    error?: string
  }
}

export type NativeSelectException = {
  selector: string
  authority: string
}

type RenderedControl = ClassifiedControlMetrics & {
  borderColor: string
  borderStyle: string
  selector: string
  tag: string
  role: string
  disabled: boolean
  invalid: boolean
  expanded: boolean
  selected: boolean
  elementHasListboxPopup: boolean
  matchedSelector: string
  authority: string
}

/**
 * Compare lifecycle rows with the semantic identity set captured before any
 * control is exercised. The set is intentionally supplied by the caller so
 * scrolling or focus changes cannot silently change the denominator midway
 * through a cell.
 */
export function validateBoundedChoiceLifecyclePopulation(
  capturedIdentities: readonly BoundedChoiceIdentity[],
  lifecycleRows: readonly ControlConsistencyRow[],
): BoundedChoiceLifecyclePopulationResult {
  const expectedIdentities = capturedIdentities.map(identity => identity.id)

  const lifecycleIdentities = lifecycleRows
    .filter((row) => row.kind === 'bounded-choice')
    .map((row) => row.selector)
  const expectedCounts = countIdentities(expectedIdentities)
  const lifecycleCounts = countIdentities(lifecycleIdentities)
  const missingIdentities = [...expectedCounts.entries()]
    .filter(([identity, count]) => (lifecycleCounts.get(identity) ?? 0) < count)
    .map(([identity]) => identity || '<missing-id>')
  const duplicateIdentities = [...new Set([
    ...[...expectedCounts.entries()].filter(([identity, count]) => Boolean(identity) && count > 1).map(([identity]) => identity),
    ...[...lifecycleCounts.entries()].filter(([identity, count]) => Boolean(identity) && count > 1).map(([identity]) => identity),
  ])]
  const expectedSet = new Set(expectedIdentities)
  const extraIdentities = [...new Set(lifecycleIdentities)]
    .filter((identity) => !expectedSet.has(identity))
    .map((identity) => identity || '<missing-id>')
  const failedIdentities = [...new Set(lifecycleRows
    .filter((row) => row.kind === 'bounded-choice' && !row.passed)
    .map((row) => row.selector || '<missing-id>'))]
  const keylessIdentities = capturedIdentities
    .filter((identity) => !identity.id)
    .map((identity) => identity.diagnosticSelector || '<missing-id>')
  const invalidIdentities = [...new Set(capturedIdentities
    .filter((identity) => !identity.valid)
    .map(identity => identity.invalidReason === 'invalid-id'
      ? identity.diagnosticSelector || '<missing-id>'
      : identity.id || identity.diagnosticSelector || '<missing-id>'))]
  return {
    expectedCount: capturedIdentities.length,
    lifecycleCount: lifecycleIdentities.length,
    missingIdentities,
    duplicateIdentities,
    extraIdentities,
    failedIdentities,
    keylessIdentities,
    invalidIdentities,
    passed: missingIdentities.length === 0
      && duplicateIdentities.length === 0
      && extraIdentities.length === 0
      && failedIdentities.length === 0
      && keylessIdentities.length === 0
      && invalidIdentities.length === 0
      && lifecycleIdentities.length === capturedIdentities.length,
  }
}

function countIdentities(identities: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const identity of identities) counts.set(identity, (counts.get(identity) ?? 0) + 1)
  return counts
}

export const CONTROL_VARIANT_VOCABULARY: readonly ControlVariantEntry[] = [
  { selector: '.btn.btn-primary', component: 'button', variant: 'primary', authority: 'DESIGN.md §5 Buttons; components/ui/Button.css' },
  { selector: '.btn.btn-outline', component: 'button', variant: 'outline', authority: 'DESIGN.md §5 Buttons; components/ui/Button.css' },
  { selector: '.btn.btn-ghost', component: 'button', variant: 'ghost', authority: 'DESIGN.md §5 Buttons; components/ui/Button.css' },
  { selector: '.btn.btn-destructive', component: 'button', variant: 'destructive', authority: 'DESIGN.md §5 Buttons; components/ui/Button.css' },
  { selector: '.btn-touch', component: 'button', variant: 'touch', authority: 'DESIGN.md §5 Buttons phone action; components/ui/Button.css' },
  { selector: '.mk-iconbtn', component: 'icon-button', variant: 'icon', authority: 'DESIGN.md §5 Buttons; components/ui/IconButton.css' },
  { selector: '.picker__trigger', component: 'bounded-choice', variant: 'picker', authority: 'DD-MVP-2 designed bounded choice; components/ui/Picker.css' },
  { selector: '.mk-select__field', component: 'bounded-choice', variant: 'select', authority: 'DD-MVP-2 designed bounded choice; components/ui/Select.css' },
  { selector: '.mk-chip--clickable', component: 'chip', variant: 'clickable', authority: 'components/ui/Chip.css clickable chip contract' },
  { selector: '.pill', component: 'pill', variant: 'pill', authority: 'components/ui/Pill.css shared pill contract' },
]

/** Capture bounded-choice identities before any state or lifecycle interaction can scroll. */
export async function captureBoundedChoicePopulation(page: Page): Promise<BoundedChoiceIdentity[]> {
  const identities = await page.evaluate(({ vocabulary }) => {
    const visible = (element: HTMLElement) => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && style.opacity !== '0'
        && rect.width > 2
        && rect.height > 2
        && rect.right > 0
        && rect.bottom > 0
        && rect.left < window.innerWidth
        && rect.top < window.innerHeight
    }
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
    const accessibleName = (element: HTMLElement): string => {
      const labelledBy = element.getAttribute('aria-labelledby')
        ?.split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
        .filter(Boolean)
        .join(' ')
      const associatedLabel = element.id
        ? Array.from(document.querySelectorAll<HTMLLabelElement>('label')).find((label) => label.htmlFor === element.id)?.textContent?.trim()
        : ''
      const parentLabel = element.closest('label')?.textContent?.trim()
      const raw = element.getAttribute('aria-label')?.trim()
        || labelledBy
        || associatedLabel
        || parentLabel
        || element.innerText?.trim()
        || element.textContent?.trim()
        || ''
      return raw.replace(/\s+/g, ' ')
    }
    const actionable = 'button, a[href], [role="button"], [role="link"], [role="combobox"], .mk-chip--clickable'
    const captures = Array.from(document.querySelectorAll<HTMLElement>(actionable))
      .filter(visible)
      .filter((element) => {
        const match = vocabulary.find((entry) => element.matches(entry.selector))
        return element.getAttribute('role') === 'combobox'
          || (element.tagName.toLowerCase() === 'button' && element.getAttribute('aria-haspopup') === 'listbox')
          || match?.selector === '.picker__trigger'
          || match?.selector === '.mk-select__field'
      })
      .map((element) => {
        const role = element.getAttribute('role') || element.tagName.toLowerCase()
        const marker: BoundedChoiceMarker = element.getAttribute('role') === 'combobox'
          ? 'role=combobox'
          : element.tagName.toLowerCase() === 'button' && element.getAttribute('aria-haspopup') === 'listbox'
            ? 'aria-haspopup=listbox'
            : element.classList.contains('picker__trigger')
              ? 'picker-trigger'
              : 'select-field'
        return {
          id: element.id.trim(),
          role,
          label: accessibleName(element),
          marker,
          diagnosticSelector: elementPath(element),
        }
      })
    const idCounts = new Map<string, number>()
    for (const capture of captures) idCounts.set(capture.id, (idCounts.get(capture.id) ?? 0) + 1)
    return captures.map((capture) => {
      const duplicate = Boolean(capture.id) && (idCounts.get(capture.id) ?? 0) > 1
      const invalidReason: BoundedChoiceInvalidReason | undefined = !capture.id
        ? 'keyless'
        : !/^[a-z0-9][a-z0-9-]*$/.test(capture.id)
          ? 'invalid-id'
          : duplicate ? 'duplicate' : undefined
      return {
        ...capture,
        valid: invalidReason === undefined,
        ...(invalidReason ? { invalidReason } : {}),
      }
    })
  }, { vocabulary: CONTROL_VARIANT_VOCABULARY }) as BoundedChoiceIdentity[]
  return identities
}

function currentElementPath(locator: Locator): Promise<string> {
  return locator.evaluate((element) => {
    const segments: string[] = []
    let current: HTMLElement | null = element as HTMLElement
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
  })
}

function idAttributeSelector(id: string): string {
  return `[id=${JSON.stringify(id)}]`
}

function boundedChoiceDiagnosticIdentity(target: BoundedChoiceIdentity, diagnosticSelector = target.diagnosticSelector): string {
  return target.id && target.invalidReason !== 'invalid-id'
    ? target.id
    : diagnosticSelector || '<missing-id>'
}

function resolutionFailureRow(
  cellId: string,
  target: BoundedChoiceIdentity,
  failure: Pick<BoundedChoiceResolutionResult, 'matchCount' | 'roleMatched' | 'markerMatched'> & {
    reason: BoundedChoiceResolutionFailureReason
    error?: string
  },
  diagnosticSelector = target.diagnosticSelector,
): ControlConsistencyRow {
  const identity = boundedChoiceDiagnosticIdentity(target, diagnosticSelector)
  const measured: BoundedChoiceResolutionFailureMeasurement = {
    lifecycleApplicable: true,
    resolutionFailure: {
      identity,
      id: target.id,
      role: target.role,
      marker: target.marker,
      label: target.label,
      diagnosticSelector: diagnosticSelector || '<missing-id>',
      ...failure,
      passed: false,
    },
  }
  return {
    cellId,
    kind: 'bounded-choice',
    selector: identity,
    component: 'bounded-choice',
    variant: 'unknown',
    size: 'unresolved',
    state: 'lifecycle',
    authority: 'DD-MVP-2 designed bounded choice; issue #856 lifecycle contract',
    observed: false,
    passed: false,
    measured: JSON.stringify(measured),
  }
}

type PopupResolution = {
  popup: Locator | null
  matchCount: number
  roleMatched: boolean
  visible: boolean
  reason: BoundedChoiceResolutionFailureReason | null
}

async function resolveAssociatedPopup(page: Page, trigger: Locator): Promise<PopupResolution> {
  const controlsId = (await trigger.getAttribute('aria-controls'))?.trim() ?? ''
  if (!controlsId) return { popup: null, matchCount: 0, roleMatched: false, visible: false, reason: 'popup-unassociated' }

  const popup = page.locator(idAttributeSelector(controlsId))
  const matchCount = await popup.count()
  if (matchCount === 0) return { popup, matchCount, roleMatched: false, visible: false, reason: 'popup-missing' }
  if (matchCount !== 1) return { popup, matchCount, roleMatched: false, visible: false, reason: 'popup-ambiguous' }

  const visible = await popup.isVisible().catch(() => false)
  if (!visible) return { popup, matchCount, roleMatched: false, visible, reason: 'popup-not-open' }
  const role = await popup.getAttribute('role').catch(() => null)
  if (role !== 'listbox' && role !== 'menu') {
    return { popup, matchCount, roleMatched: false, visible, reason: 'popup-role-mismatched' }
  }
  return { popup, matchCount, roleMatched: true, visible, reason: null }
}

type ActiveOptionResolution = {
  id: string
  matchCount: number
  roleMatched: boolean
  reason: BoundedChoiceResolutionFailureReason | null
}

async function resolveActiveOption(
  page: Page,
  trigger: Locator,
  popup: Locator,
): Promise<ActiveOptionResolution> {
  const triggerActive = (await trigger.getAttribute('aria-activedescendant').catch(() => null))?.trim() ?? ''
  const popupActive = (await popup.getAttribute('aria-activedescendant').catch(() => null))?.trim() ?? ''
  const activeIds = [...new Set([triggerActive, popupActive].filter(Boolean))]
  if (activeIds.length === 0) return { id: '', matchCount: 0, roleMatched: false, reason: 'active-option-missing' }
  if (activeIds.length !== 1) return { id: '', matchCount: activeIds.length, roleMatched: false, reason: 'active-option-ambiguous' }

  const id = activeIds[0]!
  const activeOption = popup.locator(idAttributeSelector(id))
  const matchCount = await activeOption.count()
  if (matchCount === 0) return { id, matchCount, roleMatched: false, reason: 'active-option-missing' }
  if (matchCount !== 1) return { id, matchCount, roleMatched: false, reason: 'active-option-ambiguous' }
  const globalMatchCount = await page.locator(idAttributeSelector(id)).count()
  if (globalMatchCount !== 1) return { id, matchCount: globalMatchCount, roleMatched: false, reason: 'active-option-ambiguous' }
  const roleMatched = await activeOption.getAttribute('role') === 'option'
  return { id, matchCount, roleMatched, reason: roleMatched ? null : 'active-option-role-mismatched' }
}

type SelectedOptionResolution = {
  id: string
  selector: string
  matchCount: number
  reason: BoundedChoiceResolutionFailureReason | null
}

async function resolveSelectedOption(page: Page, popup: Locator): Promise<SelectedOptionResolution> {
  const selected = popup.locator('[role="option"][aria-selected="true"], [role="option"][aria-checked="true"]')
  const matchCount = await selected.count()
  if (matchCount === 0) return { id: '', selector: '', matchCount, reason: 'selected-option-missing' }
  if (matchCount !== 1) return { id: '', selector: '', matchCount, reason: 'selected-option-ambiguous' }
  const id = (await selected.getAttribute('id'))?.trim() ?? ''
  if (!id) return { id: '', selector: '', matchCount, reason: 'selected-option-id-missing' }
  const selector = idAttributeSelector(id)
  const globalMatchCount = await page.locator(selector).count()
  if (globalMatchCount !== 1) return { id, selector, matchCount: globalMatchCount, reason: 'selected-option-ambiguous' }
  return { id, selector, matchCount, reason: null }
}

/** Require exactly one current trigger with its captured role and bounded-choice marker. */
export function validateBoundedChoiceResolution(
  target: BoundedChoiceIdentity,
  matchCount: number,
  roleMatched: boolean,
  markerMatched: boolean,
): BoundedChoiceResolutionResult {
  let reason: BoundedChoiceResolutionResult['reason'] = null
  if (!target.id) reason = 'keyless'
  else if (target.invalidReason === 'invalid-id' || (!target.valid && target.invalidReason !== 'duplicate')) reason = 'invalid-id'
  else if (matchCount === 0) reason = 'missing'
  else if (matchCount !== 1) reason = 'ambiguous'
  else if (target.invalidReason === 'duplicate') reason = 'duplicate'
  else if (!roleMatched || !markerMatched) reason = 'role-mismatched'
  return {
    id: target.id,
    matchCount,
    roleMatched,
    markerMatched,
    reason,
    passed: reason === null,
  }
}

/** Resolve rendered heights to the named control sizes in the approved design system. */
export function classifyControlSize(height: number): string {
  const named = [
    [44, 'touch-44'],
    [32, 'control-32'],
    [22, 'compact-22'],
  ] as const
  return named.find(([pixels]) => Math.abs(height - pixels) <= 2)?.[1] ?? 'unresolved'
}

export function summarizeControlGroups(controls: readonly ClassifiedControlMetrics[]): ControlGroupSummary[] {
  const groups = new Map<string, ClassifiedControlMetrics[]>()
  for (const control of controls) {
    const key = [control.component, control.variant, control.size, control.state].join('|')
    groups.set(key, [...(groups.get(key) ?? []), control])
  }

  return [...groups.entries()].map(([group, members]) => {
    const spread = (values: readonly number[]) => Math.max(...values) - Math.min(...values)
    const heightSpread = spread(members.map((member) => member.height))
    const radiusSpread = spread(members.map((member) => member.radius))
    const borderWidthSpread = spread(members.map((member) => member.borderWidth))
    const distinctForegrounds = new Set(members.map((member) => member.foreground)).size
    const distinctBackgrounds = new Set(members.map((member) => member.background)).size
    return {
      group,
      members: members.length,
      heightSpread,
      radiusSpread,
      borderWidthSpread,
      distinctForegrounds,
      distinctBackgrounds,
      passed: heightSpread <= 1
        && radiusSpread <= 1
        && borderWidthSpread <= 1
        && distinctForegrounds <= 1
        && distinctBackgrounds <= 1,
    }
  })
}

function minimumObservedRatio(
  entries: Awaited<ReturnType<typeof collectContrast>>,
  kind: 'text' | 'boundary',
): number {
  const ratios = entries.filter((entry) => entry.kind === kind && entry.observed).map((entry) => entry.ratio ?? 0)
  return ratios.length > 0 ? Math.min(...ratios) : 0
}

function ratio(foreground: string, background: string): number {
  const foregroundRgb = parseCssColor(foreground)
  const backgroundRgb = parseCssColor(background)
  return foregroundRgb && backgroundRgb ? contrastRatio(foregroundRgb, backgroundRgb) : 0
}

/** Collect the complete rendered control population for one frozen manifest cell. */
export async function collectControlConsistency(
  page: Page,
  _context: PageAuditContext,
  cellId: string,
  nativeSelectExceptions: readonly NativeSelectException[] = [],
  capturedBoundedChoiceIdentities?: readonly BoundedChoiceIdentity[],
): Promise<ControlConsistencyRow[]> {
  const capturedIdentities = capturedBoundedChoiceIdentities ?? await captureBoundedChoicePopulation(page)
  const rendered = await page.evaluate(({ vocabulary, exceptionSelectors }) => {
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
    const visible = (element: HTMLElement) => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && style.opacity !== '0'
        && rect.width > 2
        && rect.height > 2
        && rect.right > 0
        && rect.bottom > 0
        && rect.left < window.innerWidth
        && rect.top < window.innerHeight
    }
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
    const actionable = 'button, a[href], [role="button"], [role="link"], [role="combobox"], .mk-chip--clickable'
    const controls = Array.from(document.querySelectorAll<HTMLElement>(actionable)).filter(visible).map((element) => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      const match = vocabulary.find((entry) => element.matches(entry.selector))
      const invalid = element.getAttribute('aria-invalid') === 'true'
      const disabled = element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true'
      const expanded = element.getAttribute('aria-expanded') === 'true'
      const selected = element.getAttribute('aria-selected') === 'true' || element.getAttribute('aria-current') != null
      return {
        selector: elementPath(element),
        tag: element.tagName.toLowerCase(),
        role: element.getAttribute('role') || element.tagName.toLowerCase(),
        component: match?.component ?? '',
        variant: match?.variant ?? '',
        authority: match?.authority ?? '',
        height: rect.height,
        radius: Number.parseFloat(style.borderRadius) || 0,
        borderWidth: Number.parseFloat(style.borderTopWidth) || 0,
        borderColor: style.borderTopColor,
        borderStyle: style.borderTopStyle,
        foreground: style.color,
        background: `rgb(${backgroundFor(element).map((value) => Math.round(value)).join(', ')})`,
        disabled,
        invalid,
        expanded,
        selected,
        elementHasListboxPopup: element.getAttribute('aria-haspopup') === 'listbox',
        state: disabled ? 'disabled' : invalid ? 'error' : expanded ? 'open' : selected ? 'selected' : 'default',
        size: '',
        matchedSelector: match?.selector ?? '',
      }
    })
    const nativeSelects = Array.from(document.querySelectorAll<HTMLSelectElement>('select'))
      .filter((element) => visible(element) && element.dataset.selectNative !== 'true')
      .map((element) => ({
        selector: elementPath(element),
        exceptionSelector: exceptionSelectors.find((selector) => element.matches(selector)) ?? '',
      }))
    return { controls, nativeSelects }
  }, {
    vocabulary: CONTROL_VARIANT_VOCABULARY,
    exceptionSelectors: nativeSelectExceptions.map((entry) => entry.selector),
  }) as {
    controls: RenderedControl[]
    nativeSelects: { selector: string; exceptionSelector: string }[]
  }

  for (const control of rendered.controls) control.size = classifyControlSize(control.height)
  const groupSummaries = summarizeControlGroups(rendered.controls)
  const groupByKey = new Map(groupSummaries.map((group) => [group.group, group]))
  const populationSize = rendered.controls.length
  const boundedChoicePopulation = capturedIdentities.length
  const nativeSelectPopulation = rendered.nativeSelects.length
  const rows: ControlConsistencyRow[] = [{
    cellId,
    kind: 'population',
    selector: '__cell__',
    component: 'all-controls',
    variant: 'population',
    size: 'all',
    state: 'default',
    authority: 'issue #856 frozen runnable-cell denominator',
    observed: true,
    passed: populationSize > 0,
    measured: JSON.stringify({ populationSize, boundedChoicePopulation, nativeSelectPopulation }),
  }]
  for (const control of rendered.controls) {
    const group = groupByKey.get([control.component, control.variant, control.size, control.state].join('|'))
    const textContrast = ratio(control.foreground, control.background)
    const boundaryContrast = ratio(control.borderColor, control.background)
    const boundaryRequired = control.borderWidth > 0
      && control.borderStyle !== 'none'
      && !/^rgba\([^)]*,\s*0\)$/.test(control.borderColor)
      && control.borderColor !== 'transparent'
    const classified = Boolean(control.component && control.variant && control.size !== 'unresolved' && control.authority)
    rows.push({
      cellId,
      kind: 'control',
      selector: control.selector,
      component: control.component,
      variant: control.variant,
      size: control.size,
      state: control.state,
      authority: control.authority,
      observed: true,
      passed: classified && Boolean(group?.passed) && textContrast >= 4.5 && (!boundaryRequired || boundaryContrast >= 3),
      measured: JSON.stringify({
        populationSize,
        height: control.height,
        radius: control.radius,
        borderWidth: control.borderWidth,
        borderColor: control.borderColor,
        borderStyle: control.borderStyle,
        foreground: control.foreground,
        background: control.background,
        textContrast,
        boundaryContrast,
        boundaryRequired,
        matchedSelector: control.matchedSelector,
        group,
      }),
    })
  }
  for (const nativeSelect of rendered.nativeSelects) {
    const exception = nativeSelectExceptions.find((entry) => entry.selector === nativeSelect.exceptionSelector)
    rows.push({
      cellId,
      kind: 'native-select',
      selector: nativeSelect.selector,
      component: 'native-select',
      variant: exception ? 'sanctioned-exception' : 'raw',
      size: 'native',
      state: 'default',
      authority: exception?.authority ?? '',
      observed: true,
      passed: Boolean(exception),
      measured: JSON.stringify({ populationSize, exceptionMatched: Boolean(exception) }),
    })
  }
  return rows
}

export async function exerciseBoundedChoices(
  page: Page,
  cellId: string,
  context: PageAuditContext = {
    route: 'planted-fixture',
    journey: 'planted-fixture',
    fixture: 'planted-fixture',
    viewport: 'planted-fixture',
    theme: 'light',
    language: 'en',
    state: 'default',
  },
  capturedBoundedChoiceIdentities?: readonly BoundedChoiceIdentity[],
): Promise<ControlConsistencyRow[]> {
  const identities = capturedBoundedChoiceIdentities ?? await captureBoundedChoicePopulation(page)
  const rows: ControlConsistencyRow[] = []
  for (const target of identities) {
    try {
    const selector = target.id
    const trigger = target.id && /^[a-z0-9][a-z0-9-]*$/.test(target.id)
      ? page.locator(`#${target.id}`)
      : null
    const candidateCount = trigger ? await trigger.count() : 0
    const markerState = trigger && candidateCount === 1
      ? await trigger.evaluate((element, expected) => {
          const role = element.getAttribute('role') || element.tagName.toLowerCase()
          const markerMatched = expected.marker === 'role=combobox'
            ? element.getAttribute('role') === 'combobox'
            : expected.marker === 'aria-haspopup=listbox'
              ? element.getAttribute('aria-haspopup') === 'listbox'
              : expected.marker === 'picker-trigger'
                ? element.classList.contains('picker__trigger')
                : element.classList.contains('mk-select__field')
          return { roleMatched: role === expected.role, markerMatched }
        }, target)
      : { roleMatched: false, markerMatched: false }
    const resolution = validateBoundedChoiceResolution(target, candidateCount, markerState.roleMatched, markerState.markerMatched)
    if (!resolution.passed || !trigger) {
      rows.push(resolutionFailureRow(cellId, target, {
        matchCount: resolution.matchCount,
        roleMatched: resolution.roleMatched,
        markerMatched: resolution.markerMatched,
        reason: resolution.reason ?? 'action-failed',
      }))
      continue
    }
    const measurementSelector = `#${selector}`
    const diagnosticSelector = async (): Promise<string> => currentElementPath(trigger).catch(() => target.diagnosticSelector || '<missing-id>')
    // A locator action may scroll the page. Scroll each already-captured target
    // into view deliberately; never rebuild the population after that happens.
    await trigger.scrollIntoViewIfNeeded()
    const initial = await trigger.evaluate((element) => ({
      closed: element.getAttribute('aria-expanded') !== 'true',
      component: element.classList.contains('picker__trigger') || element.classList.contains('mk-select__field')
        ? 'bounded-choice'
        : 'menu-trigger',
      variant: element.classList.contains('picker__trigger')
        ? 'picker'
        : element.classList.contains('mk-select__field') ? 'select' : 'menu',
      height: element.getBoundingClientRect().height,
    }))
    if (await trigger.isDisabled()) {
      const colors = await trigger.evaluate((element) => {
        const style = getComputedStyle(element)
        return { foreground: style.color, background: style.backgroundColor }
      })
      const disabledContrastRows = await collectContrast(page, context, 'disabled', measurementSelector, { measure: 'text' })
      const textContrast = minimumObservedRatio(disabledContrastRows, 'text')
      rows.push({
        cellId,
        kind: 'bounded-choice',
        selector,
        component: initial.component,
        variant: initial.variant,
        size: classifyControlSize(initial.height),
        state: 'disabled',
        authority: 'DD-MVP-2 designed bounded choice; issue #856 disabled-state contract',
        observed: true,
        passed: initial.closed && textContrast >= 3,
        measured: JSON.stringify({
          lifecycleApplicable: false,
          diagnosticSelector: await diagnosticSelector(),
          label: target.label,
          disabled: true,
          closed: initial.closed,
          foreground: colors.foreground,
          background: colors.background,
          textContrast,
          contrastRows: disabledContrastRows,
        }),
      })
      continue
    }
    await trigger.focus()
    await trigger.click()
    const popupResolution = await resolveAssociatedPopup(page, trigger)
    const opened = await trigger.getAttribute('aria-expanded') === 'true'
    if (!popupResolution.popup || popupResolution.reason !== null || !opened) {
      rows.push(resolutionFailureRow(cellId, target, {
        matchCount: popupResolution.matchCount,
        roleMatched: markerState.roleMatched,
        markerMatched: markerState.markerMatched,
        reason: popupResolution.reason ?? 'popup-not-open',
      }, await diagnosticSelector()))
      continue
    }
    const popup = popupResolution.popup
    const activeBeforeResolution = await resolveActiveOption(page, trigger, popup)
    if (activeBeforeResolution.reason !== null) {
      rows.push(resolutionFailureRow(cellId, target, {
        matchCount: activeBeforeResolution.matchCount,
        roleMatched: markerState.roleMatched,
        markerMatched: markerState.markerMatched,
        reason: activeBeforeResolution.reason,
      }, await diagnosticSelector()))
      continue
    }
    const selectedOptionResolution = await resolveSelectedOption(page, popup)
    if (selectedOptionResolution.reason !== null) {
      rows.push(resolutionFailureRow(cellId, target, {
        matchCount: selectedOptionResolution.matchCount,
        roleMatched: markerState.roleMatched,
        markerMatched: markerState.markerMatched,
        reason: selectedOptionResolution.reason,
      }, await diagnosticSelector()))
      continue
    }
    const popupEvidence = await popup.evaluate((element, ids) => {
      const rect = element.getBoundingClientRect()
      const active = document.getElementById(ids.activeId)
      const selected = document.getElementById(ids.selectedId)
      const activeRect = active?.getBoundingClientRect()
      return {
        popupContained: rect.left >= -1 && rect.top >= -1 && rect.right <= window.innerWidth + 1 && rect.bottom <= window.innerHeight + 1,
        activeReachable: Boolean(active && element.contains(active) && activeRect && activeRect.bottom >= rect.top - 1 && activeRect.top <= rect.bottom + 1),
        selectedEvidence: Boolean(selected && element.contains(selected)),
        selectedSelector: ids.selectedSelector,
        popup: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      }
    }, {
      activeId: activeBeforeResolution.id,
      selectedId: selectedOptionResolution.id,
      selectedSelector: selectedOptionResolution.selector,
    })
    const openContrastRows = opened
      ? await collectContrast(page, context, 'open', measurementSelector, { measure: 'both' })
      : []
    const selectedContrastRows = opened && popupEvidence.selectedSelector
      ? await collectContrast(page, context, 'selected', popupEvidence.selectedSelector, { measure: 'text' })
      : []
    const openTextContrast = minimumObservedRatio(openContrastRows, 'text')
    const openBoundaryContrast = minimumObservedRatio(openContrastRows, 'boundary')
    const selectedTextContrast = minimumObservedRatio(selectedContrastRows, 'text')

    const activeBeforeArrow = activeBeforeResolution.id
    await page.keyboard.press('ArrowDown')
    const activeAfterArrowResolution = await resolveActiveOption(page, trigger, popup)
    if (activeAfterArrowResolution.reason !== null) {
      rows.push(resolutionFailureRow(cellId, target, {
        matchCount: activeAfterArrowResolution.matchCount,
        roleMatched: markerState.roleMatched,
        markerMatched: markerState.markerMatched,
        reason: activeAfterArrowResolution.reason,
      }, await diagnosticSelector()))
      continue
    }
    const activeAfterArrow = activeAfterArrowResolution.id
    const arrowKey = Boolean(activeAfterArrow && activeAfterArrow !== activeBeforeArrow)
    const typeaheadTarget = await popup.locator('[role="option"]:not([aria-disabled="true"])').evaluateAll((options, activeId) => {
      const activeIndex = options.findIndex((option) => option.id === activeId)
      const keys = [...new Set(options.map((option) => option.textContent?.trim().slice(0, 1).toLocaleLowerCase() ?? '').filter(Boolean))]
      for (const key of keys) {
        for (let offset = 1; offset <= options.length; offset += 1) {
          const start = activeIndex < 0 ? -1 : activeIndex
          const target = options[(start + offset) % options.length]
          if (target?.id && target.textContent?.trim().toLocaleLowerCase().startsWith(key)) {
            if (target.id !== activeId) return { key, targetId: target.id }
            break
          }
        }
      }
      return { key: '', targetId: '' }
    }, activeAfterArrow)
    if (typeaheadTarget.key) await page.keyboard.press(typeaheadTarget.key)
    const activeAfterTypeaheadResolution = typeaheadTarget.key
      ? await resolveActiveOption(page, trigger, popup)
      : activeAfterArrowResolution
    if (activeAfterTypeaheadResolution.reason !== null) {
      rows.push(resolutionFailureRow(cellId, target, {
        matchCount: activeAfterTypeaheadResolution.matchCount,
        roleMatched: markerState.roleMatched,
        markerMatched: markerState.markerMatched,
        reason: activeAfterTypeaheadResolution.reason,
      }, await diagnosticSelector()))
      continue
    }
    const activeAfterTypeahead = activeAfterTypeaheadResolution.id
    const typeahead = Boolean(typeaheadTarget.key && typeaheadTarget.targetId && activeAfterTypeahead === typeaheadTarget.targetId)

    await page.keyboard.press('Escape')
    const escapeDismissed = await trigger.getAttribute('aria-expanded') !== 'true'
    const focusReturnedAfterEscape = await trigger.evaluate((element) => document.activeElement === element)
    if (!escapeDismissed) await page.mouse.click(1, 1)

    await trigger.focus()
    await trigger.click()
    const outsidePopupResolution = await resolveAssociatedPopup(page, trigger)
    const outsideOpened = await trigger.getAttribute('aria-expanded') === 'true'
    if (!outsidePopupResolution.popup || outsidePopupResolution.reason !== null || !outsideOpened) {
      rows.push(resolutionFailureRow(cellId, target, {
        matchCount: outsidePopupResolution.matchCount,
        roleMatched: markerState.roleMatched,
        markerMatched: markerState.markerMatched,
        reason: outsidePopupResolution.reason ?? 'popup-not-open',
      }, await diagnosticSelector()))
      continue
    }
    await page.mouse.click(1, 1)
    const outsideDismissed = await trigger.getAttribute('aria-expanded') !== 'true'
    if (!outsideDismissed) {
      rows.push(resolutionFailureRow(cellId, target, {
        matchCount: outsidePopupResolution.matchCount,
        roleMatched: markerState.roleMatched,
        markerMatched: markerState.markerMatched,
        reason: 'outside-dismissal-failed',
      }, await diagnosticSelector()))
      continue
    }

    await trigger.focus()
    await trigger.click()
    const enterPopupResolution = await resolveAssociatedPopup(page, trigger)
    const enterOpened = await trigger.getAttribute('aria-expanded') === 'true'
    if (!enterPopupResolution.popup || enterPopupResolution.reason !== null || !enterOpened) {
      rows.push(resolutionFailureRow(cellId, target, {
        matchCount: enterPopupResolution.matchCount,
        roleMatched: markerState.roleMatched,
        markerMatched: markerState.markerMatched,
        reason: enterPopupResolution.reason ?? 'popup-not-open',
      }, await diagnosticSelector()))
      continue
    }
    const enterActiveBefore = await resolveActiveOption(page, trigger, enterPopupResolution.popup)
    if (enterActiveBefore.reason !== null) {
      rows.push(resolutionFailureRow(cellId, target, {
        matchCount: enterActiveBefore.matchCount,
        roleMatched: markerState.roleMatched,
        markerMatched: markerState.markerMatched,
        reason: enterActiveBefore.reason,
      }, await diagnosticSelector()))
      continue
    }
    await page.keyboard.press('ArrowDown')
    const enterActiveAfter = await resolveActiveOption(page, trigger, enterPopupResolution.popup)
    if (enterActiveAfter.reason !== null) {
      rows.push(resolutionFailureRow(cellId, target, {
        matchCount: enterActiveAfter.matchCount,
        roleMatched: markerState.roleMatched,
        markerMatched: markerState.markerMatched,
        reason: enterActiveAfter.reason,
      }, await diagnosticSelector()))
      continue
    }
    await page.keyboard.press('Enter')
    const enterSelected = await trigger.getAttribute('aria-expanded') !== 'true'
    const focusReturnedAfterEnter = await trigger.evaluate((element) => document.activeElement === element)

    const colors = await trigger.evaluate((element) => {
      const style = getComputedStyle(element)
      return { foreground: style.color, background: style.backgroundColor }
    })
    const closedContrastRows = await collectContrast(page, context, 'selected', measurementSelector, { measure: 'text' })
    const textContrast = minimumObservedRatio(closedContrastRows, 'text')
    const passed = initial.closed
      && opened
      && arrowKey
      && typeahead
      && escapeDismissed
      && focusReturnedAfterEscape
      && outsideDismissed
      && enterSelected
      && focusReturnedAfterEnter
      && popupEvidence.popupContained
      && popupEvidence.activeReachable
      && popupEvidence.selectedEvidence
      && textContrast >= 4.5
      && openTextContrast >= 4.5
      && openBoundaryContrast >= 3
      && selectedTextContrast >= 4.5
    rows.push({
      cellId,
      kind: 'bounded-choice',
      selector,
      component: initial.component,
      variant: initial.variant,
      size: classifyControlSize(initial.height),
      state: 'lifecycle',
      authority: 'DD-MVP-2 designed bounded choice; issue #856 lifecycle contract',
      observed: opened,
      passed,
      measured: JSON.stringify({
        lifecycleApplicable: true,
        diagnosticSelector: await diagnosticSelector(),
        label: target.label,
        closed: initial.closed,
        opened,
        arrowKey,
        typeahead,
        enterSelected,
        escapeDismissed,
        outsideDismissed,
        focusReturnedAfterEscape,
        focusReturnedAfterEnter,
        popupContained: popupEvidence.popupContained,
        activeReachable: popupEvidence.activeReachable,
        selectedEvidence: popupEvidence.selectedEvidence,
        popup: popupEvidence.popup,
        foreground: colors.foreground,
        background: colors.background,
        textContrast,
        openTextContrast,
        openBoundaryContrast,
        selectedTextContrast,
        openContrastRows,
        selectedContrastRows,
        closedContrastRows,
      }),
    })
    } catch (error) {
      rows.push(resolutionFailureRow(cellId, target, {
        matchCount: target.id ? 1 : 0,
        roleMatched: Boolean(target.id),
        markerMatched: Boolean(target.id),
        reason: 'action-failed',
        error: error instanceof Error ? error.message : String(error),
      }, target.diagnosticSelector))
    }
  }
  return rows
}

export async function exerciseControlStateColors(
  page: Page,
  context: PageAuditContext,
  cellId: string,
): Promise<ControlConsistencyRow[]> {
  const controls = page.locator('button, a[href], [role="button"], [role="link"], [role="combobox"], .mk-chip--clickable').filter({ visible: true })
  const rows: ControlConsistencyRow[] = []
  for (let index = 0; index < await controls.count(); index += 1) {
    const control = controls.nth(index)
    const intersectsViewport = await control.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return rect.right > 0 && rect.bottom > 0 && rect.left < window.innerWidth && rect.top < window.innerHeight
    })
    if (!intersectsViewport) continue
    const identity = await control.evaluate((element, vocabulary) => {
      const segments: string[] = []
      let current: HTMLElement | null = element as HTMLElement
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
      const match = vocabulary.find((entry) => element.matches(entry.selector))
      const rect = element.getBoundingClientRect()
      return {
        selector: ['body', ...segments].join(' > '),
        component: match?.component ?? '',
        variant: match?.variant ?? '',
        authority: match?.authority ?? '',
        height: rect.height,
        disabled: element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true',
        error: element.getAttribute('aria-invalid') === 'true',
        selected: element.getAttribute('aria-selected') === 'true' || element.getAttribute('aria-current') != null,
        open: element.getAttribute('aria-expanded') === 'true',
        hasText: Boolean((element as HTMLElement).innerText?.trim()),
      }
    }, CONTROL_VARIANT_VOCABULARY)
    const states = identity.disabled
      ? ['disabled']
      : ['default', 'hover', 'focus', 'active', ...(identity.error ? ['error'] : []), ...(identity.selected ? ['selected'] : []), ...(identity.open ? ['open'] : [])]
    for (const state of states) {
      if (state === 'hover') await control.hover()
      else if (state === 'focus') await control.focus()
      else if (state === 'active') {
        await control.hover()
        await page.mouse.down()
      }
      const measure = identity.hasText ? (state === 'focus' ? 'both' : 'text') : 'boundary'
      const contrastRows = await collectContrast(page, context, state, identity.selector, {
        measure,
        allowForegroundBoundary: !identity.hasText,
      })
      const textRows = contrastRows.filter((entry) => entry.kind === 'text')
      const boundaryRows = contrastRows.filter((entry) => entry.kind === 'boundary')
      const applicableRows = identity.hasText ? textRows : boundaryRows
      const size = classifyControlSize(identity.height)
      const passed = Boolean(identity.component && identity.variant && size !== 'unresolved' && identity.authority)
        && applicableRows.length > 0
        && applicableRows.every((entry) => entry.observed && entry.passes)
        && (state !== 'focus' || boundaryRows.some((entry) => entry.observed && entry.passes))
      rows.push({
        cellId,
        kind: 'control-state',
        selector: identity.selector,
        component: identity.component,
        variant: identity.variant,
        size,
        state,
        authority: identity.authority,
        observed: applicableRows.some((entry) => entry.observed),
        passed,
        measured: JSON.stringify({
          textContrast: textRows.length > 0 ? Math.min(...textRows.map((entry) => entry.ratio ?? 0)) : null,
          boundaryContrast: boundaryRows.length > 0 ? Math.max(...boundaryRows.map((entry) => entry.ratio ?? 0)) : null,
          contrastRows,
        }),
      })
      if (state === 'active') {
        await page.mouse.move(0, 0)
        await page.mouse.up()
      }
    }
    await control.evaluate((element) => (element as HTMLElement).blur())
  }
  return rows
}
