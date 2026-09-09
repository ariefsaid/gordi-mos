import { NavLink } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import './admin-settings.css'

export function AdminSettingsNav() {
  const t = useT()
  return (
    <nav className="admin-settings-nav" aria-label={t('admin.settings.nav.aria')}>
      <NavLink
        to="/admin/people"
        end
        className={({ isActive }) => `admin-settings-nav__link${isActive ? ' admin-settings-nav__link--active' : ''}`}
      >
        {t('admin.settings.nav.people')}
      </NavLink>
      <NavLink
        to="/admin/access"
        end
        className={({ isActive }) => `admin-settings-nav__link${isActive ? ' admin-settings-nav__link--active' : ''}`}
      >
        {t('admin.settings.nav.access')}
      </NavLink>
    </nav>
  )
}
