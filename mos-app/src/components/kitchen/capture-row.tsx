// CaptureTable + CaptureRow — the ONE capture row every Café entry list wears (Production, Transfer, Plan,
// Request, Receive, Count, Waste). DESIGN.md "Capture row":
//   left   : item name (+ kind tag, + the category muted after it) and a muted meta line only when the row has more to say
//   right  : [reference figure(s), right-aligned with their unit] [quantity box, fixed width] [unit, fixed column] [action]
// Every column is a fixed track set once on the table, so the n-th box and unit of every row start at the same x
// whatever the item or unit is called. Below the width the right-hand group needs, the SAME row stacks: name and
// meta on top, the figures in one muted line, then one aligned control line (box, unit) and the action under it.
// Layout follows the list's own width (not the screen's), so a list beside a side panel stacks too.
import { Children, Fragment, createContext, useContext, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { DataTableGroup } from '@/components/dashboard/data-table'
import { GroupHeader } from '@/components/ui/group-header'
import { SortIndicator } from '@/components/ui/sort-indicator'
import { useT } from '@/i18n/use-t'
import { kitchenCategoryLabel } from '@/lib/kitchen-category-label'
import '@/components/dashboard/data-table.css'
import '@/components/kitchen/cafe-capture-layout.css'
import './capture-row.css'

/** One item's typed entry on the plain-input lists (Request, Receive). */
export type CafeItemQuantityEntry = { quantity: string; unitId: string; changingUnit: boolean }

export type CaptureGroup<Row> = Omit<DataTableGroup<Row>, 'count'> & { count?: number | string }

type CaptureColumns = {
  /** Header over the item column. */
  item: ReactNode
  /** The list follows this sort (shows the direction arrow on the item header). */
  itemSort?: 'asc' | 'desc'
  /** Headers over the reference figures (Plan, Stock, Available ...), in the order every row passes them. */
  figures?: ReactNode[]
  /** One entry per quantity group: its header (over the box) and the unit header (default "Unit"). */
  controls: { label: ReactNode; unit?: ReactNode | null }[]
  /** Header over the action column (Photo ...); omit when no row has an action. */
  action?: ReactNode
  /** Width of the action column in rem (default 11, enough for a two-line button). */
  actionRem?: number
}

type TableShape = { figures: number; controls: number; action: boolean; actionRem: number; compact?: boolean }
type TableLayout = TableShape & { layout: 'wide' | 'narrow' }
const DEFAULT_ACTION_REM = 11
const ShapeContext = createContext<TableLayout>({ figures: 0, controls: 1, action: false, actionRem: DEFAULT_ACTION_REM, layout: 'wide' })

// The right-hand group's width in rem (matches the track widths in capture-row.css) plus the item column's floor:
// under this list width the row stacks.
const REM = { item: 14, figure: 8.25, control: 16.5, compactControl: 6.5, gap: 0.5 }
function wideMinRem({ figures, controls, action, actionRem, compact }: TableShape): number {
  const tracks = figures + controls + (action ? 1 : 0)
  return REM.item + figures * REM.figure + controls * (compact ? REM.compactControl : REM.control) + (action ? actionRem : 0) + tracks * REM.gap + 1
}

/** 'wide' while the list is at least as wide as its row needs, else 'narrow'. Set before paint, kept by a ResizeObserver. */
function useCaptureLayout(shape: TableShape) {
  const ref = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState<'wide' | 'narrow'>('wide')
  const min = wideMinRem(shape)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const width = el.getBoundingClientRect().width
      if (width === 0) return // not laid out (test DOM, hidden tab): keep the last answer
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      setLayout(width / rem >= min ? 'wide' : 'narrow')
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [min])
  return { ref, layout }
}

export type CaptureTableProps<Row extends { id: string }> = {
  caption: string
  columns: CaptureColumns
  rows?: Row[]
  groups?: CaptureGroup<Row>[]
  renderRow: (row: Row) => ReactNode
  state?: 'ready' | 'loading' | 'empty' | 'error'
  emptyLabel?: ReactNode
  onRetry?: () => void
  defaultCollapsedGroupKeys?: ReadonlySet<string>
  /** Controlled collapse (Count keeps its own set for its section index). */
  collapsedGroupKeys?: ReadonlySet<string>
  onToggleGroup?: (key: string) => void
  /** Keep the header for assistive tech but do not show it (a read-only list with nothing to label). */
  hideHead?: boolean
  /** Several quantity groups as quantity-only boxes under one header row (Plan): the unit is said once, on the item. */
  compact?: boolean
  className?: string
}

