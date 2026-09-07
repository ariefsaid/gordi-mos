// AC-430 [e2e — curated journey F1] — post a Signal, mention fan-out, Inbox delivery, card actions.
//
// Real cross-stack proof: PostgREST + RLS (mos.can_read_signal / mos.can_post_signal_for_team) +
// the SECURITY DEFINER fan-out RPC (mos.fan_out_signal_mention) + the Inbox deep-link. Mirrors the
// two-persona pattern of AC-090 (localStorage.clear() + re-login swaps the browser session).
//
// Journey (docs/specs/signals-v1.spec.md §9 AC-430): a floor member on Home at 390px opens the
// composer, types an observation, @-mentions a teammate, presses Share Signal; the Signal appears
// at the top of the Home feed; the mentioned teammate receives an Inbox notification; opening the
// card/record lets them Add category and Create follow-up Task.

import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { VIEWER, MANAGER, AUTHOR } from './fixtures/users'

test.use({ viewport: { width: 390, height: 844 } })

test('AC-430: post a Signal, @-mention a teammate, Inbox delivery, Add category + Create follow-up Task available', async ({ page }) => {
  test.setTimeout(90_000)
  const stamp = Date.now().toString()
  const body = `AC-430 freezer alarm ${stamp}`

  // ── ACT 1: VIEWER (Cahya, floor member) opens the composer and shares a Signal ──────────────
  await loginAs(page, VIEWER.email, VIEWER.password)
  await page.waitForURL((url) => url.pathname === '/mos/' || url.pathname === '/mos')

  // Phone chrome: the "+" Action Launcher opens the shared ⌘K command registry (no floating FAB,
  // DESIGN.md No-FAB Rule) — Share Signal is one of its universal actions (FR-417).
  await page.getByRole('button', { name: 'Open actions' }).click()
  await expect(page.getByRole('dialog', { name: 'Command menu' })).toBeVisible()
  await page.getByRole('option', { name: 'Share Signal' }).click()

  const composer = page.getByRole('dialog', { name: /share signal/i })
  await expect(composer).toBeVisible()

  const contentBox = composer.getByRole('textbox', { name: /what happened/i })
  await contentBox.fill(body)
  await contentBox.pressSequentially(' @Dewi')
  await expect(composer.getByRole('listbox', { name: /mention/i })).toBeVisible()
  await composer.getByRole('option', { name: /Dewi Director/i }).click()

  await composer.getByRole('button', { name: 'Share Signal', exact: true }).click()
  await expect(composer).not.toBeVisible({ timeout: 10_000 })

  // The Home signal feed is refreshed after the composer closes; reload the collection before
  // asserting the newly committed signal (the feed query is not an optimistic composer cache).
  await page.reload()
  await page.waitForURL((url) => url.pathname === '/mos/' || url.pathname === '/mos')
  const feedButton = page.getByRole('button', { name: body })
  await expect(feedButton).toBeVisible({ timeout: 10_000 })

  // ── SIGNOUT: clear Cahya's session so Dewi can log in (mirrors AC-090's swap pattern) ───────
  await page.evaluate(() => localStorage.clear())
  await page.waitForTimeout(500)

  // ── ACT 2: MANAGER (Dewi, the mentioned teammate) checks the Inbox ──────────────────────────
  await loginAs(page, MANAGER.email, MANAGER.password)
  await page.goto('inbox')
  await page.waitForURL(/\/inbox$/)

  // Scoped by THIS run's unique body — repeated suite runs accumulate unread mention
  // notifications (each run posts a fresh Signal), so the generic aria-label alone is ambiguous.
  const notificationRow = page
    .getByRole('button', { name: /You were mentioned in a Signal \(unread\)/i })
    .filter({ hasText: body })
  await expect(notificationRow).toBeVisible({ timeout: 15_000 })
  await notificationRow.click()

  // RULED inbox behavior (JQ-4 → interaction-consistency item 9 [RULED I1/D-A4]; inbox-record-door.tsx): the notification
  // opens the actionable record preview in place; full-page navigation is an explicit second step.
  const panel = page.getByRole('dialog')
  await expect(panel).toBeVisible({ timeout: 10_000 })
  await expect(panel.getByLabel('Message').getByText(body, { exact: false })).toBeVisible({ timeout: 10_000 })
  await expect(panel.getByRole('button', { name: /add category/i })).toBeVisible()
  await expect(panel.getByRole('button', { name: /create follow-up task/i })).toBeVisible()
  await panel.getByRole('button', { name: 'Open full page' }).click()
  await page.waitForURL(/\/work\/signals\/[0-9a-f-]{36}/, { timeout: 10_000 })
  // SignalRecordPage is a focused page surface, not an article landmark; scope to its main
  // content and preserve the record message/action assertions.
  const record = page.locator('main')
  await expect(record).toBeVisible({ timeout: 10_000 })
  await expect(record.getByLabel('Message').getByText(body, { exact: false })).toBeVisible()
  await expect(record.getByRole('button', { name: /add category/i })).toBeVisible()
  await expect(record.getByRole('button', { name: /create follow-up task/i })).toBeVisible()
})

