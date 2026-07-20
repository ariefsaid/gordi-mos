import type { TestRunnerConfig } from '@storybook/test-runner'
import { getStoryContext, waitForPageReady } from '@storybook/test-runner'

const STORYBOOK_VIEWPORTS = {
  desktop1280: { width: 1280, height: 900 },
  intermediate: { width: 1024, height: 900 },
  phone390: { width: 390, height: 844 },
} as const

const config: TestRunnerConfig = {
  async preVisit(page, context) {
    const story = await getStoryContext(page, context)
    const parameters = (story as unknown as { parameters?: { v3Viewport?: string } }).parameters
    const viewportValue = parameters?.v3Viewport ?? 'desktop1280'
    const viewport = STORYBOOK_VIEWPORTS[viewportValue as keyof typeof STORYBOOK_VIEWPORTS] ?? STORYBOOK_VIEWPORTS.desktop1280
    await page.setViewportSize(viewport)
  },
  async postVisit(page) {
    await waitForPageReady(page)
  },
}

export default config
