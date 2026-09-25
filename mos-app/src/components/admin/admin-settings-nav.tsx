import { NavLink } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import './admin-settings.css'

/** Admin Settings' three tabs, in the order an admin works: who, which Teams, which rules. */
const TABS: { to: string; labelKey: MessageKey }[] = [
  { to: '/admin/people', labelKey: 'admin.settings.nav.people' },
  { to: '/admin/teams', labelKey: 'admin.settings.nav.teams' },
  { to: '/admin/access', labelKey: 'admin.settings.nav.access' },
]

export function AdminSettingsNav() {
  const t = useT()
  return (
    <nav className="admin-settings-nav" aria-label={t('admin.settings.nav.aria')}>
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end
          className={({ isActive }) => `admin-settings-nav__link${isActive ? ' admin-settings-nav__link--active' : ''}`}
        >
          {t(tab.labelKey)}
        </NavLink>
      ))}
    </nav>
  )
}
