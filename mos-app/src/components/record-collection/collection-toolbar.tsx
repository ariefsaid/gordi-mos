import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { ViewTabs } from '@/components/ui/view-tabs'
import type { CollectionViewOperationStatus } from '@/lib/record-collection/types'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useT } from '@/i18n/use-t'
import './collection-toolbar.css'

export interface CollectionToolbarOption<T extends string = string> {
  value: T
  label: string
}

export interface CollectionToolbarChoice<T extends string = string> {
  label: string
  value: T
  options: readonly CollectionToolbarOption<T>[]
  onChange: (value: T) => void
}

export interface CollectionToolbarFilter<T extends string = string>
  extends CollectionToolbarChoice<T> {
  id: string
}

export interface CollectionToolbarSearch {
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
}

export interface CollectionToolbarSavedViews {
  label: string
  selectedId: string | null
  operation: CollectionViewOperationStatus
  items: readonly { id: string; name: string }[]
  onLoad?: () => void
  onApply: (id: string) => void | Promise<void>
  onSave: (name: string) => void | Promise<void>
}

export interface CollectionToolbarProps<
  TPresentation extends string,
  TView extends string,
> {
  presentation: CollectionToolbarChoice<TPresentation>
  views: CollectionToolbarChoice<TView>
  search?: CollectionToolbarSearch
  filters?: readonly CollectionToolbarFilter[]
  savedViews?: CollectionToolbarSavedViews
  toggles?: ReactNode
  className?: string
  /**
   * Census R2 DO-6: a reserved (coming-soon) view has no rows to operate on, so every
   * row-operating control — search, the "View & filters" disclosure, the presentation
   * switch, Save view — is HIDDEN rather than rendered live-but-dead above a placeholder
   * body. Only the view chip strip survives: it is the door back out of the reserved view.
   */
  reserved?: boolean
}

/**
 * The one visible RecordCollection control grammar. Domains supply typed labels/options, while
 * this component owns the order, geometry, keyboard-capable primitives, saved-view door, and
 * responsive wrapping. Unsupported capabilities are omitted rather than shown disabled.
 *
 * Lean + disclosure anatomy (OD-REDESIGN-84.1, owner-ratified 2026-07-23; Luna P0-2): row 1 is
 * the ONE view axis — a labelled saved-view chip strip (presets + user-saved views together)
 * FIRST-left, the presentation switch RIGHT. Row 2 is the lean query row — just search and ONE
 * labelled "View & filters" affordance (aria-expanded + chevron). That affordance discloses an
 * inline row holding EVERY secondary control — domain filters, group, sort, "Save view", and
 * domain toggles — so the collapsed toolbar stays short (Luna target ≤~100px at 1280) and the
 * table starts ~74px earlier. The flat E7 wall-of-selects (commit 7ee4d5e) is superseded.
 *
 * Phone shares this one grammar: the hosts' single "View & filters" outer disclosure IS this same
 * affordance, so the in-toolbar trigger is desktop-only and the panel renders expanded inside the
 * phone wrapper (which additionally collapses row 1 + search to keep the first record above the
 * fold — Luna Block 2(b) — a scope the row-2 trigger by design does not reach).
 */
export function CollectionToolbar<
  TPresentation extends string,
  TView extends string,
