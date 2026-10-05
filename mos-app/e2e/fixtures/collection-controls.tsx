import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nProvider } from '../../src/i18n/I18nProvider'
import { useT } from '../../src/i18n/use-t'
import { CollectionToolbar } from '../../src/components/record-collection/collection-toolbar'
import '../../src/index.css'

const params = new URLSearchParams(location.search)
const locale = params.get('locale') === 'id' ? 'id' : 'en'

export function Fixture() {
  const t = useT()
  const [presentation, setPresentation] = useState(params.get('presentation') ?? 'table')
  const [status, setStatus] = useState('blocked')
  const [visible, setVisible] = useState(['title'])
  const [error, setError] = useState<string | null>('A saved view could not be loaded. Try again.')
  return <main id="collection-frame" style={{ marginLeft: innerWidth >= 768 ? 232 : 12, width: innerWidth >= 768 ? innerWidth - 256 - (params.has('deputy') ? 400 : 0) : innerWidth - 24 }}>
    <h1>Collection</h1>
    <CollectionToolbar
      className="tasks-collection-toolbar"
      collapseOptionsOnDesktop={params.has('door')}
      optionsActive optionsSummary="All · Business Unit · Person"
      presentation={{ label: 'Presentation', value: presentation, options: [{ value: 'table', label: 'Table' }, { value: 'feed', label: 'Feed' }], onChange: setPresentation }}
      views={{ label: 'Views', value: 'all', options: [{ value: 'all', label: t('tasks.saved.all') }], onChange: () => {} }}
      search={{ label: 'Search', value: '', placeholder: locale === 'id' ? 'Cari tugas' : 'Search tasks', onChange: () => {} }}
      filters={[
        { id: 'group', label: t('tasks.filter.group'), value: 'none', options: [{ value: 'none', label: locale === 'id' ? 'Kelompok: Tidak' : 'Group: None' }], onChange: () => {} },
        { id: 'business-unit', label: t('tasks.filter.businessUnit'), value: 'all', options: [{ value: 'all', label: locale === 'id' ? 'Unit bisnis: Semua unit' : 'Business unit: All units' }], onChange: () => {} },
        { id: 'sort', label: t('tasks.filter.sort'), value: 'due', options: [{ value: 'due', label: locale === 'id' ? 'Urutkan: Jatuh tempo terdekat' : 'Sort: Due soonest' }], onChange: () => {} },
        { id: 'status', label: t('tasks.filter.status'), value: status, options: [{ value: 'blocked', label: locale === 'id' ? 'Terhambat' : 'Blocked' }], onChange: setStatus },
        { id: 'person', label: t('tasks.filter.person'), value: 'person', options: [{ value: 'person', label: 'Example Person' }], onChange: () => {} },
      ]}
      fields={{ label: 'Columns', options: [{ value: 'title', label: 'Title' }, { value: 'due', label: 'Due' }], visible, onToggle: (value, checked) => setVisible((current) => checked ? [...current, value] : current.filter((field) => field !== value)) }}
      savedViews={{ label: 'Saved views', selectedId: null, items: [], operation: error ? 'error' : 'idle', error, onRetry: () => setError(null), onApply: () => {}, onSave: () => {} }}
    />
    <div style={{ position: 'relative', zIndex: 10, height: 400, background: 'var(--card)' }}>{presentation} content</div>
  </main>
}

createRoot(document.getElementById('root')!).render(<I18nProvider initialLocale={locale}><Fixture /></I18nProvider>)
