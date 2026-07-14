// P3a Phase H / T32 — curated live cross-stack journey for Inbox + replay.
//
// Live-gated on purpose: this exercises the real agent-chat edge function + model tool choice, so
// it only runs when the owner has enabled SHOW_ASSISTANT/SHOW_INBOX and explicitly opted into the
// model-backed e2e with MOS_P3A_LIVE_E2E=1.

import { test, expect, type Page } from '@playwright/test'
import { loginAs } from './helpers/login'
import { VIEWER } from './fixtures/users'
import { SHOW_ASSISTANT } from '../src/config/features'

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function unreadCount(page: Page): Promise<number> {
  const label = await page.getByRole('button', { name: /^Inbox/ }).getAttribute('aria-label')
  const match = label?.match(/Inbox, (\d+) unread/)
  return match ? Number(match[1]) : 0
}

test.beforeEach(() => {
  test.skip(!SHOW_ASSISTANT, 'Assistant is flag-hidden (config/features.ts SHOW_ASSISTANT)')
  test.skip(
    process.env.MOS_P3A_LIVE_E2E !== '1',
    'P3a Inbox replay e2e is live-model gated; set MOS_P3A_LIVE_E2E=1 after model secrets are configured',
  )
})

test('AC-P3-RP-003 / AC-P3-IB-002/003: notify creates unread Inbox row; reload + replay preserves context', async ({ page }) => {
  await loginAs(page, VIEWER.email, VIEWER.password)

  const stamp = Date.now().toString()
  const title = `E2E P3a Inbox Replay ${stamp}`
  const prompt = [
    `${title}.`,
    'Use the notify tool to create an Inbox reminder with exactly that title.',
    `Use body "Replay marker ${stamp}".`,
    `After the notification is created, reply with "notified ${stamp}".`,
  ].join(' ')

  const before = await unreadCount(page)

  await page.getByRole('button', { name: 'Open deputy' }).click()
  await expect(page.getByRole('complementary', { name: 'Deputy' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Ask the deputy…' }).fill(prompt)
  await page.getByRole('button', { name: 'Send' }).click()

  await expect
    .poll(() => unreadCount(page), { timeout: 90_000, message: 'notify should increment the Inbox unread badge' })
    .toBeGreaterThan(before)

  await page.getByRole('button', { name: /^Inbox/ }).click()
  await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible()
  const row = page.getByRole('button', { name: `${title} (unread)` })
  await expect(row).toBeVisible({ timeout: 15_000 })
  await row.click()

  await expect
    .poll(() => unreadCount(page), { timeout: 15_000, message: 'opening the notification row marks it read' })
    .toBe(before)

  await page.reload()
  await page.getByRole('button', { name: 'Open deputy' }).click()
  await page.getByRole('button', { name: 'History' }).click()
  await page.getByRole('button', { name: new RegExp(escapeRegExp(title)) }).click()
  await expect(page.getByText(title).first()).toBeVisible()

  const occurrencesBeforeReplay = await page.getByText(title).count()
  await page.getByRole('textbox', { name: 'Ask the deputy…' }).fill(
    'Using only the conversation you just replayed, reply with the exact notification title from the previous turn.',
  )
  await page.getByRole('button', { name: 'Send' }).click()

  await expect
    .poll(() => page.getByText(title).count(), {
      timeout: 90_000,
      message: 'the follow-up should answer from replayed prior context',
    })
    .toBeGreaterThan(occurrencesBeforeReplay)
})
