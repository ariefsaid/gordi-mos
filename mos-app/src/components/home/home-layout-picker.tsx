import type { JSX } from 'react'
import { useT } from '@/i18n/use-t'
import { HOME_LAYOUTS, type HomeLayout } from '@/lib/home-layout'
import './home-layout-picker.css'

// The wireframe-thumbnail chooser is the standing convention for a page-structure choice: the
// diagram carries the shape so the label does not have to describe it (OD-V4-9). Thumbnails are
// CSS-drawn — no image assets. The right-hand strip in every thumbnail is the Signals feed, which
// is present in ALL three layouts (FR-928).

export interface HomeLayoutPickerProps {
  value: HomeLayout
  onChange: (next: HomeLayout) => void
}

const FEED_STRIP = (
  <span className="hlp-side">
    <span className="hlp-post"><i className="hlp-l hlp-l--tiny" /><i className="hlp-l" /><i className="hlp-l hlp-l--short" /></span>
    <span className="hlp-post"><i className="hlp-l hlp-l--tiny" /><i className="hlp-l" /></span>
  </span>
)

const THUMBS: Record<HomeLayout, JSX.Element> = {
  focused: (
    <span className="hlp-main">
      <span className="hlp-tabs"><i /><i /><i /><i /></span>
      <i className="hlp-l" /><i className="hlp-l" /><i className="hlp-l hlp-l--short" />
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
    </span>
  ),
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
            />
            <span className="hlp-card">
              <span className="hlp-thumb">{THUMBS[id]}{FEED_STRIP}</span>
              <span className="hlp-name">
                {t(`profile.homeLayout.${id}` as Parameters<typeof t>[0])}
                {id === 'focused' && <span className="hlp-badge">{t('profile.homeLayout.default')}</span>}
              </span>
              <span className="hlp-desc">{t(`profile.homeLayout.${id}.desc` as Parameters<typeof t>[0])}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}
