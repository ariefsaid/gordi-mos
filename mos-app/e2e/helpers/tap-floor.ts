/**
 * GUARD-TAP — the ONE rendered-geometry assertion behind every phone tap-target guard.
 *
 * Lives in helpers/ rather than in a spec so the guards that need it can import it without
 * importing (and re-registering) another file's tests: `guards.geometry.spec.ts` runs it over
 * the sampled app surfaces and the auth cards, and `auth-recovery.spec.ts` runs it over the
 * set-password form at the one point in the suite that form is on screen.
 *
 * Two halves of the same DESIGN.md contract, both measured on the REAL rendered box:
 *   size       §Responsive → Phone: "every required tap target is at least 44×44px"
 *   separation §Breakpoint inventory → coarse-pointer floors: "8px between adjacent targets"
 * A size floor without a separation floor makes a mistap MORE likely, not less — two 44px boxes
 * 4px apart are easier to hit wrongly than two 32px boxes 4px apart.
 */
import { expect, type Page } from '@playwright/test'

/** 44px floor, 0.5px sub-pixel tolerance — anything lower is a real regression. */
export const TAP_FLOOR = 43.5

/** DESIGN.md coarse-pointer floor: 8px between adjacent targets. */
export const TAP_GAP = 8

/**
 * The auth-card control census is closed: inputs, buttons, and the one <a> ("Back to sign in")
 * are every interactive element the auth cards render.
 */
export const AUTH_CONTROLS = '.auth-card :is(input, button, a)'

export type TapFloorOptions = {
  /** 'height' = the sampled-surface floor. 'both' = DESIGN.md's full 44×44. */
  axes?: 'height' | 'both'
  /** When set, vertically adjacent controls must sit at least this many px apart. */
  minGap?: number
  /** Also assert the surface never pushes the document wider than the viewport. */
  noOverflow?: boolean
}

type Box = { label: string; x: number; y: number; width: number; height: number }

async function measure(page: Page, selector: string, surface: string): Promise<Box[]> {
  const controls = page.locator(selector).locator('visible=true')
  const count = await controls.count()
  expect(count, `${surface}: expected interactive controls to exist`).toBeGreaterThan(0)

  const boxes: Box[] = []
  for (let i = 0; i < count; i += 1) {
    const el = controls.nth(i)
    const b = await el.boundingBox()
    if (!b) continue
    let label = (await el.innerText().catch(() => '')).trim().slice(0, 40).replace(/\s+/g, ' ')
    if (!label) label = `input[type=${await el.getAttribute('type')}]`
    boxes.push({ label, ...b })
  }
  return boxes
}

export async function assertTapFloor(
  page: Page,
  selector: string,
  surface: string,
  { axes = 'height', minGap, noOverflow = false }: TapFloorOptions = {},
): Promise<void> {
  const boxes = await measure(page, selector, surface)

  const undersized = boxes
    .filter((b) => b.height < TAP_FLOOR || (axes === 'both' && b.width < TAP_FLOOR))
    .map((b) => `${surface} "${b.label}" → ${Math.round(b.width)}×${Math.round(b.height)}px`)
  expect(
    undersized,
    `${surface}: every control must be ≥${axes === 'both' ? '44×44' : '44px tall'} on phone`,
  ).toEqual([])

  if (minGap !== undefined) {
    const crowded: string[] = []
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]
        const c = boxes[j]
        // Only controls stacked ABOVE one another can be mistaken for each other on the way to
        // a target; a side-by-side pair is separated by the horizontal run, which this test skips.
        if (Math.min(a.x + a.width, c.x + c.width) - Math.max(a.x, c.x) <= 0) continue
        const [top, bottom] = a.y <= c.y ? [a, c] : [c, a]
        const gap = bottom.y - (top.y + top.height)
        if (gap < 0) continue // nested or overlapping boxes are not a two-target seam
        if (gap < minGap) {
          crowded.push(`${surface} "${top.label}" → "${bottom.label}" = ${gap.toFixed(1)}px`)
        }
      }
    }
    expect(crowded, `${surface}: adjacent tap targets must sit ≥${minGap}px apart`).toEqual([])
  }

  if (noOverflow) {
    const width = page.viewportSize()?.width ?? 0
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    )
    expect(overflows, `${surface}: no horizontal overflow at ${width}px`).toBe(false)
  }
}
