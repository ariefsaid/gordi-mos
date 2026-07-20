import { fileURLToPath } from 'node:url'
import type { StorybookConfig } from '@storybook/react-vite'
import tailwindcss from '@tailwindcss/vite'
import { mergeConfig, type Plugin } from 'vite'

const srcPath = fileURLToPath(new URL('../src', import.meta.url))
const tasksMockPath = fileURLToPath(new URL('../src/storybook/mocks/tasks.ts', import.meta.url))
const supabaseMockPath = fileURLToPath(new URL('../src/storybook/mocks/supabase.ts', import.meta.url))

const storybookServiceBoundary: Plugin = {
  name: 'v3-storybook-service-boundary',
  enforce: 'pre',
  resolveId(source) {
    if (source === '@/lib/db/tasks') return tasksMockPath
    if (source === '@/lib/supabase') return supabaseMockPath
    return null
  },
}

const serviceBoundaryAliases = [
  { find: /^@\/lib\/db\/tasks$/, replacement: tasksMockPath },
  { find: /^@\/lib\/supabase$/, replacement: supabaseMockPath },
  { find: '@', replacement: srcPath },
]

const config: StorybookConfig = {
  stories: ['../src/stories/v3/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-a11y'],
  staticDirs: ['../public'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  viteFinal: async (viteConfig) => {
    const finalConfig = mergeConfig(viteConfig, {
      resolve: { alias: serviceBoundaryAliases },
      plugins: [tailwindcss()],
    })

    // Keep the mock seam ahead of Storybook/Vite's own aliases. Production Vite
    // never loads this config, so these service replacements cannot leak into
    // the application build.
    finalConfig.resolve = { ...finalConfig.resolve, alias: serviceBoundaryAliases }
    finalConfig.plugins = [storybookServiceBoundary, ...(finalConfig.plugins ?? [])]
    return finalConfig
  },
}

export default config
