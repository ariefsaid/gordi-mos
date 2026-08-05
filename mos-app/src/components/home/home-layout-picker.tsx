import type { JSX } from 'react'
import { useT } from '@/i18n/use-t'
import { HOME_LAYOUTS, type HomeLayout } from '@/lib/home-layout'
import type { MessageKey } from '@/i18n/messages'
import './home-layout-picker.css'

// The wireframe-thumbnail chooser is the convention for a page-STRUCTURE choice: the diagram
// carries the shape so the label does not have to describe it. Thumbnails are CSS-drawn — no
// image assets, so they theme with the rest of the app for free. The right-hand strip in every
// thumbnail is the Signals feed, which is present in ALL three layouts.

export interface HomeLayoutPickerProps {
  value: HomeLayout
  onChange: (next: HomeLayout) => void
}

// Three posts separated by a rule: the separators are what make the strip read as a FEED rather
// than as more of the work area, at every thumbnail size.
const FEED_STRIP = (
  <span className="hlp-side">
    <span className="hlp-post"><i className="hlp-l hlp-l--tiny" /><i className="hlp-l" /><i className="hlp-l hlp-l--short" /></span>
    <span className="hlp-post"><i className="hlp-l hlp-l--tiny" /><i className="hlp-l" /></span>
    <span className="hlp-post hlp-post--last"><i className="hlp-l hlp-l--tiny" /><i className="hlp-l hlp-l--short" /></span>
  </span>
)

// Row counts (4 lines / 3 tiles / 4 pairs) are load-bearing: a half-filled wireframe reads as
// "some layout" instead of as its own arrangement.
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

/** Each layout's name + "who it suits" sentence. Explicit maps, not an interpolated key behind an
 *  `as MessageKey` cast: an interpolated string is not a MessageKey, and the cast hides a missing
 *  or renamed string until it renders as a raw key in front of a user. These are exhaustive over
 *  `HomeLayout`, so adding a fourth arrangement fails the build here. */
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
      {/* A native radiogroup, not a set of buttons: arrow-key roving and the checked state come
          from the platform, so the choice is announced rather than signalled by colour alone. */}
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
