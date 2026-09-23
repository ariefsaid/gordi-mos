import type { JSX } from 'react'
import { useT } from '@/i18n/use-t'
import { HOME_LAYOUTS, type HomeLayout } from '@/lib/home-layout'
import type { MessageKey } from '@/i18n/messages'
import './home-layout-picker.css'

export interface HomeLayoutPickerProps {
  value: HomeLayout
  onChange: (next: HomeLayout) => void
}

// CSS-drawn thumbnails keep the chooser asset-free and make the structural difference visible in
// every theme. The right-hand strip is intentionally present in every preview: Signals survives
// every arrangement and is never implied to be a fourth selectable region.
const FEED_STRIP = (
  <span className="hlp-side">
    <span className="hlp-post"><i className="hlp-l hlp-l--tiny" /><i className="hlp-l" /><i className="hlp-l hlp-l--short" /></span>
    <span className="hlp-post"><i className="hlp-l hlp-l--tiny" /><i className="hlp-l" /></span>
    <span className="hlp-post hlp-post--last"><i className="hlp-l hlp-l--tiny" /><i className="hlp-l hlp-l--short" /></span>
  </span>
)

const THUMBS: Record<HomeLayout, JSX.Element> = {
  focused: (
    <span className="hlp-main">
      <span className="hlp-tabs"><i /><i /><i /><i /></span>
      <i className="hlp-l" /><i className="hlp-l" /><i className="hlp-l hlp-l--short" /><i className="hlp-l" />
    </span>
  ),
  overview: (
    <span className="hlp-main">
      <span className="hlp-grid"><i className="hlp-box hlp-box--wide" /><i className="hlp-box" /><i className="hlp-box" /></span>
    </span>
  ),
  list: (
    <span className="hlp-main">
      <span className="hlp-pair"><i className="hlp-l hlp-l--tiny" /><i className="hlp-l" /></span>
      <span className="hlp-pair"><i className="hlp-l hlp-l--tiny" /><i className="hlp-l" /></span>
      <span className="hlp-pair"><i className="hlp-l hlp-l--tiny" /><i className="hlp-l hlp-l--short" /></span>
      <span className="hlp-pair"><i className="hlp-l hlp-l--tiny" /><i className="hlp-l" /></span>
    </span>
  ),
}

const LAYOUT_NAME: Record<HomeLayout, MessageKey> = {
  focused: 'profile.homeLayout.focused',
  overview: 'profile.homeLayout.overview',
  list: 'profile.homeLayout.list',
}

const LAYOUT_DESC: Record<HomeLayout, MessageKey> = {
  focused: 'profile.homeLayout.focused.desc',
  overview: 'profile.homeLayout.overview.desc',
  list: 'profile.homeLayout.list.desc',
}

export function HomeLayoutPicker({ value, onChange }: HomeLayoutPickerProps) {
  const t = useT()
  return (
    <div className="hlp">
      <p className="hlp-help">{t('profile.homeLayout.help')}</p>
      <div className="hlp-opts" role="radiogroup" aria-label={t('profile.homeLayout')}>
        {HOME_LAYOUTS.map((id) => (
          <label key={id} className="hlp-opt">
            <input
              type="radio"
              name="home-layout"
              value={id}
              checked={value === id}
              onChange={() => onChange(id)}
              aria-label={`${t(LAYOUT_NAME[id])} — ${t(LAYOUT_DESC[id])}`}
            />
            <span className="hlp-card">
              <span className="hlp-thumb">{THUMBS[id]}{FEED_STRIP}</span>
              <span className="hlp-name">
                {t(LAYOUT_NAME[id])}
                {id === 'focused' && <span className="hlp-badge">{t('profile.homeLayout.default')}</span>}
              </span>
              <span className="hlp-desc">{t(LAYOUT_DESC[id])}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}