>({
  presentation,
  views,
  search,
  filters = [],
  savedViews,
  toggles,
  className,
  reserved = false,
}: CollectionToolbarProps<TPresentation, TView>) {
  const t = useT()
  const isDesktop = useIsDesktop()
  const [saveOpen, setSaveOpen] = useState(false)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [viewName, setViewName] = useState('')
  const saveTriggerRef = useRef<HTMLButtonElement | null>(null)
  const optionsRowId = useId()

  useEffect(() => {
    savedViews?.onLoad?.()
    // A toolbar mounts once per collection. Re-loading because the caller recreated an inline
    // callback would create duplicate requests, so mount is the deliberate lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saving = savedViews?.operation === 'saving'
  const canSave = Boolean(viewName.trim()) && !saving
  // Every secondary control lives behind the one "View & filters" door: domain filters, view-shape
  // (group/sort), Save view, and domain toggles. The collapsed toolbar is row 1 + search + trigger.
  // A reserved view has no rows, so the door (and everything behind it) is withheld (DO-6).
  const hasViewOptions = !reserved && (filters.length > 0 || Boolean(savedViews) || Boolean(toggles))
  // First option is each choice's rest state; a dot on the collapsed trigger says "the view is
  // shaped by a filter you can't currently see" so the door never hides an active filter silently.
  const viewOptionsActive = filters.some(
    filter => filter.options.length > 0 && filter.value !== filter.options[0].value,
  )

  function closeSaveView() {
    setSaveOpen(false)
    saveTriggerRef.current?.focus()
  }

  async function saveView() {
    if (!savedViews || !canSave) return
    await savedViews.onSave(viewName.trim())
    setViewName('')
    closeSaveView()
  }

  return (
    <div
      className={`collection-toolbar${className ? ` ${className}` : ''}`}
      data-testid="record-collection-toolbar"
    >
      {/* E7-floor row 1: the ONE view axis. The labelled saved-view chip strip (presets + user
          views together) leads left; the presentation switch trails right. Saved views are the
          primary axis, so they come first — never behind or beside the Table/Board decision. */}
      <div className="collection-toolbar__primary">
        <div className="collection-toolbar__views" role="group" aria-label={views.label}>
          {/* DO-20(c) (objectives F5): "Saved view" is only honest where saved views exist. A host
              without the savedViews capability (the catalogs' Active/Archived toggle) labels the
              zone plain "View" instead of promising a feature the surface structurally disables. */}
          <span className="collection-toolbar__views-label" aria-hidden="true">
            {t(savedViews ? 'common.savedView' : 'common.view')}
          </span>
          {views.options.map((option) => {
            const active = option.value === views.value && !savedViews?.selectedId
            return (
              <button
                key={option.value}
                type="button"
                className={`collection-toolbar__view${active ? ' collection-toolbar__view--active' : ''}`}
                aria-pressed={active}
                onClick={() => views.onChange(option.value)}
              >
                {option.label}
              </button>
            )
          })}
          {savedViews && savedViews.items.length > 0 ? (
            <>
              <span className="collection-toolbar__views-divider" aria-hidden="true" />
              {savedViews.items.map((item) => {
                const active = item.id === savedViews.selectedId
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`collection-toolbar__view${active ? ' collection-toolbar__view--active' : ''}`}
                    aria-pressed={active}
                    onClick={() => void savedViews.onApply(item.id)}
                  >
                    {item.name}
                  </button>
                )
              })}
            </>
          ) : null}
        </div>

        <div className="collection-toolbar__primary-spacer" />

        {/* Reserved views have no rows to re-present — a live Table/Card switch above a
            coming-soon placeholder is a dead control (DO-6). */}
        {!reserved && (
          <div className="collection-toolbar__presentations">
            <ViewTabs
              ariaLabel={presentation.label}
              active={presentation.value}
              tabs={presentation.options.map((option) => ({ id: option.value, label: option.label }))}
              onChange={(value) => presentation.onChange(value as TPresentation)}
            />
          </div>
        )}
      </div>

      {/* Lean query row (OD-84.1): search leads; the ONE labelled "View & filters" disclosure
          trigger trails right. Every filter/group/sort/toggle lives behind it, so the collapsed
          toolbar is just row 1 + this one line. The trigger is desktop-only — phone hosts expose
          the identical door via their outer wrapper, and this panel renders expanded within it. */}
      {reserved ? null : (
      <div className="collection-toolbar__query">
        {search ? (
          <label className="collection-toolbar__search">
            <span className="sr-only">{search.label}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="search"
              aria-label={search.label}
              placeholder={search.placeholder}
              value={search.value}
              onChange={(event) => search.onChange(event.target.value)}
            />
          </label>
        ) : null}

        {hasViewOptions && isDesktop ? (
          <>
            <div className="collection-toolbar__query-spacer" />
            <button
              type="button"
              className="collection-toolbar__options-trigger"
              aria-expanded={optionsOpen}
              aria-controls={optionsRowId}
              onClick={() => setOptionsOpen(open => !open)}
            >
              {t('common.viewAndFilters')}
              {viewOptionsActive ? (
                <span className="collection-toolbar__options-dot" aria-hidden="true" />
              ) : null}
              <svg
                className={`collection-toolbar__options-chevron${optionsOpen ? ' collection-toolbar__options-chevron--open' : ''}`}
                width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          </>
        ) : null}
      </div>
      )}

      {hasViewOptions && (optionsOpen || !isDesktop) ? (
        <div
          id={optionsRowId}
          className="collection-toolbar__options"
          role="group"
          aria-label={t('common.viewAndFilters')}
        >
          {filters.map((filter) => (
            <label key={filter.id} className="collection-toolbar__option-field">
              <span>{filter.label}</span>
              <Select
                id={`collection-filter-${filter.id}`}
                aria-label={filter.label}
                value={filter.value}
                onChange={(event) => filter.onChange(event.target.value)}
                className="collection-toolbar__select"
              >
                {filter.options.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
            </label>
          ))}
          {savedViews ? (
            <Button
              variant="ghost"
              ref={saveTriggerRef}
              aria-expanded={saveOpen}
              onClick={() => {
                if (saveOpen) closeSaveView()
                else setSaveOpen(true)
              }}
            >
              {t('common.saveView')}
            </Button>
          ) : null}
          {toggles}
        </div>
      ) : null}

      {savedViews && saveOpen ? (
        <div className="collection-toolbar__save" role="group" aria-label={t('common.saveCurrentView')}>
          <label className="collection-toolbar__save-field">
            <span>{t('common.viewName')}</span>
            <input
              autoFocus
              value={viewName}
              onChange={(event) => setViewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') closeSaveView()
                if (event.key === 'Enter') void saveView()
              }}
            />
          </label>
          <Button variant="primary" disabled={!canSave} onClick={() => void saveView()}>
            {saving ? t('common.saving') : t('common.save')}
          </Button>
          <Button variant="ghost" onClick={closeSaveView}>{t('common.cancel')}</Button>
        </div>
      ) : null}
    </div>
  )
}
