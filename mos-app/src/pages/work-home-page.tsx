import { Link } from 'react-router-dom'
import { ArrowRightIcon } from '@/shell/icons'
import { useT } from '@/i18n/use-t'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import './work-home-page.css'

const destinations = [
  { path: '/work/tasks', title: 'nav.work.tasks', description: 'work.home.tasks' },
  { path: '/work/signals', title: 'nav.work.signals', description: 'work.home.signals' },
  { path: '/work/projects', title: 'nav.work.projects', description: 'work.home.projects' },
  { path: '/work/objectives', title: 'nav.work.objectives', description: 'work.home.objectives' },
] as const

export function WorkHomePage() {
  const t = useT()
  useDocumentTitle(t('common.docTitle', { page: t('dest.work') }))
  return (
    <PageFamilyFrame family="workspace" title={t('dest.work')} jobSentence={t('work.home.job')}>
      <main className="work-home" aria-label={t('dest.work')}>
        <div className="work-home__action">
          <p>{t('work.home.intro')}</p>
          <Link className="btn btn-primary" to="/work/tasks?create=1">{t('tasks.create.new')}</Link>
        </div>
        <nav className="work-home__doors" aria-label={t('work.home.destinations')}>
          {destinations.map(({ path, title, description }) => (
            <Link className="work-home__door" to={path} key={path}>
              <span className="work-home__door-copy">
                <strong>{t(title)}</strong>
                <span>{t(description)}</span>
              </span>
              <ArrowRightIcon />
            </Link>
          ))}
        </nav>
      </main>
    </PageFamilyFrame>
  )
}
