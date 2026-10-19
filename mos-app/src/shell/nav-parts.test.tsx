import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { useT } from '@/i18n/use-t'
import type { PageGroup } from './module-registry'
import { PageLinks } from './nav-parts'

const EmptyIcon = () => null
const taskGroups: PageGroup[] = [{
  key: 'work',
  items: [{ path: '/work/tasks', label: 'Tasks', labelKey: 'nav.work.tasks', Icon: EmptyIcon }],
}]

function TaskPageLink() {
  const t = useT()
  return <PageLinks groups={taskGroups} pathname="/work" forPath={() => ({
    count: 9,
    displayText: t('rail.badge.openTasksShort', { count: 9 }),
    label: t('rail.badge.openTasks', { count: 9 }),
  })} />
}

describe('Tasks navigation count', () => {
  it('names the personal scope in visible and accessible text in EN and ID', () => {
    const locales = [
      { locale: 'en' as const, visible: 'Mine · 9', accessible: 'My open tasks: 9', page: 'Tasks' },
      { locale: 'id' as const, visible: 'Saya · 9', accessible: 'Tugas terbuka saya: 9', page: 'Tugas' },
    ]

    for (const locale of locales) {
      const view = render(
        <MemoryRouter>
          <I18nProvider initialLocale={locale.locale}>
            <TaskPageLink />
          </I18nProvider>
        </MemoryRouter>,
      )
      const link = screen.getByRole('link', { name: new RegExp(locale.page) })
      expect(within(link).getByText(locale.visible)).toBeInTheDocument()
      expect(within(link).getByLabelText(locale.accessible)).toBeInTheDocument()
      view.unmount()
    }
  })
})
