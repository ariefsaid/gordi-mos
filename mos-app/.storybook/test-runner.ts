import type { TestRunnerConfig } from '@storybook/test-runner'
import { waitForPageReady } from '@storybook/test-runner'

const config: TestRunnerConfig = {
  async postVisit(page) {
    await waitForPageReady(page)
  },
}

export default config
