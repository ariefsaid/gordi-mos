import { defineConfig, devices } from '@playwright/test'
import baseConfig from './playwright.config'

export default defineConfig({
  ...baseConfig,
  reporter: 'list',
  projects: [
    { name: 'webkit-iphone', use: { ...devices['iPhone 13'] } },
    { name: 'webkit-desktop', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } } },
  ],
})
