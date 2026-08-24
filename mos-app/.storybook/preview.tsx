import type { Decorator, Preview } from '@storybook/react-vite'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import '../src/storybook/setup'
import '../src/stories/v3/storybook.css'

const withRuntimeProviders: Decorator = (Story) => (
  <MemoryRouter initialEntries={['/work/tasks']}>
    <I18nProvider>
      <div className="v3-storybook-root">
        <Story />
      </div>
    </I18nProvider>
  </MemoryRouter>
)

const preview: Preview = {
  decorators: [withRuntimeProviders],
  parameters: {
    layout: 'fullscreen',
    a11y: {
      test: 'error',
    },
    viewport: {
      options: {
        desktop1280: {
          name: 'Desktop 1280',
          styles: { width: '1280px', height: '900px' },
        },
        intermediate: {
          name: 'Intermediate 1024',
          styles: { width: '1024px', height: '900px' },
        },
        phone390: {
          name: 'Phone 390',
          styles: { width: '390px', height: '844px' },
        },
      },
    },
  },
  initialGlobals: {
    viewport: { value: 'desktop1280', isRotated: false },
  },
}

export default preview
