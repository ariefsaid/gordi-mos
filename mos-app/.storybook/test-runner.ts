import type { TestRunnerConfig } from '@storybook/test-runner'
import { waitForPageReady } from '@storybook/test-runner'

const STORYBOOK_VIEWPORTS = {
  desktop1280: { width: 1280, height: 900 },
  intermediate: { width: 1024, height: 900 },
  phone390: { width: 390, height: 844 },
} as const

const config: TestRunnerConfig = {
  async preVisit(page, context) {
    // Storybook 10 can call preVisit before its preview-side __getContext bridge exists.
    // The enforced viewport stories have stable ids, so choose the browser viewport without
    // reaching into the preview runtime and avoid a timing-dependent test-runner failure.
    const id = context.id
    const viewportValue = id.includes('intermediate')
      ? 'intermediate'
      : id.includes('phone') || id.endsWith('--keyboard-journeys')
        ? 'phone390'
        : 'desktop1280'
    const viewport = STORYBOOK_VIEWPORTS[viewportValue as keyof typeof STORYBOOK_VIEWPORTS] ?? STORYBOOK_VIEWPORTS.desktop1280
    await page.setViewportSize(viewport)
  },
  async postVisit(page) {
    await waitForPageReady(page)
  },
}

export default config
