import type { Page } from '@playwright/test'

export type SettlePage = (page: Page) => Promise<void>

/** Select the requested Café stream only on pages presenting the no-selection chooser. */
export async function selectStreamIfPrompted(
  page: Page,
  route: string,
  stream: string | undefined,
  settle: SettlePage,
): Promise<void> {
  if (!stream) {
    await settle(page)
    return
  }

  const chooser = page.locator('.cafe-stream-choices__list')
  const selectedStream = page.locator('[data-testid="cafe-stream"]')
  await Promise.any([
    chooser.waitFor({ state: 'visible', timeout: 10_000 }),
    selectedStream.waitFor({ state: 'visible', timeout: 10_000 }),
  ]).catch(() => undefined)

  if (await chooser.isVisible()) {
    const option = chooser.getByRole('button', { name: stream, exact: true })
    if (!(await option.isVisible())) {
      throw new Error(`stream "${stream}" is not offered by the picker on route ${route}`)
    }

    await option.click()
    await page.getByTestId('cafe-stream')
      .getByRole('heading', { name: stream, exact: true })
      .waitFor({ state: 'visible', timeout: 10_000 })
  }

  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  }))
  const loadingPage = page.locator('main[aria-busy="true"]')
  if (await loadingPage.isVisible()) {
    await loadingPage.waitFor({ state: 'hidden', timeout: 15_000 })
  }
  await settle(page)
}
