// AC-1010 — browser-back dirty-veto proof (V3 dirty-leave-guard, FR-V3-012 / DirtyLeaveGuardContract).
//
// The unit/RTL layer (docs/plans/2026-07-20-v3-record-viewer.md Task 3A + the task-drawer dirty-
// guard wiring) proves the Escape/Close dirty-veto journey against an injected OverlayHistoryDriver,
// but explicitly cannot drive a REAL browser popstate — this spec is the e2e half of that contract
// (docs/plans/briefs/v3-dirty-guard-brief.md step 4: "Back-path veto ... note in the report if it
// needs the e2e layer instead"). A real browser Back press while a Task drawer field draft is
// uncommitted must be vetoed by the retain/discard ConfirmDialog (the host's dirty browser-pop
// TRANSACTION, mos-app/src/shell/overlay-host.tsx ~line 363: it restores the pre-pop URL
// synchronously, then awaits the tenant-owned guard); Cancel must leave the record open with the
// draft intact; a second Back → Discard must complete the original browser navigation.
//
// Requires the live stack (local Supabase up) + the global-setup seed. Runs at the default desktop
// viewport (≥1100px) — the live split-view drawer via TasksWorkspace/OverlayHostSlot, NOT the
// standalone full-page OD-63 branch: `isTaskPageMode` (task-page-mode.ts) only escalates a POP to
// the full page when the SPA booted directly on that record id, which a fresh in-app row click
// (a PUSH) never triggers, and the guard TRANSACTION's own restore is a same-document POP too, so
// the split drawer (and its wired leaveGuard) stays mounted throughout.
//
// Note on the oracle: opening a task from the table (TasksWorkspace.onOpenTask → host.openRoot)
// does NOT change the URL pathname — `syncRouteMarker` (overlay-host.tsx) navigates to
// `location.pathname + location.search` (i.e. the SAME `/work/tasks`) and carries the open/depth
// state only in `location.state`'s `__mosOverlay` marker, so the address bar stays on
// `/work/tasks` for the whole journey (confirmed against the live app). This spec's oracle is
// therefore DOM state (the drawer's visibility/content and the field's value), matching what "the
// record stays open" / "the browser navigation actually completes" mean for the user, not a URL
// string that never changes here.
//
// Why the commit is STILL held IN FLIGHT (never fulfilled) here, even though the race this
// originally worked around is now fixed (see below): ModalShell auto-focuses the ConfirmDialog's
// Cancel button the instant it opens (its own a11y contract), which blurs the still-focused
// RecordField. Before the fix that stray blur ran RecordField's onBlur commit WHILE the "Discard
// unsaved changes?" dialog was open — this is D1 from the redesign's e2e-proofs report: a
// SUCCESSFUL settlement silently persisted the "unsaved" edit and cleared dirty, defeating
// Discard's semantics and letting a second Back skip the guard entirely. It is now fixed:
// TaskOverlayContent passes `fieldCommitsFrozen` (task-drawer.tsx) down through
// RecordViewer/RecordField for exactly the render in which the confirm dialog is open, so that
// stray blur is a no-op — see record-field.tsx's `commitsFrozen` header note for the full
// mechanism. (D2 — a FAILED settlement's optimistic rollback wiping the draft via RecordField's
// `useEffect([spec.value])` — was investigated separately and found already DEAD: that effect
// now also gates on `editingRef.current`, so an in-flight/just-failed edit is never re-baselined
// regardless of what the tenant's spec.value churns to; proven at
// src/components/records/record-field.test.tsx's "D2 (dead defect)" unit test.) This spec keeps
// holding the commit in flight anyway, deliberately, so it proves the retain/discard CONTRACT in
// total isolation from any commit-settlement timing at all — no field commit of any kind, stray
// or deliberate, is on the table while this journey runs. The variant test below removes that
// isolation on purpose: it lets a real commit settle (no route interception) to prove the FIX
// itself, not just the guard contract around it.

import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { createTaskViaUI } from './helpers/tasks'
import { VIEWER } from './fixtures/users'

