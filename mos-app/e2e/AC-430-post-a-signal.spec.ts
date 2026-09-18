// AC-430: approved org-wide post/tag, current Inbox triage, and Signal record lifecycle.
// OPEN-04/05 attention/push/new-source decisions are outside this journey.
import { test, expect } from './fixtures/signal-browser'
import { loginAs } from './helpers/login'
import { localSqlRead } from './helpers/local-sql-read'
import { assertTapFloor } from './helpers/tap-floor'
import { DEMO_PASSWORD } from '../src/pages/demo-personas'
import { messages } from '../src/i18n/messages'

// @e2e-owned-cleanup: captured-signal-ids

test.use({ viewport: { width: 390, height: 844 } })

for (const locale of ['en', 'id'] as const) {
  test(`AC-430: unrelated org targets, Inbox handled, history, retract and Repost at 390px (${locale})`, async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    const t = messages[locale]
    const body = `AC-430 observation ${locale} ${Date.now()}`
    const authorEmail = 'bulan.dev@example.test'
    const recipientEmail = 'fitri.dev@example.test'
    // Prove the seeded actors are active same-org members (the All Teams audience needs no Team).
    const [fixture] = await localSqlRead<{ eligible: boolean }>(`
      select (author.org_id = recipient.org_id
        and author.archived_at is null and recipient.archived_at is null) as eligible
      from shared.people author, shared.people recipient
      where author.email = '${authorEmail}' and recipient.email = '${recipientEmail}'
    `)
    expect(fixture?.eligible).toBe(true)
    await page.addInitScript((value) => localStorage.setItem('mos.locale', value), locale)
    await loginAs(page, authorEmail, DEMO_PASSWORD)
    await page.goto('work/signals')
    let failDirectory = true
    await page.route('**/rest/v1/people*', async (route) => {
      if (failDirectory) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'Directory unavailable' }) })
      } else await route.continue()
    })
    await page.getByRole('button', { name: t['actionLauncher.open'], exact: true }).click()
    await page.getByRole('option', { name: t['commandMenu.action.shareSignal'], exact: true }).click()
    const composer = page.getByTestId('signal-composer')
    const content = composer.locator('textarea')
    await content.fill(body)
    await expect(composer.getByText(t['signals.composer.directoryError'], { exact: true })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath(`${locale}-composer-retry.png`), animations: 'disabled' })
    failDirectory = false
    await composer.getByRole('button', { name: t['common.retry'], exact: true }).click()
    await expect(content).toHaveValue(body)
    await content.pressSequentially(' @Fitri')
    await composer.getByRole('option', { name: /Fitri Finance/ }).click()
    await expect(content).toBeFocused()
    await content.pressSequentially(' @Finance')
    await composer.getByRole('option', { name: /Finance Team/ }).click()
    await expect(content).toBeFocused()
    await assertTapFloor(page, '[data-testid="signal-composer"] button', 'Signal composer', { axes: 'both', noOverflow: true })
    await page.screenshot({ path: testInfo.outputPath(`${locale}-composer.png`) })
    await composer.getByRole('button', { name: t['signals.action.share'], exact: true }).click()
    await expect(composer).not.toBeVisible()
    const feedRow = page.locator('main [data-signal-id][role="button"]').filter({ hasText: body })
    await feedRow.click()
    await expect(page.getByRole('heading', { name: new RegExp(body) })).toBeVisible()
    await page.getByRole('button', { name: t['record.openFullPage'], exact: true }).click()
    await expect(page).toHaveURL(/\/work\/signals\/[0-9a-f-]{36}/)
    const signalUrl = page.url()
    await expect(page.getByRole('heading', { name: new RegExp(body) })).toBeVisible()
    await assertTapFloor(page, '.signal-record-control-row button', 'Signal record controls', { axes: 'both', noOverflow: true })
    await page.getByRole('button', { name: t['signals.record.addCategory'], exact: true }).click()
    await page.getByRole('listbox').last()
      .getByRole('option', { name: t['signals.category.quality'], exact: true }).click()
    const history = page.locator('.signal-history-toggle')
    await expect(history).toBeVisible()
    await history.click()
    await expect(page.locator('.signal-history-list')).toContainText(/Quality|quality|Kualitas/)
    await page.reload()
    await expect(page.getByRole('heading', { name: new RegExp(body) })).toBeVisible()
    await expect(history).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath(`${locale}-record.png`) })

    await page.evaluate(() => localStorage.clear())
    await loginAs(page, recipientEmail, DEMO_PASSWORD)
    await page.goto('inbox')
    const row = page.locator('.inbox-row').filter({ hasText: body }).first()
    await expect(row).toBeVisible()
    await row.locator('.inbox-row__button').focus()
    await expect(row.locator('.inbox-row__button')).toBeFocused()
    await assertTapFloor(page, '.inbox-triage__filters button, .inbox-row button', 'Inbox', { axes: 'both', noOverflow: true })
    await row.locator('.inbox-row__button').press('Enter')
    await expect(page.getByRole('heading', { name: new RegExp(body) })).toBeVisible()
    await page.goBack()
    await expect(row).toBeVisible()
    // Opening reads only: the explicit handle action must still be available.
    await row.getByRole('button', { name: t['inbox.markHandled'], exact: true }).click()
    await page.getByRole('button', { name: new RegExp(`^${t['inbox.filter.handled']}`) }).click()
    await expect(row).toBeVisible()
    await page.reload()
    await expect(row).toBeVisible()
    await expect(row.getByRole('button', { name: t['inbox.markHandled'], exact: true })).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath(`${locale}-inbox-handled.png`) })

    await page.evaluate(() => localStorage.clear())
    await loginAs(page, authorEmail, DEMO_PASSWORD)
    await page.goto(signalUrl)
    const more = page.getByRole('button', { name: t['signals.record.moreActions'], exact: true })
    await more.click()
    await page.keyboard.press('Escape')
    await expect(more).toBeFocused()
    await more.click()
    await page.getByRole('menuitem', { name: t['signals.record.retract'], exact: true }).click()
    const confirmation = page.getByRole('dialog', { name: t['signals.record.retractTitle'], exact: true })
    await expect(confirmation.getByRole('button', { name: t['signals.record.retract'], exact: true })).toBeDisabled()
    await confirmation.getByLabel(t['signals.record.retractReason']).fill('Incorrect destination')
    await confirmation.getByRole('button', { name: t['signals.record.retract'], exact: true }).click()
    await expect(page.locator('.signal-tombstone')).toContainText('Incorrect destination')
    await expect(page.locator('.signal-tombstone')).toContainText('Bulan Barista')
    await expect(page.getByRole('button', { name: t['signals.record.createFollowUpTask'], exact: true })).toHaveCount(0)
    await page.reload()
    await expect(page.locator('.signal-tombstone')).toContainText('Incorrect destination')
    await page.screenshot({ path: testInfo.outputPath(`${locale}-tombstone.png`) })
    await page.getByRole('button', { name: t['signals.record.repost'], exact: true }).click()
    await expect(content).toHaveValue(new RegExp(body))
    await content.fill(`${body} corrected`)
    await composer.getByRole('button', { name: t['signals.action.share'], exact: true }).click()
    await expect(composer).not.toBeVisible()
    await page.goto('work/signals')
    await page.locator('main [data-signal-id][role="button"]').filter({ hasText: `${body} corrected` }).click()
    await page.getByRole('button', { name: t['record.openFullPage'], exact: true }).click()
    expect(page.url()).not.toBe(signalUrl)
    await expect(page.getByRole('heading', { name: `${body} corrected`, exact: true })).toBeVisible()
  })
}
