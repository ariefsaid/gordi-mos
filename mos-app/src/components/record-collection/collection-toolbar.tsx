import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { ViewTabs } from '@/components/ui/view-tabs'
import type { CollectionViewOperationStatus } from '@/lib/record-collection/types'
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
      <div className="collection-toolbar__presentations">
        <ViewTabs
          ariaLabel={presentation.label}
          active={presentation.value}
          tabs={presentation.options.map((option) => ({ id: option.value, label: option.label }))}
          onChange={(value) => presentation.onChange(value as TPresentation)}
        />
      </div>

      <div className="collection-toolbar__views" role="group" aria-label={views.label}>
        {views.options.map((option) => {
          const active = option.value === views.value
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
      </div>

      <div className="collection-toolbar__query">
        {filters.map((filter) => (
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

        {toggles}

        {savedViews ? (
          <div className="collection-toolbar__saved">
            <Select
              aria-label={savedViews.label}
              value={savedViews.selectedId ?? ''}
              onChange={(event) => {
                if (event.target.value) void savedViews.onApply(event.target.value)
              }}
              className="collection-toolbar__select collection-toolbar__saved-select"
            >
              <option value="">{savedViews.label}</option>
              {savedViews.items.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </Select>
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
          </div>
        ) : null}
      </div>

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
