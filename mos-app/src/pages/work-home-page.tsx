import { Link } from 'react-router-dom'
import { ArrowRightIcon } from '@/shell/icons'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import { FIXED_AREAS } from '@/shell/module-registry'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import './work-home-page.css'

const workArea = FIXED_AREAS.find((area) => area.id === 'work')!
const descriptionKeyByPath: Partial<Record<string, MessageKey>> = {
  '/work/signals': 'work.home.signals',
  '/work/tasks': 'work.home.tasks',
  '/work/projects': 'work.home.projects',
  '/work/objectives': 'work.home.objectives',
}

export function WorkHomePage() {
  const t = useT()
  useDocumentTitle(t('common.docTitle', { page: t('dest.work') }))
  return (
    <PageFamilyFrame
      family="workspace"
      title={t('dest.work')}
      action={<Link className="btn btn-primary" to="/work/tasks?create=1">{t('tasks.create.new')}</Link>}
    >
      <div className="work-home">
        <nav className="work-home__doors" aria-label={t('work.home.destinations')}>
          {(workArea.children ?? []).map(({ path, label, labelKey }) => {
            const descriptionKey = descriptionKeyByPath[path]
            return (
              <Link className="work-home__door" to={path} key={path}>
                <span className="work-home__door-copy">
                  <strong>{labelKey ? t(labelKey) : label}</strong>
                  {descriptionKey && <span>{t(descriptionKey)}</span>}
                </span>
                <ArrowRightIcon />
              </Link>
            )
          })}
        </nav>
      </div>
    </PageFamilyFrame>
  )
}