export function CaptureTable<Row extends { id: string }>({
  caption, columns, rows = [], groups, renderRow, state = 'ready', emptyLabel, onRetry,
  defaultCollapsedGroupKeys, collapsedGroupKeys, onToggleGroup, hideHead = false, compact = false, className,
}: CaptureTableProps<Row>) {
  const t = useT()
  const shape: TableShape = { figures: columns.figures?.length ?? 0, controls: columns.controls.length, action: columns.action !== undefined, actionRem: columns.actionRem ?? DEFAULT_ACTION_REM, compact }
  const { ref, layout } = useCaptureLayout(shape)
  const [internalCollapsed, setInternalCollapsed] = useState<Set<string>>(() => new Set(defaultCollapsedGroupKeys ?? []))
  const collapsed = collapsedGroupKeys ?? internalCollapsed
  const toggle = (key: string) => {
    if (onToggleGroup) { onToggleGroup(key); return }
    setInternalCollapsed(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next })
  }

  if (state === 'error') {
    return (
      <div className="dt-error" role="alert">
        <p className="dt-error-text">{t('common.loadFailed', { what: t('common.what.table') })}</p>
        {onRetry && <button type="button" className="dt-retry" onClick={onRetry}>{t('common.retry')}</button>}
      </div>
    )
  }
  const unitHeading = t('cafe.capture.unitHeading')
  return (
    <ShapeContext.Provider value={{ ...shape, layout }}>
      <div
        ref={ref}
        role="table"
        aria-label={caption}
        className={['cap-table', className].filter(Boolean).join(' ')}
        data-layout={layout}
        data-figures={shape.figures}
        data-controls={shape.controls}
        data-compact={compact ? '' : undefined}
        data-action={shape.action ? '' : undefined}
        // One track per control, however many a stream's destinations make (Plan has Production plus every destination).
        style={{
          '--cap-ctl-cols': `repeat(${shape.controls}, var(--cap-control-w))`,
          ...(shape.action && shape.actionRem !== DEFAULT_ACTION_REM ? { '--cap-act-w': `${shape.actionRem}rem` } : {}),
        } as CSSProperties}
      >
        <div role="rowgroup">
          <div role="row" className={hideHead ? 'cap-head cap-head--hidden' : 'cap-head'}>
            <div role="columnheader" className="cap-head__item">{columns.item}{columns.itemSort && <SortIndicator dir={columns.itemSort} />}</div>
            <div role="presentation" className="cap-head__figures">
              {columns.figures?.map((label, index) => <div role="columnheader" className="cap-head__figure" key={index}>{label}</div>)}
            </div>
            {columns.controls.map((control, index) => (
              <div role="columnheader" className={`cap-head__control${index > 0 ? ' cap-head__control--extra' : ''}${control.unit === null ? ' cap-head__control--label' : ''}`} key={index}>
                <span>{control.label}</span>{control.unit !== null && <span className="cap-head__unit">{control.unit ?? unitHeading}</span>}
              </div>
            ))}
            {columns.action !== undefined && <div role="columnheader" className="cap-head__action">{columns.action}</div>}
          </div>
        </div>
        <div role="rowgroup" className="cap-body">
          {state === 'loading' && Array.from({ length: 6 }, (_, index) => <div role="row" className="cap-skeleton" key={index}><div role="cell"><span className="dt-skeleton-block" /></div></div>)}
          {state === 'empty' && <div role="row"><div role="cell" className="dt-empty">{emptyLabel ?? t('common.noRows')}</div></div>}
          {state === 'ready' && !groups && rows.map(row => <Fragment key={row.id}>{renderRow(row)}</Fragment>)}
          {state === 'ready' && groups && groups.map(group => (
            <Fragment key={group.key}>
              {group.label !== null && (
                <div role="row" className="cap-group">
                  <div role="rowheader" className="cap-group__cell">
                    <GroupHeader
                      id={group.anchorId}
                      className="dt-group-bar"
                      label={group.label}
                      count={group.count ?? group.rows.length}
                      open={!collapsed.has(group.key)}
                      onToggle={() => toggle(group.key)}
                      trailing={<>{group.hint ? <span className="dt-group-hint">{group.hint}</span> : null}{group.headerActions ? <span className="dt-group-actions">{group.headerActions}</span> : null}</>}
                    />
                  </div>
                </div>
              )}
              {!collapsed.has(group.key) && group.rows.map(row => <Fragment key={`${group.key}:${row.id}`}>{renderRow(row)}</Fragment>)}
            </Fragment>
          ))}
        </div>
      </div>
    </ShapeContext.Provider>
  )
}

export type CaptureFigure = {
  /** The column's name (Plan, Stock, Available): the header says it on wide lists, the row itself on stacked ones. */
  label: string
  /** The formatted quantity; omit for an empty cell. */
  value?: ReactNode
  /** The unit the figure is in, shown after the number. */
  unit?: string | null
}

/** One quantity group: its box + unit, as built by CaptureControl or CaptureQuantityControl. */
type CaptureControlSlot = { node: ReactNode; label?: string }

export type CaptureRowProps = {
  /** Stable id of the item; names the row for assistive tech. */
  id: string
  name: string
  /** RAW / WIP; shown as a small tag before the name. Omit when the whole list is one kind. */
  kind?: string | null
  /** The item's category, muted: after the name on a wide list; first in the one muted line with the figures on a stacked one. */
  category?: string | null
  /** More for the one muted meta line: status badge, not-on-stream tag, missing-unit text. */
  meta?: ReactNode
  figures?: CaptureFigure[]
  controls: CaptureControlSlot[]
  /** Add photo: after the unit. */
  action?: ReactNode
  /** Full-width line under the row: errors, notes, hints. */
  detail?: ReactNode
  className?: string
}

