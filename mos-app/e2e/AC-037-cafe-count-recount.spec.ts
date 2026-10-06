import { expect, test } from '@playwright/test'
import { loginAs } from './helpers/login'
import { localSql } from './helpers/local-sql'
import { localSqlRead } from './helpers/local-sql-read'
import { BAR_MEMBER, COUNT_OPS_LEAD } from './fixtures/users'
import {
  COUNT_RECOUNT_FIXTURE,
  countRecountCatalogCleanupSql,
  countRecountCatalogSeedSql,
  countRecountCleanupSql,
} from './fixtures/count-recount'

test.afterEach(async () => {
  await localSql(countRecountCleanupSql)
  await localSql(countRecountCatalogCleanupSql)
})

function expectedSnapshotSql(): string {
  const itemKeys = COUNT_RECOUNT_FIXTURE.items.map(item => `'${item.productId}'`).join(', ')
  const cases = COUNT_RECOUNT_FIXTURE.items.map(item =>
    `WHEN item.esb_product_id = '${item.productId}' THEN ${item.expected}`,
  ).join('\n')
  return `
    SET LOCAL ROLE service_role;
    SELECT ops.record_cafe_count_expected_balance(line.id, CASE ${cases} END)
      FROM ops.cafe_count_lines line
      JOIN ops.wip_items item ON item.id = line.wip_item_id
     WHERE line.org_id = '${COUNT_RECOUNT_FIXTURE.orgId}'
       AND item.esb_product_id IN (${itemKeys})
       AND line.count_date = (statement_timestamp() AT TIME ZONE 'Asia/Jakarta')::date;
    RESET ROLE;
  `
}

test('AC-037 blind count → recount with reason → independent ops-lead confirm held, frozen, no ERP outbox', async ({ page }) => {
  await localSql(countRecountCleanupSql)
  await localSql(countRecountCatalogCleanupSql)
  await localSql(countRecountCatalogSeedSql())
  await loginAs(page, BAR_MEMBER.email, BAR_MEMBER.password)
  await page.goto('cafe/count')

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
    for (const item of COUNT_RECOUNT_FIXTURE.items) {
      await expect(page.getByLabel(`Count for ${item.name}`)).toBeVisible()
      const row = page.locator('.cafe-count__row').filter({ hasText: item.name })
      await expect(row.locator('.cafe-count__unit')).toHaveText(item.unitName)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  }

  const floorText = await page.locator('.cafe-count').innerText()
  expect(floorText).not.toMatch(/expected balance|variance|surplus|shortage/i)
  for (const item of COUNT_RECOUNT_FIXTURE.items) {
    await page.getByLabel(`Count for ${item.name}`).fill(item.firstCount)
  }
  await page.getByRole('button', { name: 'Submit Count' }).click()
  await expect(page.getByText('Submitted').first()).toBeVisible()
  await localSql(expectedSnapshotSql())

  await page.reload()
  const mismatch = COUNT_RECOUNT_FIXTURE.items.find(item => 'recount' in item)
  if (!mismatch || !('recount' in mismatch)) throw new Error('Count fixture must have one recount item')
  await expect(page.getByText('This item differs. Recount it, then explain if it still differs.')).toBeVisible()
  const blindPromptText = await page.locator('.cafe-count').innerText()
  expect(blindPromptText).not.toMatch(/expected balance|variance|surplus|shortage/i)
  expect(blindPromptText).not.toContain(mismatch.expected)

  await page.getByLabel(`Recount for ${mismatch.name}`).fill(mismatch.recount)
  await page.getByRole('button', { name: 'Submit recount' }).click()
  await expect(page.getByText('This item still differs. Add a reason to continue.')).toBeVisible()
  await page.getByLabel(`Reason for ${mismatch.name}`).fill(mismatch.reason)
  await page.getByRole('button', { name: 'Save reason' }).click()
  await expect(page.getByText('Recount and reason recorded. Waiting for review.')).toBeVisible()

  // Switch identity without carrying the counter's browser token into the review action.
  await loginAs(page, COUNT_OPS_LEAD.email, COUNT_OPS_LEAD.password)
  await page.goto('cafe/review')
  const reviewRow = page.locator('.cafe-count-review__row').filter({ hasText: mismatch.name })
  await expect(reviewRow).toBeVisible()
  await expect(reviewRow.getByText(mismatch.reason)).toBeVisible()
  await expect(reviewRow.getByText('-0.5', { exact: true })).toBeVisible()
  await expect(reviewRow.getByRole('button', { name: 'Confirm' })).toBeVisible()
  await reviewRow.getByRole('button', { name: 'Confirm' }).click()
  await expect(reviewRow.getByText('Confirmed · Not posted (held)')).toBeVisible()

  const verified = await localSqlRead<{
    status: string
    posting_status: string
    first_count: string
    recount: string
    reason: string
    outbox_count: number
  }>(`
    SELECT line.status,
           line.posting_status,
           line.counted_quantity::text AS first_count,
           line.recounted_quantity::text AS recount,
           line.reason,
           posting_switch.posting_enabled,
           (SELECT count(*)::int FROM integrations.esb_push WHERE source_module = 'cafe_count') AS outbox_count
      FROM ops.cafe_count_lines line
      JOIN ops.wip_items item ON item.id = line.wip_item_id
      JOIN ops.cafe_count_posting_switches posting_switch
        ON posting_switch.org_id = line.org_id AND posting_switch.branch_id = line.branch_id
     WHERE line.org_id = '${COUNT_RECOUNT_FIXTURE.orgId}'
       AND item.esb_product_id = '${mismatch.productId}'
       AND line.count_date = (statement_timestamp() AT TIME ZONE 'Asia/Jakarta')::date;
  `)
  expect(verified).toHaveLength(1)
  expect(verified[0]).toMatchObject({
    status: 'Confirmed', posting_status: 'held', reason: mismatch.reason,
    posting_enabled: false, outbox_count: 0,
  })
  expect(Number(verified[0].first_count)).toBe(Number(mismatch.firstCount))
  expect(Number(verified[0].recount)).toBe(Number(mismatch.recount))

  // The row is frozen after confirmation; failed mutation must leave the asserted snapshot intact.
  await expect(localSql(`
    UPDATE ops.cafe_count_lines line
       SET recounted_quantity = 99
      FROM ops.wip_items item
     WHERE item.id = line.wip_item_id
       AND line.org_id = '${COUNT_RECOUNT_FIXTURE.orgId}'
       AND item.esb_product_id = '${mismatch.productId}'
       AND line.count_date = (statement_timestamp() AT TIME ZONE 'Asia/Jakarta')::date;
  `)).rejects.toThrow('Local fixture SQL failed')
})
