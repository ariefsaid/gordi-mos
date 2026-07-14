import { useLocation } from 'react-router-dom'
import { jobKeyForPath } from './job-sentences'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'

/**
 * ContextRow — Region 2 of the anatomy (D-PLN-5, NEW per spec §3.1). A shell-level
 * strip rendered above the content Outlet on every route: the viewer's resolved
 * scope (Person/Team/BU) + the active route's job sentence (Rule 6 / Rule 1).
 *
 * `page-head.tsx` is a per-page H1 inside region 3 — not a counterpart, so this is
 * genuinely new. Minimal on stubs. Mounted once in app-shell.tsx (no new provider).
 */
export function ContextRow() {
  const { pathname } = useLocation()
  const auth = useAuth()
  const t = useT()

  const jobKey = jobKeyForPath(pathname)
  const viewer = auth.status === 'authenticated' ? auth.viewer : null
  const scope = viewer?.person.full_name ?? ''

  return (
    <div
      role="region"
      aria-label="Context"
      data-anatomy="context-row"
      className="ctx-row flex items-center gap-3 px-4"
      style={{ height: 'var(--ctx-row-h, 40px)', flex: 'none' }}
    >
      {scope && <span className="ctx-scope truncate text-muted-foreground" style={{ fontSize: 13 }}>{scope}</span>}
      <b className="ctx-job truncate text-foreground" style={{ fontSize: 13, fontWeight: 500 }}>
        {t(jobKey)}
      </b>
    </div>
  )
}
