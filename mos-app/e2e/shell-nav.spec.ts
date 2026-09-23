// AC-001: cross-section navigation journey (shell-level).
// Given a provisioned signed-in viewer on Home, When they navigate via the rail through Work's
// surfaces, Then at each one the URL, document.title and the aria-current rail entry agree, the
// surface itself renders, and a reload lands back on the same surface with all three intact.
//
// SUCCESSOR (#189) to the version parked by the app-shell chrome port (#188). That one walked the
// rail to /tasks, /updates and /ops — none of which is a rail entry any more: Tasks moved to
// /work/tasks, Weekly Updates is superseded by Signals at /work/signals, and the Daily Log is not
// in the ported IA at all. It could not be rewritten in #188 because the ported destinations did
// not resolve until the route table landed; they do now, so the journey is live again rather than
// fixme'd.
//
// The breadcrumb assertions the old version carried are deliberately NOT reproduced: #188 changed
// the breadcrumb grammar (leaf ownership, separator) and its own suite owns those invariants. This
// journey asserts what it is for — that the rail, the URL, the title and the surface stay in
// agreement across a navigation and a reload.
//
// AC-013 preserves the management/member distinction through the current Home brief.

import { test, expect } from '@playwright/test'
import { VIEWER, MANAGER, BAR_MEMBER } from './fixtures/users'
import { loginAs } from './helpers/login'
import { isShipGated } from './helpers/ship-gate'
import { selectTaskView, taskViewsGroup } from './helpers/tasks'

test('AC-001: shell cross-section navigation and reload', async ({ page }) => {
  // --- Pre-login: static HTML title is present on the login page ---
  await page.goto('login')
  await expect(page).toHaveURL(/\/login/)
  await expect(page).toHaveTitle('Gordi MOS — Management OS')

  // --- Setup: sign in and land on Home ---
  await loginAs(page, VIEWER.email, VIEWER.password)

  const nav = page.getByRole('navigation', { name: 'Primary' })

  // STALE (v4): Home's h1 is a time-dependent greeting ("Good afternoon, <name>" — see
  // src/i18n/messages.ts home.greeting.*), so no fixed heading name can match it. The stable
  // anchor is the document title below, set unconditionally by
  // useDocumentTitle(t('common.docTitle')) in src/pages/home-page.tsx.
  await expect(page).toHaveURL(/\/$|\/mos\/?$/)
  // toHaveTitle auto-retries — document.title is set by a React effect, not synchronously with the URL.
  await expect(page).toHaveTitle('Home — Gordi MOS')
  await expect(nav.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')

  // --- Work → Tasks ---
  await nav.getByRole('link', { name: 'Tasks' }).first().click()
  await expect(page).toHaveURL(/\/work\/tasks$/, { timeout: 5_000 })
  await expect(page).toHaveTitle('Tasks — Gordi MOS')
  // The current Tasks collection exposes its ownership/presentation choices as the named
  // "Task views" group of pressed-state chips (#870). It is present even when the collection is
  // empty, proving the real Tasks surface rendered rather than only the route.
  await expect(taskViewsGroup(page)).toBeVisible()
  await selectTaskView(page, 'My work')
  await expect(page).toHaveURL(/\/work\/tasks\?view=my-work$/)
  await page.reload()
  await expect(taskViewsGroup(page).getByRole('button', { name: 'My work', exact: true })).toHaveAttribute('aria-pressed', 'true')

  // --- Work -> Objectives ---
  // Was a rail click through to /work/objectives. issue 444 ship-gates that surface, so there is
  // no link to click: what the rail owes at a gated path is nothing at all. The walk continues to
  // Signals, which ships. Un-gate /work/objectives and the original leg belongs back here.
  if (isShipGated('/work/objectives')) {
    await expect(nav.getByRole('link', { name: 'Objectives' })).toHaveCount(0)
  } else {
    await nav.getByRole('link', { name: 'Objectives' }).click()
    await expect(page).toHaveURL(/\/work\/objectives$/, { timeout: 5_000 })
    await expect(nav.getByRole('link', { name: 'Objectives' })).toHaveAttribute('aria-current', 'page')
  }

  // --- Work → Signals ---
  await nav.getByRole('link', { name: 'Signals' }).first().click()
  // OD-V4-1 / use-record-collection.ts:108-118: synced Signals layout may settle as ?layout=feed.
  await expect(page).toHaveURL(/\/work\/signals(\?layout=feed)?$/, { timeout: 5_000 })
  // The Signals archive has now ported (#267) and this destination serves it, so the
  // "until it ports, this shows dev's weekly-update surface" arm above is retired — it would
  // now assert the title of a page this route no longer serves. Playwright runs only on
  // main-targeted PRs, so this had no chance to fail on the PR that changed the route.
  await expect(page).toHaveTitle('Signals — Gordi MOS')
  await expect(page.getByRole('heading', { name: 'Signals', level: 1 })).toBeVisible({ timeout: 8_000 })

  // --- Deep-link reload (FR-008) ---
  await page.reload()
  // OD-V4-1: cold-load canonicalization retains the synced ?layout=feed presentation.
  await expect(page).toHaveURL(/\/work\/signals\?layout=feed$/, { timeout: 5_000 })
  await expect(nav.getByRole('link', { name: 'Signals' }).first()).toHaveAttribute('aria-current', 'page')

  // --- A retired bookmark still works, in one hop, with its query intact (FR-015/FR-016) ---
  await page.goto('tasks?view=mine')
  await expect(page).toHaveURL(/\/work\/tasks\?view=mine$/, { timeout: 5_000 })
  await expect(taskViewsGroup(page)).toBeVisible()
})

// The management brief replaces the weekly-update team module. VIEWER is an Ops Lead;
// BAR_MEMBER supplies the ordinary-member contrast required by this scope journey.
test('AC-013: management scope reaches Objectives; ordinary members get their own work', async ({ page }) => {
  await loginAs(page, MANAGER.email, MANAGER.password)
  await expect(page).toHaveTitle('Home — Gordi MOS', { timeout: 10_000 })
  const objectives = page.getByRole('region', { name: 'Objectives', exact: true })
  await expect(objectives).toBeVisible()
  await objectives.getByRole('link', { name: 'See all →', exact: true }).click()
  await expect(page).toHaveURL(/\/work\/objectives$/)
  await expect(page.getByRole('heading', { name: 'Objectives', exact: true })).toBeVisible()

  // Sign out: open the user chip menu first, then click "Sign out" menu item
  await page.getByRole('button', { name: 'Dewi Director' }).click()
  await page.getByRole('menuitem', { name: /sign out/i }).click()
  await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })

  await loginAs(page, BAR_MEMBER.email, BAR_MEMBER.password)
  await expect(page).toHaveTitle('Home — Gordi MOS', { timeout: 10_000 })
  const ownWork = page.getByRole('tab', { name: /My open work/ })
  await expect(ownWork).toBeVisible()
  await ownWork.click()
  await expect(page.getByRole('tabpanel', { name: /My open work/ })).toBeVisible()
  await expect(objectives).toHaveCount(0)
})