// AC-015 [e2e — curated journey F1, extends AC-430] — Urgent post fans out signal_urgent to
// every Team lead of the owning-Team business unit, AND a mentioned lead is not notified twice.
//
// Journey (docs/specs/inbox-sources.spec.md §9 AC-015): Bulan (a Cikal Bar member, not a lead)
// posts an Urgent Signal to Cikal Bar mentioning Dewi at 390px; Cahya (a Cikal Bar lead) opens
// /inbox and sees a row titled "Urgent Signal in Cikal Bar" — the signal_urgent delivery from
// the fan-out. Dewi opens /inbox and sees ONE "You were mentioned in a Signal" row carrying the
// Urgent pill from the metadata attention capture; there is no duplicate signal_urgent row for
// Dewi (mention wins).
test('AC-015: Urgent Signal fans out to a lead and to the mentioned person once with the Urgent pill', async ({ page }) => {
  test.setTimeout(90_000)
  const stamp = Date.now().toString()
  const body = `AC-015 urgent freezer alarm ${stamp}`

  // ── ACT 1: AUTHOR (Bulan, Cikal Bar member) opens the composer and shares an Urgent Signal
  //           mentioning Dewi ─────────────────────────────────────────────────────────────────
  await loginAs(page, AUTHOR.email, AUTHOR.password)
  await page.waitForURL((url) => url.pathname === '/mos/' || url.pathname === '/mos')

  await page.getByRole('button', { name: 'Open actions' }).click()
  await expect(page.getByRole('dialog', { name: 'Command menu' })).toBeVisible()
  await page.getByRole('option', { name: 'Share Signal' }).click()

  const composer = page.getByRole('dialog', { name: /share signal/i })
  await expect(composer).toBeVisible()

  const contentBox = composer.getByRole('textbox', { name: /what happened/i })
  await contentBox.fill(body)
  await contentBox.pressSequentially(' @Dewi')
  await expect(composer.getByRole('listbox', { name: /mention/i })).toBeVisible()
  await composer.getByRole('option', { name: /Dewi Director/i }).click()

  // Owning-Team pick: Cikal Bar. The Team picker lists the author's team memberships; Cikal Bar
  // is Bulan's live membership so it is one option.
  const teamPicker = composer.getByRole('combobox', { name: /team|owning team/i })
  if (await teamPicker.isVisible().catch(() => false)) {
    await teamPicker.selectOption({ label: 'Cikal Bar' })
  }

  // Attention pick: Urgent. The composer defaults to FYI; explicitly raise it.
  const attentionPicker = composer.getByRole('combobox', { name: /attention/i })
  await attentionPicker.selectOption({ label: 'Urgent' })

  await composer.getByRole('button', { name: 'Share Signal', exact: true }).click()
  await expect(composer).not.toBeVisible({ timeout: 10_000 })

  await page.evaluate(() => localStorage.clear())
  await page.waitForTimeout(500)

  // ── ACT 2: VIEWER (Cahya, Cikal Bar lead) — receives the signal_urgent delivery ─────────────
  await loginAs(page, VIEWER.email, VIEWER.password)
  await page.goto('inbox')
  await page.waitForURL(/\/inbox$/)

  const leadRow = page.getByRole('button', { name: /Urgent Signal in Cikal Bar/i }).filter({ hasText: body })
  await expect(leadRow).toBeVisible({ timeout: 15_000 })

  await page.evaluate(() => localStorage.clear())
  await page.waitForTimeout(500)

  // ── ACT 3: MANAGER (Dewi, mentioned) — receives ONE row with the Urgent pill; no duplicate ─
  await loginAs(page, MANAGER.email, MANAGER.password)
  await page.goto('inbox')
  await page.waitForURL(/\/inbox$/)

  const mentionRows = page.getByRole('button', { name: /You were mentioned in a Signal/i }).filter({ hasText: body })
  await expect(mentionRows).toHaveCount(1, { timeout: 15_000 })
  // The Urgent pill is rendered off metadata.attention; the mention row carries it because the
  // fan-out stamps attention on the delivered notification (AC-013).
  await expect(mentionRows.first().getByText(/Urgent/i)).toBeVisible()
  // And there is NO signal_urgent row for Dewi for this Signal — mention wins.
  const dupUrgent = page.getByRole('button', { name: /Urgent Signal in Cikal Bar/i }).filter({ hasText: body })
  await expect(dupUrgent).toHaveCount(0)
})
