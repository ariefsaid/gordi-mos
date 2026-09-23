import { test, expect, type Request } from '@playwright/test'
import { loginAs } from './helpers/login'
import { MANAGER } from './fixtures/users'

for (const width of [1440, 390]) {
  test(`Home opens a Signal in a readable viewport panel at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(60_000)
    await page.setViewportSize({ width, height: 900 })
    await loginAs(page, MANAGER.email, MANAGER.password)
    const opener = page.getByRole('button', { name: /^Open signal:/ }).first()
    await expect(opener).toBeVisible({ timeout: 15_000 })
    await page.waitForLoadState('networkidle')
    const traffic: { path: string; query: string; startMs: number; responseMs?: number }[] = []
    const requests = new Map<Request, typeof traffic[number]>()
    const started = performance.now()
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (!url.pathname.includes('/rest/v1/')) return
      const item = { path: url.pathname.split('/rest/v1/')[1], query: url.search, startMs: performance.now() - started }
      traffic.push(item)
      requests.set(request, item)
    })
    page.on('response', (response) => {
      const item = requests.get(response.request())
      if (item) item.responseMs = performance.now() - started
    })
    await opener.evaluate((element) => {
      element.addEventListener('click', () => {
        const start = performance.now()
        const observe = () => {
          const title = document.querySelector('.signal-record-host .record-viewer__title')
          if (title && title.getBoundingClientRect().height > 0) {
            document.documentElement.dataset.signalHeaderMs = String(performance.now() - start)
          } else requestAnimationFrame(observe)
        }
        requestAnimationFrame(observe)
      }, { once: true })
    })
    await opener.click()
    const panel = page.getByRole(width === 390 ? 'dialog' : 'complementary', { name: 'Signal', exact: true })
    await expect(panel).toBeVisible()
    await expect(panel.locator('.record-viewer__title')).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.signalHeaderMs)).toBeTruthy()
    const activationToHeaderMs = Number(await page.evaluate(() => document.documentElement.dataset.signalHeaderMs))
    await page.waitForLoadState('networkidle')
    const primary = traffic.filter((item) => item.path === 'signals' && new URLSearchParams(item.query).has('id'))
    expect(primary).toHaveLength(1)
    expect(primary[0].responseMs).toBeDefined()
    const revisions = traffic.filter((item) => item.path === 'signal_revisions')
    expect(revisions).toHaveLength(1)
    expect(revisions[0].startMs).toBeGreaterThanOrEqual(primary[0].responseMs!)
    const taskReadsBeforeLink = traffic.filter((item) => item.path === 'tasks')
    expect(taskReadsBeforeLink.every((item) => new URLSearchParams(item.query).has('id'))).toBe(true)
    const beforeLink = traffic.length
    await panel.getByRole('button', { name: 'More Signal actions', exact: true }).click()
    await panel.getByRole('menuitem', { name: 'Link existing Task', exact: true }).click()
    const search = panel.getByRole('searchbox', { name: 'Search tasks', exact: true })
    await expect(search).toBeVisible()
    // More than the implemented 150 ms debounce: an untouched Link form must issue no candidate read.
    await page.waitForTimeout(250)
    expect(traffic.slice(beforeLink).filter((item) => item.path === 'tasks')).toHaveLength(0)
    const candidateResponse = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return url.pathname.endsWith('/tasks') && url.searchParams.has('title')
    })
    await search.fill('e2e')
    expect((await candidateResponse).ok()).toBe(true)
    await page.waitForLoadState('networkidle')
    const candidates = traffic.slice(beforeLink).filter((item) => item.path === 'tasks')
    expect(candidates).toHaveLength(1)
    expect(new URLSearchParams(candidates[0].query).get('title')).toBe('ilike.%e2e%')
    expect(new URLSearchParams(candidates[0].query).get('limit')).toBe('20')
    const evidence = { width, activationToHeaderMs, primaryReads: primary.length, taskReadsBeforeLink: taskReadsBeforeLink.length, emptyLinkCandidateReads: 0, typedCandidateReads: candidates.length, traffic }
    console.log('R8 measurement', JSON.stringify(evidence))
    await testInfo.attach('signal-read-timing.json', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' })
    await page.screenshot({ path: testInfo.outputPath(`signal-${width}.png`), fullPage: true })
    const bounds = await panel.boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.y).toBeLessThanOrEqual(60)
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(901)
    expect(bounds!.width).toBeGreaterThanOrEqual(360)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1)
    if (width === 1440) expect(bounds!.x).toBeGreaterThan(width / 2)
    else expect(bounds!.width).toBe(width)
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
    await expect(opener).toBeFocused()
  })
}
