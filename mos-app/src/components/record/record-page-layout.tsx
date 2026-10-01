// The one-scroll record page shell and its building blocks. Record-agnostic.
//
// RecordPageLayout props
//   label        string             the record's name; names the page region (landmark)
//   mode         'panel' | 'page'
//   header       ReactNode          usually <RecordPageHeader/>
//   notice       ReactNode          a banner under the header (archive/undo notice, errors)
//   setup        ReactNode          usually <RecordGetStarted/>; rendered above the sections
//   children     ReactNode          the record's sections (<RecordSection/>), in domain order
//   about        ReactNode          facts that are not in the header; a 300px aside on a page >=1280,
//                                   otherwise a block after the sections
//   history      { title, node, count? }   (optional; omit when there is nothing to show) the folded History: an open aside block on a wide page, otherwise
//                                   a closed disclosure at the end. `node` mounts only when shown.
//   kind         string             names the record kind on the root (data-record-kind) for kind-scoped styles and checks
//   headingLevel 1 | 2              the rung of the record title; sections sit one under it
//
// RecordSection props      { id, title, count?, action?: { label, onClick, disabled? }, children }
//   A section is a sentence-case header (+ muted count, + one visible action) over its rows.
// RecordGetStarted props   { title, why?, items: { id, label, reason, action: { label, onClick, disabled? } }[] }
//   One region for everything still missing; the first row's button is the primary. Renders nothing
//   for an empty list, so finished setup leaves no trace.
// RecordDisclosure props   { title, count?, defaultOpen?, open?, onToggle?, children }
//   children render only while open. Pass `open` to control it (the caller then owns the state).
// RecordAbout props        { items: { key, label, value }[] }
import { createContext, useContext, useId, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { SkeletonRows } from '@/components/ui/state-kit'
import { useIsWideRecordPage } from './use-is-wide-record-page'
import './record-page.css'

const HeadingLevelContext = createContext<1 | 2>(1)

export type RecordSectionAction = {
  label: string
  onClick: () => void
  disabled?: boolean
}

type SectionHeadingProps = { id?: string; children: ReactNode; className: string }

function SectionHeading({ id, children, className }: SectionHeadingProps) {
  const level = useContext(HeadingLevelContext)
  const Tag = level === 1 ? 'h2' : 'h3'
  return <Tag id={id} className={className}>{children}</Tag>
}

export type RecordSectionProps = {
  id: string
  title: string
  count?: ReactNode
  action?: RecordSectionAction
  children: ReactNode
}

export function RecordSection({ id, title, count, action, children }: RecordSectionProps) {
  const headingId = useId()
  return (
    <section className="rp-section" data-record-section={id} aria-labelledby={headingId}>
      <div className="rp-section__head">
        <SectionHeading id={headingId} className="rp-section__title">{title}</SectionHeading>
        {count !== undefined && count !== null ? <span className="rp-section__count">{count}</span> : null}
        {action ? (
          <Button variant="ghost" className="rp-section__action" disabled={action.disabled} onClick={action.onClick}>
            <span aria-hidden="true">+</span> {action.label}
          </Button>
        ) : null}
      </div>
      {children}
    </section>
  )
}

export type RecordSetupItem = {
  id: string
  label: string
  reason: string
  action: RecordSectionAction
}

export type RecordGetStartedProps = {
  title: string
  why?: string
  items: readonly RecordSetupItem[]
}

export function RecordGetStarted({ title, why, items }: RecordGetStartedProps) {
  const headingId = useId()
  if (items.length === 0) return null
  return (
    <section className="rp-setup" data-record-setup="true" aria-labelledby={headingId}>
      <SectionHeading id={headingId} className="rp-setup__title">{title}</SectionHeading>
      {why ? <p className="rp-setup__why">{why}</p> : null}
      <ul className="rp-setup__list">
        {items.map((item, index) => (
          <li key={item.id} className="rp-setup__row" data-setup-item={item.id}>
            <svg className="rp-setup__check" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="10" cy="10" r="8" /><path d="m6.5 10.2 2.4 2.4 4.6-4.9" />
            </svg>
            <span className="rp-setup__text">
              <span className="rp-setup__label">{item.label}</span>
              <span className="rp-setup__reason">{item.reason}</span>
            </span>
            <Button variant={index === 0 ? 'primary' : 'outline'} className="rp-setup__action" disabled={item.action.disabled} onClick={item.action.onClick}>
              {item.action.label}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}

export type RecordDisclosureProps = {
  title: string
  count?: ReactNode
  defaultOpen?: boolean
  /** Controlled state; leave undefined for an uncontrolled disclosure. */
  open?: boolean
  onToggle?: (open: boolean) => void
  children: ReactNode
}

export function RecordDisclosure({ title, count, defaultOpen = false, open: controlled, onToggle, children }: RecordDisclosureProps) {
  const [own, setOwn] = useState(defaultOpen)
  const open = controlled ?? own
  const setOpen = (next: boolean) => { setOwn(next); onToggle?.(next) }
  const panelId = useId()
  return (
    <div className="rp-disclosure-wrap">
      <button
        type="button"
        className="rp-disclosure"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        <svg className="rp-disclosure__caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m9 6 6 6-6 6" />
        </svg>
        <span>{title}</span>
        {count !== undefined && count !== null ? <span className="rp-section__count">{count}</span> : null}
      </button>
      <div id={panelId} hidden={!open}>{open ? children : null}</div>
    </div>
  )
}

export type RecordAboutItem = {
  key: string
  label: string
  value: ReactNode
}

export type RecordAboutProps = { items: readonly RecordAboutItem[] }

export function RecordAbout({ items }: RecordAboutProps) {
  return (
    <dl className="rp-kv">
      {items.map((item) => (
        <div key={item.key} className="rp-kv__item">
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export type RecordPageLayoutProps = {
  label: string
  mode: 'panel' | 'page'
  headingLevel: 1 | 2
  header: ReactNode
  notice?: ReactNode
  setup?: ReactNode
  children: ReactNode
  about?: { title: string; node: ReactNode }
  history?: { title: string; node: ReactNode; count?: ReactNode }
  kind?: string
}

export function RecordPageLayout({ label, mode, headingLevel, header, notice, setup, children, about, history, kind }: RecordPageLayoutProps) {
  const wide = useIsWideRecordPage() && mode === 'page'
  return (
    <HeadingLevelContext.Provider value={headingLevel}>
      <section className={`rp rp--${mode}`} data-record-mode={mode} data-record-kind={kind} aria-label={label}>
        {header}
        {notice}
        <div className="rp-body">
          <div className="rp-main">
            {setup}
            {children}
            {!wide && about ? (
              <section className="rp-section rp-about" aria-label={about.title}>
                <SectionHeading className="rp-section__title">{about.title}</SectionHeading>
                {about.node}
              </section>
            ) : null}
            {!wide && history ? <RecordDisclosure title={history.title} count={history.count}>{history.node}</RecordDisclosure> : null}
          </div>
          {wide ? (
            <aside className="rp-aside">
              {about ? (
                <section className="rp-aside__block" aria-label={about.title}>
                  <SectionHeading className="rp-section__title">{about.title}</SectionHeading>
                  {about.node}
                </section>
              ) : null}
              {history ? (
                <section className="rp-aside__block" aria-label={history.title}>
                  <SectionHeading className="rp-section__title">
                    {history.title}
                    {history.count !== undefined && history.count !== null ? <span className="rp-section__count">{history.count}</span> : null}
                  </SectionHeading>
                  {history.node}
                </section>
              ) : null}
            </aside>
          ) : null}
        </div>
      </section>
    </HeadingLevelContext.Provider>
  )
}

export type RecordPageSkeletonProps = { label: string }

/** Loading state that keeps the page anatomy visible: a title bar, three fact pills, section rows. */
export function RecordPageSkeleton({ label }: RecordPageSkeletonProps) {
  return (
    <div className="rp rp--skeleton" role="status" aria-busy="true" aria-label={label}>
      <div className="skeleton-bar rp-skeleton__title" aria-hidden="true" />
      <div className="rp-skeleton__facts" aria-hidden="true">
        <span className="skeleton-bar" /><span className="skeleton-bar" /><span className="skeleton-bar" />
      </div>
      <SkeletonRows count={4} />
    </div>
  )
}
