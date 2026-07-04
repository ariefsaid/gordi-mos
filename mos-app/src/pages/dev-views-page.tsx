// Dev harness — the zero-agent proof (ADR-0018 D6 P1). Hand-compose a spec, save, reopen,
// render. DEV-only + feature-flagged (config/features.ts SHOW_USER_VIEWS) + auth-gated
// (mounted inside ProtectedRoute — router.tsx). Phone-first, DESIGN.md tokens only.
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { useAuth } from '@/auth/use-auth'
import { PageFrame } from '@/shell/page-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { UserViewRenderer, buildCompilerContext } from '@/lib/viewspec/renderer'
import { listUserViews, getUserView, createUserView, type UserViewRow, type UserViewScope } from '@/lib/db/user-views'
import type { CompositionSpec } from '@/lib/viewspec/types'
import './dev-views-page.css'

const SAMPLE: CompositionSpec = {
  version: 1,
  panels: [{
    id: 'p1', primitive: 'DataTable',
    querySpec: {
      entity: 'tasks', select: ['id', 'title', 'status', 'due_date'],
      timeRange: { column: 'due_date', from: '$start_of_month', to: '$end_of_month' },
    },
  }],
}

export function DevViewsPage({ viewId: viewIdProp }: { viewId?: string } = {}) {
  const t = useT()
  useDocumentTitle('User Views (dev) — Gordi MOS')
  const auth = useAuth()
  // Route-mounted usage (router.tsx /dev/views/:viewId) supplies no prop — read the param
  // directly (mirrors TaskDrawer/OpsAddForm's own useParams() convention). Tests render the
  // page standalone and pass viewId as a prop, which takes precedence when given.
  const params = useParams<{ viewId?: string }>()
  const viewId = viewIdProp ?? params.viewId

  const [views, setViews] = useState<UserViewRow[]>([])
  const [name, setName] = useState('My view')
  const [scope, setScope] = useState<UserViewScope>('private')
  const [text, setText] = useState(JSON.stringify(SAMPLE, null, 2))
  const [parsed, setParsed] = useState<CompositionSpec | null>(SAMPLE)
  const [msg, setMsg] = useState<string | null>(null)

  const refresh = async () => setViews(await listUserViews().catch(() => []))

  useEffect(() => { refresh() }, [])

  useEffect(() => {
    if (!viewId) return
    getUserView(viewId).then((v) => {
      if (v) {
        setName(v.name)
        setScope(v.scope)
        setText(JSON.stringify(v.spec, null, 2))
        setParsed(v.spec)
      }
    })
  }, [viewId])

  const parse = (): CompositionSpec | null => {
    try {
      return JSON.parse(text) as CompositionSpec
    } catch {
      return null
    }
  }

  const onRender = () => {
    const p = parse()
    setParsed(p)
    setMsg(p ? null : t('dev.views.invalid'))
  }

  const onSave = async () => {
    const p = parse()
    if (!p) {
      setMsg(t('dev.views.invalid'))
      return
    }
    await createUserView({ name, spec: p, scope })
    setMsg(t('dev.views.saved'))
    await refresh()
  }

  const ctx = auth.status === 'authenticated'
    ? buildCompilerContext(auth.viewer.person.id, auth.viewer.person.org_id)
    : null

  return (
    <PageFrame>
      <div className="dev-views">
        <header className="dev-views__head">
          <h1>{t('dev.views.title')}</h1>
          <p className="dev-views__sub">{t('dev.views.subtitle')}</p>
        </header>

        <section className="dev-views__list" aria-label={t('dev.views.title')}>
          {views.length === 0
            ? <p className="dev-views__empty">{t('dev.views.empty')}</p>
            : (
              <ul className="dev-views__list-items">
                {views.map((v) => (
                  <li key={v.id}>
                    <a href={`/mos/dev/views/${v.id}`} className="dev-views__list-item">{v.name}</a>
                  </li>
                ))}
              </ul>
            )}
        </section>

        <section className="dev-views__editor">
          <label className="dev-views__field" htmlFor="dev-views-name">{t('dev.views.name')}</label>
          <input
            id="dev-views-name"
            className="dev-views__input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <label className="dev-views__field" htmlFor="dev-views-scope">{t('dev.views.scope.label')}</label>
          <select
            id="dev-views-scope"
            className="dev-views__select"
            value={scope}
            onChange={(e) => setScope(e.target.value as UserViewScope)}
          >
            <option value="private">{t('dev.views.scope.private')}</option>
            <option value="shared_team">{t('dev.views.scope.shared_team')}</option>
          </select>

          <label className="dev-views__field" htmlFor="dev-views-json">{t('dev.views.json')}</label>
          <textarea
            id="dev-views-json"
            className="dev-views__textarea"
            rows={16}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />

          <div className="dev-views__actions">
            <button type="button" className="dev-views__btn dev-views__btn--primary" onClick={onSave}>
              {t('dev.views.save')}
            </button>
            <button type="button" className="dev-views__btn" onClick={onRender}>
              {t('dev.views.render')}
            </button>
          </div>
          {msg && <p className="dev-views__msg" role="status">{msg}</p>}
        </section>

        <section className="dev-views__render">
          {parsed && ctx && <UserViewRenderer spec={parsed} ctx={ctx} />}
        </section>
      </div>
    </PageFrame>
  )
}
