import { defineConfig, devices } from '@playwright/test'
import baseConfig from './playwright.config'

export default defineConfig({
  ...baseConfig,
  reporter: 'list',
  projects: [
    { name: 'webkit-iphone', use: { ...devices['iPhone 13'], serviceWorkers: 'block' } },
    {
      name: 'webkit-desktop',
      use: { ...devices['Desktop Safari'], serviceWorkers: 'block', viewport: { width: 1440, height: 900 } },
    },
  ],
})
