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

export interface CollectionToolbarFilterChoice {
  key: string
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}

/** One filter = either a native select of exclusive options, OR — #743 ruling round 3 — ONE
 * dropdown-class trigger that opens an anchored popover of CHECKBOX choices (the Fields-chooser
 * pattern: a popover's boxes are not toolbar controls, so the row itself never renders a
 * checkbox). "Include archived" rides the Status control this way: additive to the chosen
 * status, never an exclusive option of a select. */
export type CollectionToolbarFilter<T extends string = string> =
  | (CollectionToolbarChoice<T> & {
      id: string
      /** OD-P3-6: the structural-navy tint for the ACTIVE group control (never a second look-alike
       * filter). The host decides when the control is "active"; the chrome only tints on this flag. */
      tinted?: boolean
    })
  | {
      id: string
      label: string
      /** The trigger's visible text — the chosen value, or the placeholder when nothing is chosen. */
      display: string
      popover: { choices: readonly CollectionToolbarFilterChoice[] }
      tinted?: boolean
    }

export interface CollectionToolbarSearch {
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
}

export interface CollectionToolbarField {
  value: string
  label: string
  required?: boolean
}

export interface CollectionToolbarFields {
  label: string
  options: readonly CollectionToolbarField[]
  visible: readonly string[]
  onToggle: (field: string, visible: boolean) => void
}

/**
 * The search input, standalone (#581). Same markup/classes the toolbar's own query row renders,
 * factored out so a host can plant it OUTSIDE the phone "View & filters" door — a search-and-
 * revisit surface (the Signals archive) needs its search reachable without opening the door,
 * while sort/filter/group stay behind it. Desktop hosts keep using the toolbar's built-in row;
 * this is for the one caller that needs the two halves split.
 */
export function CollectionToolbarSearchField({ search }: { search: CollectionToolbarSearch }) {
  return (
    <div className="collection-toolbar__query">
      <label className="collection-toolbar__search tap-floor">
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
    </div>
  )
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
  fields?: CollectionToolbarFields
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
  /**
   * #581: the caller has already rendered `CollectionToolbarSearchField` itself (outside a phone
   * "View & filters" door) and does not want this toolbar's own query row duplicating it. Opt-in
   * and off by default — every other caller (Tasks included) keeps rendering search here.
   */
  hideSearchRow?: boolean
}

