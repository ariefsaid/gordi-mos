import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { ViewTabs } from '@/components/ui/view-tabs'
import type { CollectionViewOperationStatus } from '@/lib/record-collection/types'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useT } from '@/i18n/use-t'
import { viewOptionsTraversal } from '@/shell/view-options-keyboard'
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
  /**
   * A layout-independent primary action for the collection (e.g. Signals' "Share Signal"), hosted
   * in row 1 so it is present in EVERY presentation — the door does not blink in/out with the
   * Table/Feed switch (interaction D-D2 / Rule 7). Omitted collections render no primary action.
   */
  primaryAction?: ReactNode
  className?: string
  /**
   * Census R2 DO-6: a reserved (coming-soon) view has no rows to operate on, so every
   * row-operating control — search, the options, the presentation switch, Save view — is
   * HIDDEN rather than rendered live-but-dead above a placeholder
   * body. Only the view chip strip survives: it is the door back out of the reserved view.
   */
  reserved?: boolean
}

/**
 * The one visible RecordCollection control grammar. Domains supply typed labels/options, while
 * this component owns the order, geometry, keyboard-capable primitives, saved-view door, and
 * responsive wrapping. Unsupported capabilities are omitted rather than shown disabled.
 *
 * Desktop anatomy (OD-WAY-89): row 1 is the ONE view axis — a labelled saved-view chip strip
 * (presets + user-saved views together) FIRST-left, the presentation switch RIGHT. Row 2 is
 * search followed by a compact inline row holding domain filters, group, sort, Save view, and
 * domain toggles. The controls remain in normal document order without a desktop door.
 *
 * Phone keeps the OD-REDESIGN-84 single outer "View & filters" disclosure; hosts render this same
 * options row inside it (alongside their phone-specific collapsed row 1 and search).
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
  primaryAction,
  className,
  reserved = false,
}: CollectionToolbarProps<TPresentation, TView>) {
  const t = useT()
  const isDesktop = useIsDesktop()
  const [saveOpen, setSaveOpen] = useState(false)
  const [viewName, setViewName] = useState('')
  const saveTriggerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    savedViews?.onLoad?.()
    // A toolbar mounts once per collection. Re-loading because the caller recreated an inline
    // callback would create duplicate requests, so mount is the deliberate lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saving = savedViews?.operation === 'saving'
  const canSave = Boolean(viewName.trim()) && !saving
  // Desktop shows secondary controls inline; phones render this row inside the host's single
  // View & filters row. Reserved views with no rows keep the controls withheld (DO-6).
  const hasViewOptions = !reserved && (filters.length > 0 || Boolean(savedViews) || Boolean(toggles))

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

        {/* Layout-independent primary action (D-D2): rides row 1 in every presentation, so the
            collection's ONE compose door never blinks with the Table/Feed switch. */}
        {primaryAction ? (
          <div className="collection-toolbar__primary-action">{primaryAction}</div>
        ) : null}
      </div>

      {/* Query row (OD-WAY-89): search leads; desktop secondary controls follow in the always
          visible options row. Phone hosts expose that row through their single outer disclosure. */}
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

      </div>
      )}

      {hasViewOptions ? (
        <div
          className="collection-toolbar__options"
          role="group"
          aria-label={t('common.viewAndFilters')}
          // Desktop owns traversal for its always-visible row. Phone traversal and Escape belong
          // to the host's outer ViewOptionsDisclosure.
          onKeyDown={isDesktop ? viewOptionsTraversal : undefined}
        >
          {filters.map((filter) => (
            <label key={filter.id} className="collection-toolbar__option-field">
              {!isDesktop ? <span>{filter.label}</span> : null}
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
              onKeyDown={(event) => {
                // The nested save row owns Escape so it closes without affecting the toolbar row.
                if (!saveOpen || event.key !== 'Escape') return
                event.preventDefault()
                event.stopPropagation()
                closeSaveView()
              }}
            >
              {t('common.saveView')}
            </Button>
          ) : null}
          {toggles}
          {savedViews && saveOpen ? (
            <div className="collection-toolbar__save" role="group" aria-label={t('common.saveCurrentView')}>
              <label className="collection-toolbar__save-field">
                <span>{t('common.viewName')}</span>
                <input
                  autoFocus
                  value={viewName}
                  onChange={(event) => setViewName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      event.stopPropagation()
                      closeSaveView()
                    }
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
      ) : null}
    </div>
  )
}
