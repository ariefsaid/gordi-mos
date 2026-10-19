import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Picker } from '@/components/ui/picker'
import { SearchField } from '@/components/ui/search-field'
import { FilterChip } from '@/components/ui/filter-chip'
import { ErrorState } from '@/components/ui/state-kit'
import type { CollectionViewOperationStatus } from '@/lib/record-collection/types'
import { useT } from '@/i18n/use-t'
import './collection-toolbar.css'

interface CollectionToolbarOption<T extends string = string> {
  value: T
  label: string
}

interface CollectionToolbarChoice<T extends string = string> {
  label: string
  value: T
  options: readonly CollectionToolbarOption<T>[]
  onChange: (value: T) => void
}

/** One filter = one labelled Picker of exclusive options. `exposed` ones sit in the bar; the rest
 *  live in the "Filters & options" panel. */
export type CollectionToolbarFilter<T extends string = string> = CollectionToolbarChoice<T> & { id: string }

/** A yes/no refinement (for example "Include archived"). Always in the panel, never in the bar. */
interface CollectionToolbarCheck {
  key: string
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}

/** An active refinement shown as a removable chip under the bar. */
export interface CollectionToolbarChip {
  key: string
  label: string
  onRemove: () => void
}

export interface CollectionToolbarSearch {
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
}

interface CollectionToolbarField {
  value: string
  label: string
  required?: boolean
}

interface CollectionToolbarFields {
  label: string
  options: readonly CollectionToolbarField[]
  visible: readonly string[]
  onToggle: (field: string, visible: boolean) => void
}

export interface CollectionToolbarSavedViews {
  label: string
  selectedId: string | null
  operation: CollectionViewOperationStatus
  error?: string | null
  errorMessage?: ReactNode
  items: readonly { id: string; name: string }[]
  onLoad?: () => void
  onRetry?: () => void
  onApply: (id: string) => void | Promise<void>
  onSave: (name: string) => unknown | Promise<unknown>
}

export interface CollectionToolbarProps<TPresentation extends string, TView extends string> {
  presentation: CollectionToolbarChoice<TPresentation>
  views: CollectionToolbarChoice<TView>
  search?: CollectionToolbarSearch
  filters?: readonly CollectionToolbarFilter[]
  /** Filter ids that sit in the bar itself; the others go behind "Filters & options". */
  exposedFilterIds?: readonly string[]
  checks?: readonly CollectionToolbarCheck[]
  savedViews?: CollectionToolbarSavedViews
  fields?: CollectionToolbarFields
  /** Active refinements, shown as removable chips under the bar. */
  chips?: readonly CollectionToolbarChip[]
  onClearAll?: () => void
  /** Quick exception filters ("9 overdue"), shown in the line under the bar. */
  scopeActions?: ReactNode
  /** Quick actions that belong inside the disclosed panel at narrow widths. */
  panelActions?: ReactNode
  /** A page-specific label for the disclosure door; collections retain the shared default. */
  optionsLabel?: string
  /** The result count: the right end of the line under the bar. */
  resultSummary?: ReactNode
  /** Where the presentation choice (Feed/Table) sits: in the bar, or behind the Filters door on a phone. */
  presentationIn?: 'bar' | 'panel'
  className?: string
}

/**
 * The one collection toolbar (UX-STANDARD CT1). Left to right: search, the scope picker, the
 * exposed filters, then a "Filters & options" door for the rest. Under it one line carries the
 * exception shortcuts and removable chips on the left and the result count on the right. Every
 * control has a visible label above it. Unsupported capabilities are omitted rather than disabled.
 */