/**
 * The one visible RecordCollection control grammar. Domains supply typed labels/options, while
 * this component owns the order, geometry, keyboard-capable primitives, saved-view door, and
 * responsive wrapping. Unsupported capabilities are omitted rather than shown disabled.
 *
 * Desktop anatomy (OD-WAY-89): row 1 is the ONE view axis — a labelled saved-view chip strip
 * (presets + user-saved views together) FIRST-left, the presentation switch RIGHT — and it
 * renders only when two or more presentations are live (#743 AC-003; no dead tabs). Row 2 is
 * search followed by a compact inline row holding domain filters, group, sort, Fields, Save
 * view, and the single attention slot. The controls remain in normal document order without a
 * desktop door.
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
  fields,
  primaryAction,
  className,
  reserved = false,
  hideSearchRow = false,
}: CollectionToolbarProps<TPresentation, TView>) {
  const t = useT()
  const isDesktop = useIsDesktop()
  const [saveOpen, setSaveOpen] = useState(false)
  const [viewName, setViewName] = useState('')
  const [fieldsOpen, setFieldsOpen] = useState(false)
  // One popover filter open at a time — opening one closes the other (same row discipline as the
  // save-view zone; Fields keeps its own state so the two doors stay independent as today).
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null)
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
  const hasViewOptions = !reserved && (Boolean(search) || filters.length > 0 || Boolean(savedViews) || Boolean(toggles) || Boolean(fields))

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
          views together) leads left; the presentation switch trails right. */}
      <div className="collection-toolbar__row" data-testid="collection-toolbar-row">
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

          {/* Presentation switching is a desktop control; phone cards intentionally have no tabs.
              Reserved views have no rows to re-present (DO-6). #743 AC-003: a strip with one live
              presentation is a dead tab — render only from two live options up. */}
          {isDesktop && !reserved && presentation.options.length >= 2 && (
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
      </div>

      {/* Row 2: search, domain controls, ghost actions, and the single attention slot. */}
      {hasViewOptions ? (
        <div className="collection-toolbar__row" data-testid="collection-toolbar-row">
          <div
            className="collection-toolbar__options"
            role="group"
            aria-label={t('common.viewAndFilters')}
            // Desktop owns traversal for its always-visible row. Phone traversal and Escape belong
            // to the host's outer ViewOptionsDisclosure.
            onKeyDown={isDesktop ? viewOptionsTraversal : undefined}
          >
            {!hideSearchRow && search ? <CollectionToolbarSearchField search={search} /> : null}
            {filters.map((filter) => (
              'popover' in filter ? (
                <div
                  key={filter.id}
                  className={`collection-toolbar__option-field${filter.tinted ? ' collection-toolbar__option-field--group' : ''}`}
                >
                  {!isDesktop ? <span>{filter.label}</span> : null}
                  {/* ONE dropdown-class control: the trigger borrows the select-box chrome. The
                      choices render in the anchored Fields-menu popover (audit C20/I3 — never a
                      new toolbar row), so a closed row holds zero checkboxes. */}
                  <div className="collection-toolbar__select collection-toolbar__choice">
                    <button
                      type="button"
                      className="mk-select__box collection-toolbar__choice-trigger"
                      aria-label={filter.label}
                      aria-haspopup="true"
                      aria-expanded={openPopoverId === filter.id}
                      onClick={() => setOpenPopoverId(openPopoverId === filter.id ? null : filter.id)}
                    >
                      <span className="mk-select__field">{filter.display}</span>
                      <span className="mk-select__chevron" aria-hidden="true">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </span>
                    </button>
                    {openPopoverId === filter.id ? (
                      <div role="group" aria-label={filter.label} className="collection-toolbar__fields-menu">
                        {filter.popover.choices.map((choice) => (
                          <label key={choice.key} className="collection-toolbar__toggle">
                            <input
                              type="checkbox"
                              checked={choice.checked}
                              onChange={(event) => choice.onChange(event.target.checked)}
                            />
                            <span>{choice.label}</span>
                          </label>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <label
                  key={filter.id}
                  className={`collection-toolbar__option-field${filter.tinted ? ' collection-toolbar__option-field--group' : ''}`}
                >
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
              )
            ))}
            {fields ? (
              <div className="collection-toolbar__fields">
                <Button variant="ghost" aria-expanded={fieldsOpen} onClick={() => setFieldsOpen((open) => !open)}>
                  {fields.label}
                </Button>
                {fieldsOpen ? (
                  <div role="group" aria-label={fields.label} className="collection-toolbar__fields-menu">
                    {fields.options.map((field) => (
                      <label key={field.value} className="collection-toolbar__toggle">
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
                ) : null}
              </div>
            ) : null}
            {savedViews ? (
              // AC-007 (#743): the Save view door is an ANCHORED POPOVER (audit C20/I3) — it must
              // never grow the toolbar a row, so the trigger and the popover share one relative
              // zone and the popover lays out over the row below it.
              <div className="collection-toolbar__save-zone">
                <Button
                  variant="ghost"
                  ref={saveTriggerRef}
                  aria-expanded={saveOpen}
                  onClick={() => {
                    if (saveOpen) closeSaveView()
                    else setSaveOpen(true)
                  }}
                  onKeyDown={(event) => {
                    // The save popover owns Escape: it closes and refocuses its trigger without
                    // bubbling into the options row's own keyboard handling.
                    if (!saveOpen || event.key !== 'Escape') return
                    event.preventDefault()
                    event.stopPropagation()
                    closeSaveView()
                  }}
                >
                  {t('common.saveView')}
                </Button>
                {saveOpen ? (
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
                    <div className="collection-toolbar__save-actions">
                      <Button variant="primary" disabled={!canSave} onClick={() => void saveView()}>
                        {saving ? t('common.saving') : t('common.save')}
                      </Button>
                      <Button variant="ghost" onClick={closeSaveView}>{t('common.cancel')}</Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            {toggles}
          </div>
        </div>
      ) : null}
    </div>
  )
}
