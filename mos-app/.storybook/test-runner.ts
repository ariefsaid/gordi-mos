import type { TestRunnerConfig } from '@storybook/test-runner'
import { getStoryContext, waitForPageReady } from '@storybook/test-runner'

const STORYBOOK_VIEWPORTS = {
  desktop1280: { width: 1280, height: 900 },
  intermediate: { width: 1024, height: 900 },
  phone390: { width: 390, height: 844 },
} as const

function viewportFromStoryId(id: string): keyof typeof STORYBOOK_VIEWPORTS {
  if (id.includes('intermediate')) return 'intermediate'
  if (id.includes('phone') || id.endsWith('--keyboard-journeys')) return 'phone390'
  return 'desktop1280'
}

const config: TestRunnerConfig = {
  async preVisit(page, context) {
    const fallbackViewport = viewportFromStoryId(context.id)
    let viewportValue: string | undefined

    // Storybook 10 can call preVisit before its preview-side __getContext bridge exists.
    // Use the story's v3Viewport metadata when the bridge is ready, then fall back to the
    // stable responsive story ids so an early bridge race never fails the test runner.
    try {
      const story = await getStoryContext(page, context)
      viewportValue = (story as unknown as { parameters?: { v3Viewport?: string } }).parameters?.v3Viewport
    } catch {
      viewportValue = undefined
    }

    const viewport = STORYBOOK_VIEWPORTS[viewportValue as keyof typeof STORYBOOK_VIEWPORTS] ?? STORYBOOK_VIEWPORTS[fallbackViewport]
    await page.setViewportSize(viewport)
  },
  async postVisit(page) {
    await waitForPageReady(page)
  },
}

export default config