export function CollectionToolbar<TPresentation extends string, TView extends string>({
  presentation,
  views,
  search,
  filters = [],
  exposedFilterIds = [],
  checks = [],
  savedViews,
  fields,
  chips = [],
  onClearAll,
  scopeActions,
  panelActions,
  resultSummary,
  optionsLabel,
  presentationIn = 'bar',
  className,
}: CollectionToolbarProps<TPresentation, TView>) {
  const t = useT()
  const panelId = useId()
  const [panelOpen, setPanelOpen] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [viewName, setViewName] = useState('')
  const doorRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    savedViews?.onLoad?.()
    // A toolbar mounts once per collection; re-loading because a host recreated an inline
    // callback would duplicate requests, so mount is the deliberate lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saving = savedViews?.operation === 'saving'
  const canSave = Boolean(viewName.trim()) && !saving
  const exposed = filters.filter((filter) => exposedFilterIds.includes(filter.id))
  const inPanel = filters.filter((filter) => !exposedFilterIds.includes(filter.id))
  const presentationPicker = presentation.options.length > 1 ? (
    <Picker
      label={presentation.label}
      value={presentation.value}
      options={presentation.options}
      onChange={(value) => presentation.onChange(value as TPresentation)}
      className="collection-toolbar__field"
    />
  ) : null
  const hasPanel = inPanel.length > 0 || checks.length > 0 || Boolean(fields) || Boolean(savedViews) || (presentationIn === 'panel' && presentationPicker !== null)
  const selectedScope = savedViews?.selectedId ? `saved:${savedViews.selectedId}` : views.value

  async function saveView() {
    if (!savedViews || !canSave) return
    let result: unknown
    try {
      result = await savedViews.onSave(viewName.trim())
    } catch {
      return
    }
    // Adapters use null as an explicit persistence failure: keep the draft so the retry can use it.
    if (result === null) return
    setViewName('')
    setSaveOpen(false)
  }

  function closePanel() {
    setPanelOpen(false)
    doorRef.current?.focus()
  }

  return (
    <div className={`collection-toolbar${className ? ` ${className}` : ''}`} data-testid="record-collection-toolbar">
      <div className="collection-toolbar__bar">
        {search ? <SearchField label={search.label} placeholder={search.placeholder} value={search.value} onChange={search.onChange} /> : null}
        <Picker
          label={views.label}
          value={selectedScope}
          options={[
            ...views.options,
            ...(savedViews?.items.map((item) => ({ value: `saved:${item.id}`, label: item.name, group: savedViews.label })) ?? []),
          ]}
          onChange={(value) => {
            if (value.startsWith('saved:')) void savedViews?.onApply(value.slice(6))
            else views.onChange(value as TView)
          }}
          className="collection-toolbar__field collection-toolbar__view"
        />
        {exposed.map((filter) => (
          <Picker
            key={filter.id}
            label={filter.label}
            value={filter.value}
            options={filter.options}
            onChange={filter.onChange}
            className="collection-toolbar__field"
          />
        ))}
        {presentationIn === 'bar' ? presentationPicker : null}
        {hasPanel ? (
          <Button
            ref={doorRef}
            variant="outline"
            className="collection-toolbar__door"
            aria-expanded={panelOpen}
            aria-controls={panelId}
            onClick={() => setPanelOpen((open) => !open)}
          >
            {optionsLabel ?? t('common.filtersAndOptions')}
            {chips.length > 0 ? <span className="collection-toolbar__door-count tabular-nums">{chips.length}</span> : null}
            <svg className="collection-toolbar__door-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </Button>
        ) : null}
      </div>

      {hasPanel && panelOpen ? (
        <div
          id={panelId}
          className="collection-toolbar__panel"
          role="group"
          aria-label={optionsLabel ?? t('common.filtersAndOptions')}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return
            event.preventDefault()
            event.stopPropagation()
            closePanel()
          }}
        >
          {presentationIn === 'panel' ? presentationPicker : null}
          {inPanel.map((filter) => (
            <Picker key={filter.id} label={filter.label} value={filter.value} options={filter.options} onChange={filter.onChange} className="collection-toolbar__field" />
          ))}
          {panelActions ? <div className="collection-toolbar__panel-actions">{panelActions}</div> : null}
          {checks.map((check) => (
            <label key={check.key} className="collection-toolbar__check">
              <input type="checkbox" checked={check.checked} onChange={(event) => check.onChange(event.target.checked)} />
              <span>{check.label}</span>
            </label>
          ))}
          {fields ? (
            <fieldset className="collection-toolbar__fieldset">
              <legend className="collection-toolbar__label">{fields.label}</legend>
              <div className="collection-toolbar__fieldset-grid">
                {fields.options.map((field) => (
                  <label key={field.value} className="collection-toolbar__check">
                    <input
                      type="checkbox"
                      checked={fields.visible.includes(field.value)}
                      disabled={field.required}
                      onChange={(event) => fields.onToggle(field.value, event.target.checked)}
                    />
                    <span>{field.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          {savedViews ? (
            <div className="collection-toolbar__save">
              {saveOpen ? (
                <div role="group" aria-label={t('common.saveCurrentView')} className="collection-toolbar__save-form">
                  <label className="collection-toolbar__save-field">
                    <span className="collection-toolbar__label">{t('common.viewName')}</span>
                    <input
                      autoFocus
                      value={viewName}
                      onChange={(event) => setViewName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          event.preventDefault()
                          event.stopPropagation()
                          setSaveOpen(false)
                        }
                        if (event.key === 'Enter') void saveView()
                      }}
                    />
                  </label>
                  <Button variant="outline" disabled={!canSave} onClick={() => void saveView()}>
                    {saving ? t('common.saving') : t('common.save')}
                  </Button>
                  <Button variant="ghost" onClick={() => setSaveOpen(false)}>{t('common.cancel')}</Button>
                </div>
              ) : (
                <Button variant="ghost" aria-label={t('common.saveView')} onClick={() => setSaveOpen(true)}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" />
                  </svg>
                  {t('common.saveView')}
                </Button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="collection-toolbar__line">
        {resultSummary ? <span className="collection-toolbar__count tabular-nums" role="status">{resultSummary}</span> : null}
        <div className="collection-toolbar__chips">
          {scopeActions}
          {chips.map((chip) => <FilterChip key={chip.key} label={chip.label} onRemove={chip.onRemove} />)}
          {chips.length > 1 && onClearAll ? (
            <button type="button" className="collection-toolbar__clear" onClick={onClearAll}>{t('collection.filter.clearAll')}</button>
          ) : null}
        </div>
      </div>

      {savedViews?.error ? (
        <ErrorState
          className="collection-toolbar__saved-error"
          message={savedViews.errorMessage ?? savedViews.error}
          onRetry={saveOpen && viewName.trim() ? () => void saveView() : savedViews.onRetry}
          retryLabel={t('common.retrySavedViews')}
        />
      ) : null}
    </div>
  )
}
