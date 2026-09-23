// The component-states harness (#404, OD-WAY-74 #5) — the only layer that catches a shared
// component losing its loading/empty/error states, because PRs never render.
//
// WHERE IT RUNS, AND WHEN (written down on purpose — an unenforced quality layer is what
// produced #404): ON DEMAND, from mos-app/ —
//   npm run storybook        — dev workbench at :6006
//   npm run build-storybook  — static build; the cheap "every story still compiles+renders" proof
//   npm run test-storybook   — the enforcement run: per-story viewport (incl. phone-390) +
//                              a11y test:'error' via .storybook/test-runner.ts; needs a browser
//   npm run storybook:matrix — coverage check vs the spec (needs the local docs/ repo)
// It is NOT a CI lane: the browser run needs an environment CI does not provide today, and CI
// gates only machine-decidable things it can actually run. The review battery runs it at PR time.
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

// Public repo, shared machines: no usage telemetry from ANY entry point,
// not only the wrapper script that already set the env var.
const config: StorybookConfig = {
  stories: ['../src/stories/v3/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-a11y'],
  staticDirs: ['../public'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  core: { disableTelemetry: true },
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