export function CaptureRow({ id, name, kind, category, meta, figures = [], controls, action, detail, className }: CaptureRowProps) {
  const t = useT()
  const shape = useContext(ShapeContext)
  const nameId = `capture-row-${useId()}-${id}`
  const categoryText = category ? kitchenCategoryLabel(t, category) : null
  const hasDetail = Children.toArray(detail).length > 0
  return (
    <div role="row" className={['cap-row', className].filter(Boolean).join(' ')} aria-labelledby={nameId}>
      <div role="rowheader" className="cap-row__item">
        <div className="cap-row__line">
          <div id={nameId} className="cap-row__name" title={`${kind ? `${kind} - ` : ''}${name}`}>
            {kind && <span className="cap-row__kind">{kind}<span className="cap-vh"> - </span></span>}
            <span>{name}</span>
          </div>
          {categoryText && shape.layout === 'wide' && <span className="cap-row__cat">{categoryText}</span>}
        </div>
        {meta && <div className="cap-row__meta">{meta}</div>}
      </div>
      <div role="presentation" className="cap-row__figures">
        {categoryText && shape.layout === 'narrow' && <span className="cap-row__cat">{categoryText}</span>}
        {Array.from({ length: shape.figures }, (_, index) => {
          const figure = figures[index]
          return (
            <div role="cell" className="cap-fig" key={index}>
              {figure && figure.value != null && <>
                <span className="cap-fig__label">{figure.label}</span>
                <span className="cap-fig__num tabular">{figure.value}</span>
                {figure.unit ? <span className="cap-fig__unit" title={figure.unit}>{figure.unit}</span> : null}
              </>}
            </div>
          )
        })}
      </div>
      {Array.from({ length: shape.controls }, (_, index) => {
        const control = controls[index]
        return (
          <div role="cell" className="cap-row__control" key={index}>
            {control?.label && shape.controls > 1 && <span className="cap-row__control-label">{control.label}</span>}
            {control?.node}
          </div>
        )
      })}
      {shape.action && <div role="cell" className="cap-row__action">{action}</div>}
      {hasDetail && <div role="cell" className="cap-row__detail">{detail}</div>}
    </div>
  )
}

/** The box + unit of one quantity group: two fixed tracks, the box at the same x on every row. */
export function CaptureControl({ children }: { children: ReactNode }) {
  return <div className="cap-control">{children}</div>
}

/** Plain typed box + fixed unit text, with the optional "change unit" choice and extras (Request, Receive, Count). */
export function CaptureQuantityControl({
  id, itemName, quantityFor, value, unitName, invalid = false, describedById, disabled = false, enterKeyHint,
  units, selectedUnitId, changingUnit = false, onQuantityChange, onQuantityBlur, onToggleUnit, onUnitChange, children,
}: {
  id: string
  itemName: string
  quantityFor: string
  value: string
  unitName: string
  invalid?: boolean
  describedById?: string
  disabled?: boolean
  enterKeyHint?: 'next'
  units?: ReadonlyArray<{ id: string; name: string }>
  selectedUnitId?: string
  changingUnit?: boolean
  onQuantityChange: (value: string) => void
  onQuantityBlur?: () => void
  onToggleUnit?: () => void
  onUnitChange?: (unitId: string) => void
  children?: ReactNode
}) {
  const t = useT()
  return (
    <CaptureControl>
      <input
        id={id}
        className="cap-qty"
        aria-label={quantityFor}
        type="text"
        inputMode="decimal"
        {...(enterKeyHint ? { enterKeyHint } : {})}
        autoComplete="off"
        value={value}
        aria-invalid={invalid || undefined}
        aria-describedby={[`${id}-unit`, describedById].filter(Boolean).join(' ')}
        disabled={disabled}
        onChange={event => onQuantityChange(event.target.value)}
        onBlur={onQuantityBlur}
      />
      <span id={`${id}-unit`} className="cap-unit" title={unitName}>{unitName}</span>
      {units && units.length > 1 && onToggleUnit && (
        <button type="button" className="cap-link" aria-expanded={changingUnit} disabled={disabled} onClick={onToggleUnit}>
          {t('cafe.receive.changeUnit')}
        </button>
      )}
      {units && units.length > 1 && changingUnit && onUnitChange && (
        <fieldset className="cap-units" aria-label={t('cafe.receive.unitFor', { item: itemName })}>
          <legend>{t('cafe.receive.unitLabel')}</legend>
          {units.map(unit => (
            <label key={unit.id}>
              <input type="radio" name={`${id}-unit`} value={unit.id} checked={unit.id === selectedUnitId} disabled={disabled} onChange={() => onUnitChange(unit.id)} />
              {unit.name}
            </label>
          ))}
        </fieldset>
      )}
      {children}
    </CaptureControl>
  )
}
