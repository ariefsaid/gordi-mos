import { test, expect } from '@playwright/test'
import { ADMIN } from './fixtures/users'
import { AC204 } from './fixtures/tasks'
import { loginAs } from './helpers/login'
import { isShipGated } from './helpers/ship-gate'

/** The app is served under a basename, so every rendered href carries it. */
const href = (path: string) => `/mos${path}`

/**
 * AC-204 — progress rolls up from an Objective to its Projects/Processes and their Tasks, and the
 * viewer can drill from any of the three levels, on the records themselves.
 *
 * The cascade SCREEN is not coming back (OD-WAY-32), so the last case asserts its ABSENCE: a drill
 * that quietly grew a cascade door again would pass every other check here.
 *
 * Every number below is pinned to the fixtures global-setup seeds (`AC204` in fixtures/tasks.ts) —
 * deterministic, not whatever the database happens to hold.
 */
test.describe('AC-204: Objective roll-up and drill', () => {
  // issue 444 — this journey's surface is ship-gated (outside the MVP payload), so every entry
  // point forwards home and there is no door to walk through. Skipped on the gate itself, not
  // deleted: the journey is still true of the built surface and comes back the moment /work/objectives
  // leaves SHIP_GATED_PATHS.
  test.skip(isShipGated('/work/objectives'), 'ship-gated surface (issue 444) — no route, no nav')
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await loginAs(page, ADMIN.email, ADMIN.password)
  })

  // "Show relations" (the expand-panel trigger + catalog-relations panel) was retired on
  // purpose: the roll-up count and the one real child now render INLINE on the catalog row
  // itself (catalog-list-presentation.tsx), and drilling is the record page's own doing —
  // work_lines.objective_id renders as a real "Projects & Processes" relations section on an
  // Objective's canonical page (catalog-record-document.tsx / record-viewer.tsx), and the
  // "Objective" detail field on a Project/Process's page links back up the same way. Confirmed
  // live (2026-09-22): a hard load of /work/objectives/:id navigates by REAL <Link> (no
  // in-app-panel host on the standalone page), so `toHaveURL` after a click is a true assertion,
  // not a same-page panel swap.
  test('an Objective record carries its count roll-up and drills down to its Projects & Processes and their Tasks', async ({ page }) => {
    await page.goto(`work/objectives?q=${encodeURIComponent(AC204.objective.name)}`)
    await expect(page.getByRole('heading', { name: 'Objectives', level: 1 })).toBeVisible()

    const row = page.locator('.catalog-collection__row', { hasText: AC204.objective.name })
    await expect(row).toHaveCount(1)

    // Count roll-up only — no target, no percentage, no measure (OD-WAY-32) — and the one real
    // child's name and count, both inline on the row now.
    const { done, total } = AC204.counts.all
    await expect(row.getByTestId('catalog-progress')).toHaveText(`${done} / ${total} done`)
    await expect(row).not.toContainText('%')
    await expect(row).toContainText('Projects & Processes: 1')
    await expect(row).toContainText(AC204.launch.name)

    // Level 2 — the Objective's own canonical page lists a real door to the child record.
    await page.goto(`work/objectives/${AC204.objective.id}`)
    await expect(page.getByRole('heading', { name: AC204.objective.name, exact: true })).toBeVisible()
    const relations = page.getByRole('region', { name: 'Projects & Processes', exact: true })
    const child = relations.getByRole('link', { name: AC204.launch.name })
    await expect(child).toHaveAttribute('href', href(`/work/projects/${AC204.launch.id}`))
    await child.click()
    await expect(page).toHaveURL(new RegExp(`/work/projects/${AC204.launch.id}$`))
    await expect(page.getByRole('heading', { name: AC204.launch.name, exact: true })).toBeVisible()

    // Level 3: the child's own Tasks tab lists a real Task record door. Follow one — the drill
    // has to actually arrive.
    await page.getByRole('tab', { name: 'Tasks', exact: true }).click()
    await page.getByRole('link', { name: AC204.tasks.launchOpen.title }).click()
    await expect(page).toHaveURL(new RegExp(`/work/tasks/${AC204.tasks.launchOpen.id}`))
  })

  test('a Project/Process record drills UP to its parent Objective', async ({ page }) => {
    await page.goto(`work/projects/${AC204.launch.id}`)
    await expect(page.getByRole('heading', { name: AC204.launch.name, exact: true })).toBeVisible()

    // The "Objective" detail field is the up-drill: a real door, back to the same record.
    const objectiveField = page.getByRole('link', { name: AC204.objective.name, exact: true })
    await expect(objectiveField).toHaveAttribute('href', href(`/work/objectives/${AC204.objective.id}`))
    await objectiveField.click()
    await expect(page).toHaveURL(new RegExp(`/work/objectives/${AC204.objective.id}$`))
    await expect(page.getByRole('heading', { name: AC204.objective.name, exact: true })).toBeVisible()
  })

  // (Unlinked) → LOOSE: AC204.loose is a real Process with no objective_id, so its own task
  // (orphanLine) carries no objective hint. The retired "Show relations" panel used to prove
  // this task wasn't dropped by showing it under a (Unlinked) branch INSIDE the Process's own
  // relations panel; that panel is gone, but the same grouping still exists — and is still the
  // one place a reader would look for it — on the Tasks collection grouped by Objective
  // (task-collection-presentation.tsx rollup.group.unlinked), which test 4 below also exercises.
  test('a Task on a parentless Project/Process is not dropped — it shows under the (Unlinked) branch', async ({ page }) => {
    // tr.grp/tr.task-row below are the desktop table's DOM (tasks-table-body.tsx); below the
    // 768px table→card-list breakpoint (use-is-desktop.ts:7, DESIGN.md §Navigation OD-W4-4) the
    // product renders mobile-grouped-cards.tsx instead, which never has tr elements at all — the
    // suite's beforeEach sets a 390px phone viewport for every AC-204 test, so this assertion needs
    // its own desktop width to reach the DOM shape it actually reads.
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('work/tasks?view=all&group=objective')
    await expect(page.getByRole('heading', { name: 'Tasks', level: 1 })).toBeVisible()
    // The orphan sits INSIDE an (Unlinked) branch: the nearest group header above its row names
    // (Unlinked), not an Objective. Grouping by Objective renders one header per (Objective,
    // work line) branch, so several headers say (Unlinked); the orphan's own is what matters.
    const orphanRow = page.locator('tr.task-row').filter({ hasText: AC204.tasks.orphanLine.title })
    await expect(orphanRow).toHaveCount(1)
    const ownHeader = orphanRow.locator('xpath=preceding-sibling::tr[contains(@class, "grp")][1]')
    await expect(ownHeader).toContainText('(Unlinked)')
  })

  test('Mine, grouped by Objective, shows both synthetic branches and no one else\'s work', async ({ page }) => {
    await page.goto('work/tasks?view=my-work&group=objective')
    await expect(page.getByRole('heading', { name: 'Tasks', level: 1 })).toBeVisible()
    await expect(page.getByText(AC204.tasks.launchOpen.title)).toBeVisible()

    // Both synthetic branches render — they hold the work nobody is tracking.
    await expect(page.getByText('No Project/Process').first()).toBeVisible()
    await expect(page.getByText('(Unlinked)').first()).toBeVisible()

    // The Objective hint above a branch title is a real door back up to level 1 — the record's
    // own canonical id now (catalog-record-document.tsx relatedPath), not a name search.
    await expect(page.getByRole('link', { name: AC204.objective.name }).first())
      .toHaveAttribute('href', href(`/work/objectives/${AC204.objective.id}`))

    // Every one of ADMIN's three seeded tasks is here…
    for (const owned of [AC204.tasks.launchDone, AC204.tasks.launchOpen, AC204.tasks.directOnObj]) {
      await expect(page.getByText(owned.title)).toBeVisible()
    }
    // …and the one they neither own nor supervise is not.
    await expect(page.getByText(AC204.tasks.someoneElse.title)).toHaveCount(0)
  })

  test('offers no cascade navigation, and does not overflow a 390px phone', async ({ page }) => {
    for (const path of ['work/objectives', 'work/tasks?view=my-work&group=objective']) {
      await page.goto(path)
      await expect(page.locator('main')).toBeVisible()
      expect(await page.locator('a[href*="cascade"]').count()).toBe(0)
      await expect(page.locator('body')).not.toContainText('Cascade progress')
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    }
  })
})
