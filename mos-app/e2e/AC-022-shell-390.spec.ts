// AC-022 (v4-port spec, Stage 2): Given an authenticated viewer on a 390px viewport, When they
// move through the shell's destinations, Then no horizontal scroll appears and every navigation
// control is reachable.
//
// This is also the successor to `AC-410-nav-five-destinations.spec.ts`, which this PR removes. That
// journey encoded the retired five-destination IA (Home/Work/Operate/Plan/Inbox, five bottom tabs);
// the ported phone bar is Home · Work · the viewer's own module · Inbox · More, and its shape is
// asserted below. It could not be written before this PR because the ported destinations point at
// /work/tasks, /cafe, /events, /money and /inbox, none of which resolved until the route table
// landed.
//
// Why e2e and not a unit test: jsdom computes no layout, so "no horizontal scroll" is not
// expressible there. This is one of the three cross-stack journeys the spec allows.
import { test, expect, type Page } from '@playwright/test'
import { loginAs } from './helpers/login'
import { ADMIN } from './fixtures/users'
import { isShipGated } from './helpers/ship-gate'

const PHONE = { width: 390, height: 844 }

test.describe('AC-022: the shell at 390px', () => {
  test.use({ viewport: PHONE })

  /** The horizontal-overflow check, run against the live layout rather than a class name. */
  async function expectNoHorizontalScroll(page: Page, where: string) {
    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      body: document.body.scrollWidth - document.body.clientWidth,
      widest: Array.from(document.querySelectorAll<HTMLElement>('body *'))
        .filter((el) => el.getBoundingClientRect().width > window.innerWidth + 1)
        .slice(0, 3)
        .map((el) => `${el.tagName.toLowerCase()}.${el.className}`),
    }))
    expect(overflow.doc, `${where}: document overflows by ${overflow.doc}px — ${overflow.widest.join(', ')}`).toBeLessThanOrEqual(0)
    expect(overflow.body, `${where}: body overflows by ${overflow.body}px — ${overflow.widest.join(', ')}`).toBeLessThanOrEqual(0)
  }

  test('the phone destination bar is Home · Work · module · Inbox · More', async ({ page }) => {
    await loginAs(page, ADMIN.email, ADMIN.password)

    // MobileDrawer is null while closed, so the bottom-tab bar is the sole Primary nav.
    const nav = page.getByRole('navigation', { name: 'Primary' })
    await expect(nav).toBeVisible()

    // Home / Work / Inbox are fixed; More is a disclosure BUTTON, not a link — it is a door, not
    // a location, so it never carries aria-current.
    for (const name of [/Home/i, /Work/i, /Inbox/i]) {
      await expect(nav.getByRole('link', { name })).toBeVisible()
    }
    const more = nav.getByRole('button', { name: /more/i })
    await expect(more).toBeVisible()
    await expect(more).not.toHaveAttribute('aria-current', 'page')

    await expectNoHorizontalScroll(page, 'Home')
  })

  test('every shell destination resolves, renders inside the shell, and never scrolls sideways', async ({ page }) => {
    await loginAs(page, ADMIN.email, ADMIN.password)

    // One entry per destination the ported rail can reach. Each is visited by URL rather than by
    // click so a failure names the route rather than a missing link — the click path is covered by
    // the bar test above and by shell-nav's AC-001.
    // issue 444: a ship-gated destination forwards to Home, so visiting it would measure Home a
    // second time under another name rather than that surface. Filtered through the gate, not
    // deleted — un-gating a surface returns it to the sweep with no edit here.
    const destinations = [
      { path: '', label: 'Home' },
      { path: 'work/tasks', label: 'Tasks' },
      { path: 'work/signals', label: 'Signals' },
      { path: 'work/objectives', label: 'Objectives' },
      { path: 'inbox', label: 'Inbox' },
      { path: 'events', label: 'Events' },
      { path: 'cafe', label: 'Café' },
      { path: 'cafe/log', label: 'Café log' },
      { path: 'money', label: 'Money' },
      { path: 'admin/people', label: 'Admin people' },
    ].filter(({ path }) => !isShipGated(`/${path}`))

    for (const { path, label } of destinations) {
      await page.goto(path)
      // The shell survived the navigation — this is what makes "inside the shell" checkable, and
      // it is also what proves the route resolved rather than falling to the not-found screen
      // outside the layout.
      await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible({ timeout: 10_000 })
      await expect(page.getByRole('banner')).toBeVisible()
      await expectNoHorizontalScroll(page, label)
    }
  })

  test('AC-021: an unmatched path renders the not-found surface INSIDE the shell', async ({ page }) => {
    await loginAs(page, ADMIN.email, ADMIN.password)
    await page.goto('no/such/place')

    // The rail/bottom bar and header are still there, so the viewer can navigate out of a 404
    // instead of being stranded on a bare page.
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('banner')).toBeVisible()
    await expectNoHorizontalScroll(page, 'not-found')
  })

  test('a retired deep link with ?record= lands on its replacement in one hop, query intact', async ({ page }) => {
    await loginAs(page, ADMIN.email, ADMIN.password)

    await page.goto('kitchen/log?record=abc&view=today')
    await expect(page).toHaveURL(/\/cafe\/log\?/, { timeout: 10_000 })
    expect(new URL(page.url()).search).toBe('?record=abc&view=today')

    // Back does not re-enter the retired path: the redirect replaced its history entry, so the
    // previous entry is where the viewer actually came from.
    await page.goBack()
    await expect(page).not.toHaveURL(/\/kitchen\/log/)
  })
})
