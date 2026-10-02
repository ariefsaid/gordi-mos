import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import './admin-settings.css'

/** Admin Settings tabs, in the order an admin works: who, which Teams, which rules, which agents. */
const TABS: { to: string; labelKey: MessageKey }[] = [
  { to: '/admin/people', labelKey: 'admin.settings.nav.people' },
  { to: '/admin/teams', labelKey: 'admin.settings.nav.teams' },
  { to: '/admin/access', labelKey: 'admin.settings.nav.access' },
  { to: '/admin/agents', labelKey: 'admin.settings.nav.agents' },
]

export function AdminSettingsNav() {
  const t = useT()
  const { pathname } = useLocation()
  const navRef = useRef<HTMLElement>(null)
  const [overflow, setOverflow] = useState({ left: false, right: false })

  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const measure = () => {
      setOverflow({
        left: nav.scrollLeft > 1,
        right: nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1,
      })
    }
    measure()
    nav.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      nav.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
    }
  }, [pathname])

  useEffect(() => {
    const activeTab = navRef.current?.querySelector<HTMLElement>('.admin-settings-nav__link--active')
    activeTab?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [pathname])

  return (
    <div className={`admin-settings-nav-frame${overflow.left ? ' admin-settings-nav-frame--more-left' : ''}${overflow.right ? ' admin-settings-nav-frame--more-right' : ''}`}>
      <nav ref={navRef} className="admin-settings-nav" aria-label={t('admin.settings.nav.aria')}>
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
    </div>
  )
}
