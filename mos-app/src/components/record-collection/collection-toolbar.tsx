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
}

/**
 * The one visible RecordCollection control grammar. Domains supply typed labels/options, while
 * this component owns the order, geometry, keyboard-capable primitives, saved-view door, and
 * responsive wrapping. Unsupported capabilities are omitted rather than shown disabled.
 *
 * E7 / pre-E7 anatomy (owner score gate, 2026-07-22): row 1 is the ONE view axis — the
 * presentation switch plus a single chip strip where preset views and user-saved views live
 * together. Row 2 is the compact query row — search + domain filters. Group/sort/toggles are
 * progressively disclosed behind a labelled "View options" button (an inline row, not a popup),
 * so the collapsed toolbar never shows duplicate view axes.
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
  const isViewOption = (filter: CollectionToolbarFilter) => /(?:^|-)group$|(?:^|-)sort$/.test(filter.id)
  const queryFilters = filters.filter(filter => !isViewOption(filter))
  const viewOptionFilters = filters.filter(isViewOption)
  const hasViewOptions = viewOptionFilters.length > 0 || Boolean(toggles)
  // First option is each choice's rest state; a dot on the collapsed trigger says "the view
  // is shaped by something you can't currently see".
  const viewOptionsActive = viewOptionFilters.some(
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
      {/* E7 / pre-E7 anatomy: the collection switch is a calm first row. Query controls
          never compete with the Table/Feed decision or get interleaved by flex wrapping. */}
      <div className="collection-toolbar__primary">
        <div className="collection-toolbar__presentations">
          <ViewTabs
            ariaLabel={presentation.label}
            active={presentation.value}
            tabs={presentation.options.map((option) => ({ id: option.value, label: option.label }))}
            onChange={(value) => presentation.onChange(value as TPresentation)}
          />
        </div>

        <div className="collection-toolbar__views" role="group" aria-label={views.label}>
          <span className="collection-toolbar__views-label" aria-hidden="true">{t('common.savedView')}</span>
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
      </div>

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

        {queryFilters.length > 0 ? (
          <div className="collection-toolbar__filter-group" role="group" aria-label={t('common.filters')}>
            {queryFilters.map((filter) => (
              <Select
                key={filter.id}
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
            ))}
          </div>
        ) : null}

        {/* Phone keeps OD-REDESIGN-61's contract: the host's single "View & filters"
            disclosure reveals the FULL capability in one tap, so the desktop-only
            trigger disappears and the options row renders expanded. */}
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
              {t('common.viewOptions')}
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

      {hasViewOptions && (optionsOpen || !isDesktop) ? (
        <div
          id={optionsRowId}
          className="collection-toolbar__options"
          role="group"
          aria-label={t('common.viewOptions')}
        >
          {viewOptionFilters.map((filter) => (
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
