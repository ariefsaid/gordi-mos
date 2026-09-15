import type { Page } from '@playwright/test'

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
  matchedSelector: string
  authority: string
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
): Promise<ControlConsistencyRow[]> {
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
    const boundedChoices = controls.filter((control) => control.role === 'combobox'
      || control.matchedSelector === '.picker__trigger'
      || control.matchedSelector === '.mk-select__field')
    return { controls, nativeSelects, boundedChoiceSelectors: boundedChoices.map((control) => control.selector) }
  }, {
    vocabulary: CONTROL_VARIANT_VOCABULARY,
    exceptionSelectors: nativeSelectExceptions.map((entry) => entry.selector),
  }) as {
    controls: RenderedControl[]
    nativeSelects: { selector: string; exceptionSelector: string }[]
    boundedChoiceSelectors: string[]
  }

  for (const control of rendered.controls) control.size = classifyControlSize(control.height)
  const groupSummaries = summarizeControlGroups(rendered.controls)
  const groupByKey = new Map(groupSummaries.map((group) => [group.group, group]))
  const populationSize = rendered.controls.length
  const boundedChoicePopulation = rendered.boundedChoiceSelectors.length
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
): Promise<ControlConsistencyRow[]> {
  const triggers = page.locator('[role="combobox"], button[aria-haspopup="listbox"]').filter({ visible: true })
  const rows: ControlConsistencyRow[] = []
  for (let index = 0; index < await triggers.count(); index += 1) {
    const trigger = triggers.nth(index)
    const intersectsViewport = await trigger.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return rect.right > 0 && rect.bottom > 0 && rect.left < window.innerWidth && rect.top < window.innerHeight
    })
    if (!intersectsViewport) continue
    const selector = await trigger.evaluate((element) => {
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
      const disabledContrastRows = await collectContrast(page, context, 'disabled', selector, { measure: 'text' })
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
    const controlsId = await trigger.getAttribute('aria-controls')
    const popup = controlsId
      ? page.locator(`[id="${controlsId.replaceAll('"', '\\"')}"]`)
      : page.locator('[role="listbox"], [role="menu"]').filter({ visible: true }).last()
    const opened = await trigger.getAttribute('aria-expanded') === 'true' && await popup.isVisible().catch(() => false)
    const popupEvidence = opened
      ? await popup.evaluate((element) => {
          const rect = element.getBoundingClientRect()
          const activeId = element.getAttribute('aria-activedescendant')
          const active = activeId ? document.getElementById(activeId) : element.querySelector<HTMLElement>('[aria-selected="true"], [role="option"]')
          const selected = element.querySelector<HTMLElement>('[role="option"][aria-selected="true"], [role="option"][aria-checked="true"]')
          const activeRect = active?.getBoundingClientRect()
          return {
            popupContained: rect.left >= -1 && rect.top >= -1 && rect.right <= window.innerWidth + 1 && rect.bottom <= window.innerHeight + 1,
            activeReachable: Boolean(activeRect && activeRect.bottom >= rect.top - 1 && activeRect.top <= rect.bottom + 1),
            selectedEvidence: Boolean(selected),
            selectedSelector: selected?.id ? `#${CSS.escape(selected.id)}` : '',
            popup: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
          }
        })
      : { popupContained: false, activeReachable: false, selectedEvidence: false, selectedSelector: '', popup: null }
    const openContrastRows = opened
      ? await collectContrast(page, context, 'open', selector, { measure: 'both' })
      : []
    const selectedContrastRows = opened && popupEvidence.selectedSelector
      ? await collectContrast(page, context, 'selected', popupEvidence.selectedSelector, { measure: 'text' })
      : []
    const openTextContrast = minimumObservedRatio(openContrastRows, 'text')
    const openBoundaryContrast = minimumObservedRatio(openContrastRows, 'boundary')
    const selectedTextContrast = minimumObservedRatio(selectedContrastRows, 'text')

    const activeOptionId = async (): Promise<string> => {
      const popupActive = await popup.getAttribute('aria-activedescendant').catch(() => null)
      if (popupActive) return popupActive
      const triggerActive = await trigger.getAttribute('aria-activedescendant')
      if (triggerActive) return triggerActive
      return (await popup.locator('[role="option"]:focus, [role="option"][data-active="true"]').first().getAttribute('id').catch(() => null)) ?? ''
    }
    const activeBeforeArrow = await activeOptionId()
    await page.keyboard.press('ArrowDown')
    const activeAfterArrow = await activeOptionId()
    const arrowKey = Boolean(activeAfterArrow && activeAfterArrow !== activeBeforeArrow)
    const typeaheadTarget = opened
      ? await popup.locator('[role="option"]:not([aria-disabled="true"])').evaluateAll((options, activeId) => {
          const activeIndex = options.findIndex((option) => option.id === activeId)
          const keys = [...new Set(options.map((option) => option.textContent?.trim().slice(0, 1).toLocaleLowerCase() ?? '').filter(Boolean))]
          for (const key of keys) {
            for (let offset = 1; offset <= options.length; offset += 1) {
              const start = activeIndex < 0 ? -1 : activeIndex
              const target = options[(start + offset) % options.length]
              if (target?.textContent?.trim().toLocaleLowerCase().startsWith(key)) {
                if (target.id !== activeId) return { key, targetId: target.id }
                break
              }
            }
          }
          return { key: '', targetId: '' }
        }, activeAfterArrow)
      : { key: '', targetId: '' }
    if (typeaheadTarget.key) await page.keyboard.press(typeaheadTarget.key)
    const activeAfterTypeahead = await activeOptionId()
    const typeahead = Boolean(typeaheadTarget.key && typeaheadTarget.targetId && activeAfterTypeahead === typeaheadTarget.targetId)

    await page.keyboard.press('Escape')
    const escapeDismissed = await trigger.getAttribute('aria-expanded') !== 'true'
    const focusReturnedAfterEscape = await trigger.evaluate((element) => document.activeElement === element)
    if (!escapeDismissed) await page.mouse.click(1, 1)

    await trigger.focus()
    await trigger.click()
    await page.mouse.click(1, 1)
    const outsideDismissed = await trigger.getAttribute('aria-expanded') !== 'true'
    if (!outsideDismissed) await page.keyboard.press('Escape')

    await trigger.focus()
    await trigger.click()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    const enterSelected = await trigger.getAttribute('aria-expanded') !== 'true'
    const focusReturnedAfterEnter = await trigger.evaluate((element) => document.activeElement === element)
    if (!enterSelected) await page.keyboard.press('Escape')

    const colors = await trigger.evaluate((element) => {
      const style = getComputedStyle(element)
      return { foreground: style.color, background: style.backgroundColor }
    })
    const closedContrastRows = await collectContrast(page, context, 'selected', selector, { measure: 'text' })
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