test('AC-1010: browser Back on a dirty task draft is vetoed, Cancel keeps state, Discard completes the navigation', async ({ page }) => {
  await loginAs(page, VIEWER.email, VIEWER.password)
  await page.goto('work/tasks')
  await page.waitForURL(/\/work\/tasks$/)

  // Create our own task (VIEWER is R+A on it → editable) so the journey doesn't depend on shared
  // seed state other specs may have mutated, mirroring tasks-split-view.spec.ts's own pattern.
  const title = `Dirty veto ${Date.now()}`
  await createTaskViaUI(page, title)

  // Re-open from the list via an in-app row click (a PUSH) — the click-to-open path
  // (TasksWorkspace.onOpenTask → host.openRoot) is what wires the leaveGuard onto the live
  // overlay entry; a raw page.goto/reload straight onto the record URL would instead hard-load
  // the standalone OD-63 full-page branch, which has no drawer or guard to test here.
  await page.goto('work/tasks')
  await page.waitForURL(/\/work\/tasks$/)
  await page.getByText(title).first().click()

  const drawer = page.getByRole('complementary', { name: /task detail/i })
  await expect(drawer.getByRole('heading', { name: title })).toBeVisible({ timeout: 10_000 })

  // Hold any task PATCH in flight forever (never fulfilled/continued) — see the header note. GETs
  // (loading the task, refetching after events) pass through untouched.
  await page.route('**/rest/v1/tasks*', async (route) => {
    if (route.request().method() === 'PATCH') return // hang — do not fulfill/continue
    await route.continue()
  })

  // Value-first (E7 record grammar): a field renders its VALUE first; activate the Description
  // row to swap in the edit textarea before it can hold a draft at all.
  await drawer.getByRole('button', { name: 'Edit Description' }).click()

  // Make the field dirty: type into Description WITHOUT blurring first. RecordField reports dirty
  // on every keystroke (onChange, record-field.tsx `reportDirty`), before any onBlur commit fires
  // — a browser Back pressed while the field is still focused hits the guard mid-draft, exactly
  // like a real user typing then reaching for Back.
  const description = drawer.getByLabel('Description')
  const draftText = 'Dirty draft — should be vetoed by browser Back.'
  await description.fill(draftText)
  await expect(description).toHaveValue(draftText)

  // Press browser Back (the real gesture — react-router reports this as a POP regardless of
  // whether it's a same-SPA-session in-memory pop or a hard back-forward).
  await page.goBack()

  const confirmDialog = page.getByRole('dialog', { name: 'Discard unsaved changes?' })
  await expect(confirmDialog).toBeVisible({ timeout: 8_000 })
  await expect(confirmDialog).toContainText('Your edits are not saved. Discard them and leave this task?')

  // Cancel/Retain → the record stays open, draft intact — the dirty-pop TRANSACTION already
  // restored the pre-pop URL/state before the guard was even consulted.
  await confirmDialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(confirmDialog).toBeHidden()
  await expect(drawer.getByRole('heading', { name: title })).toBeVisible()
  await expect(description).toHaveValue(draftText)

  // Back again → the SAME draft is still dirty (the in-flight commit never resolved either way) →
  // the guard re-arms and vetoes a second time, proving this isn't a one-shot dialog.
  await page.goBack()
  const confirmDialog2 = page.getByRole('dialog', { name: 'Discard unsaved changes?' })
  await expect(confirmDialog2).toBeVisible({ timeout: 8_000 })

  // Discard this time → the browser navigation actually completes: the drawer closes (the host's
  // allow path re-performs the original pop: commit() + programmaticGo(delta), overlay-host.tsx
  // ~line 380-383).
  await confirmDialog2.getByRole('button', { name: 'Discard changes' }).click()
  await expect(drawer).toBeHidden({ timeout: 8_000 })
})

// AC-1010b — the D1 FIX proof, without the isolation crutch above: no route interception, a real
// PATCH is free to fire and settle against the live local stack if the fix ever regresses. Where
// the first test proves the retain/discard CONTRACT in total isolation from commit timing, this
// one proves the actual FIX: that ModalShell's auto-focus-driven stray blur (D1) never reaches
// the commit path at all, by (a) watching the network for a PATCH that should never be sent, and
// (b) reloading and re-opening the SAME task afterward to prove the persisted value on the server
// is still the untouched baseline — Discard actually discarded, nothing was silently saved.
test('AC-1010b: Back → dialog → Discard with a REAL commit settlement — nothing is silently saved (D1 fix proof)', async ({ page }) => {
  await loginAs(page, VIEWER.email, VIEWER.password)
  await page.goto('work/tasks')
  await page.waitForURL(/\/work\/tasks$/)

  const title = `Dirty veto real-commit ${Date.now()}`
  await createTaskViaUI(page, title)

  await page.goto('work/tasks')
  await page.waitForURL(/\/work\/tasks$/)
  await page.getByText(title).first().click()

  const drawer = page.getByRole('complementary', { name: /task detail/i })
  await expect(drawer.getByRole('heading', { name: title })).toBeVisible({ timeout: 10_000 })

  // No route interception — every request runs for real against the local stack. Track any PATCH
  // to the tasks endpoint so we can assert none ever fired for the stray-blur window below.
  const patchUrls: string[] = []
  page.on('request', (req) => {
    if (req.method() === 'PATCH' && /\/rest\/v1\/tasks/.test(req.url())) patchUrls.push(req.url())
  })

  // A freshly created task has no description — the clean baseline this test proves survives
  // the whole journey untouched.
  const descriptionField = drawer.locator('[data-field-key="description"]')
  await expect(descriptionField).toContainText('—')

  await drawer.getByRole('button', { name: 'Edit Description' }).click()
  const description = drawer.getByLabel('Description')
  const draftText = 'Real-commit draft — Discard must actually discard this.'
  await description.fill(draftText)
  await expect(description).toHaveValue(draftText)

  // Back → the leave-guard dialog opens. ModalShell's own mount effect auto-focuses its Cancel
  // button right here, firing a REAL native blur on the still-focused textarea — this is the
  // exact D1 race, now with a real PATCH free to settle if `commitsFrozen` ever regresses.
  await page.goBack()
  const confirmDialog = page.getByRole('dialog', { name: 'Discard unsaved changes?' })
  await expect(confirmDialog).toBeVisible({ timeout: 8_000 })

  // Discard → the drawer closes and the browser navigation completes for real.
  await confirmDialog.getByRole('button', { name: 'Discard changes' }).click()
  await expect(drawer).toBeHidden({ timeout: 8_000 })

  // No PATCH was ever sent — the stray blur never reached the commit path, so there was nothing
  // for the network layer to discard either.
  expect(patchUrls).toEqual([])

  // Reload (forces a real refetch, not client cache) and re-open the SAME task: the persisted
  // Description is still the untouched baseline, not the "discarded" draft.
  await page.reload()
  await page.getByText(title).first().click()
  const reopened = page.getByRole('complementary', { name: /task detail/i })
  await expect(reopened.getByRole('heading', { name: title })).toBeVisible({ timeout: 10_000 })
  await expect(reopened.locator('[data-field-key="description"]')).toContainText('—')
})
