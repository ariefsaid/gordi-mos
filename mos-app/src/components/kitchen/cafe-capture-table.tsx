import type { ReactNode } from 'react'
import { DataTable, type DataTableColumn, type DataTableGroup, type DataTableProps } from '@/components/dashboard/data-table'
import { useT } from '@/i18n/use-t'
import { kitchenCategoryLabel } from '@/lib/kitchen-category-label'
import '@/components/kitchen/cafe-capture-controls.css'
import '@/components/kitchen/cafe-capture-layout.css'

export type CafeCaptureTableItem = {
  id: string
  name: string
  kind?: string | null
  category?: string | null
}

export type CafeItemQuantityEntry = { quantity: string; unitId: string; changingUnit: boolean }

type CafeCaptureTableProps<Row extends CafeCaptureTableItem> = {
  rows: Row[]
  caption: string
  quantityHeader: string
  isDesktop: boolean
  renderControls: (row: Row) => ReactNode
  renderItemMeta?: (row: Row) => ReactNode
  renderItemDetails?: (row: Row) => ReactNode
  renderCardDetails?: (row: Row) => ReactNode
  renderFeedback?: (row: Row) => ReactNode
  showCategory?: boolean | ((row: Row) => boolean)
  groups?: DataTableGroup<Row>[]
  state?: DataTableProps<Row>['state']
  emptyLabel?: string
  onRetry?: () => void
  defaultCollapsedGroupKeys?: ReadonlySet<string>
  rowClassName?: DataTableProps<Row>['rowClassName']
  cardClassName?: string
  cardWrapperClassName?: string
  cardLayout?: 'stacked' | 'inline'
  className?: string
  tableClassName?: string
}

function categoryIsVisible<Row extends CafeCaptureTableItem>(
  item: Row,
  showCategory: CafeCaptureTableProps<Row>['showCategory'],
): boolean {
  return typeof showCategory === 'function' ? showCategory(item) : showCategory !== false
}

function CafeCaptureItemIdentity({
  item,
  meta,
  details,
  showCategory,
  id,
}: {
  item: CafeCaptureTableItem
  meta?: ReactNode
  details?: ReactNode
  showCategory: boolean
  id: string
}) {
  const t = useT()
  const category = showCategory && item.category ? kitchenCategoryLabel(t, item.category) : null
  const title = `${item.kind ? `${item.kind} - ` : ''}${item.name}${category ? ` · ${category}` : ''}`
  return (
    <div className="cafe-capture-item">
      <div id={id} className="cafe-capture-item__name" title={title}>
        {item.kind && <><span>{item.kind} - </span><span>{item.name}</span></>}
        {!item.kind && item.name}
      </div>
      {category && <div className="cafe-capture-item__category">{category}</div>}
      {meta && <div className="cafe-capture-item__meta">{meta}</div>}
      {details && <div className="cafe-capture-item__details">{details}</div>}
    </div>
  )
}

export function CafeCaptureRow<Row extends CafeCaptureTableItem>({
  item,
  controls,
  itemMeta,
  cardDetails,
  feedback,
  showCategory = true,
  className = '',
  layout = 'stacked',
}: {
  item: Row
  controls: ReactNode
  itemMeta?: ReactNode
  cardDetails?: ReactNode
  feedback?: ReactNode
  showCategory?: boolean
  className?: string
  layout?: 'stacked' | 'inline'
}) {
  const itemId = `cafe-capture-item-${item.id}`
  return (
    <div className={`cafe-capture-row cafe-capture-row--${layout} ${className}`.trim()} role="group" aria-labelledby={itemId}>
      <CafeCaptureItemIdentity item={item} meta={itemMeta} showCategory={showCategory} id={itemId} />
      <div className="cafe-capture-row__controls">{controls}</div>
      {cardDetails && <div className="cafe-capture-row__details">{cardDetails}</div>}
      {feedback && <div className="cafe-capture-row__feedback">{feedback}</div>}
    </div>
  )
}

export function CafeCaptureQuantityControl({
  id,
  itemName,
  quantityFor,
  value,
  unitName,
  invalid = false,
  describedById,
  disabled = false,
  enterKeyHint,
  units,
  selectedUnitId,
  changingUnit = false,
  onQuantityChange,
  onToggleUnit,
  onUnitChange,
  children,
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
  onToggleUnit?: () => void
  onUnitChange?: (unitId: string) => void
  children?: ReactNode
}) {
  const t = useT()
  return (
    <div className="cafe-count__input-group">
      <label htmlFor={id} className="sr-only">{quantityFor}</label>
      <div className="cafe-count__quantity-control">
        <input
          id={id}
          className="cafe-capture-quantity-field"
          aria-label={quantityFor}
          type="text"
          inputMode="decimal"
          {...(enterKeyHint ? { enterKeyHint } : {})}
          autoComplete="off"
          value={value}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid || describedById ? describedById : undefined}
          disabled={disabled}
          onChange={event => onQuantityChange(event.target.value)}
        />
        <span className="cafe-count__unit cafe-capture-unit" aria-label={unitName} title={unitName}>{unitName}</span>
      </div>
      {units && units.length > 1 && onToggleUnit && (
        <button
          type="button"
          className="cafe-receive__change-unit"
          aria-expanded={changingUnit}
          disabled={disabled}
          onClick={onToggleUnit}
        >
          {t('cafe.receive.changeUnit')}
        </button>
      )}
      {units && units.length > 1 && changingUnit && onUnitChange && (
        <fieldset className="cafe-receive__units" aria-label={t('cafe.receive.unitFor', { item: itemName })}>
          <legend>{t('cafe.receive.unitLabel')}</legend>
          {units.map(unit => (
            <label key={unit.id}>
              <input
                type="radio"
                name={`${id}-unit`}
                value={unit.id}
                checked={unit.id === selectedUnitId}
                disabled={disabled}
                onChange={() => onUnitChange(unit.id)}
              />
              {unit.name}
            </label>
          ))}
        </fieldset>
      )}
      {children}
    </div>
  )
}

export function CafeCaptureTable<Row extends CafeCaptureTableItem>({
  rows,
  caption,
  quantityHeader,
  isDesktop,
  renderControls,
  renderItemMeta,
  renderItemDetails,
  renderCardDetails,
  renderFeedback,
  showCategory = true,
  groups,
  state = 'ready',
  emptyLabel,
  onRetry,
  defaultCollapsedGroupKeys,
  rowClassName,
  cardClassName,
  cardWrapperClassName,
  cardLayout = 'stacked',
  className,
  tableClassName,
}: CafeCaptureTableProps<Row>) {
  const t = useT()
  const columns: DataTableColumn<Row>[] = [
    {
      key: 'item',
      header: t('kitchen.log.col.item'),
      cardLabel: '',
      render: item => (
        <CafeCaptureItemIdentity
          item={item}
          meta={renderItemMeta?.(item)}
          details={renderItemDetails?.(item)}
          showCategory={categoryIsVisible(item, showCategory)}
          id={`cafe-capture-item-${item.id}`}
        />
      ),
    },
    {
      key: 'quantity',
      header: quantityHeader,
      cardLabel: '',
      render: renderControls,
    },
  ]
  const renderCard = (item: Row) => {
    const card = (
      <CafeCaptureRow
        item={item}
        controls={renderControls(item)}
        itemMeta={renderItemMeta?.(item)}
        cardDetails={renderCardDetails?.(item)}
        feedback={renderFeedback?.(item)}
        showCategory={categoryIsVisible(item, showCategory)}
        className={cardClassName}
        layout={cardLayout}
      />
    )
    return cardWrapperClassName ? <div className={cardWrapperClassName}>{card}</div> : card
  }
  const renderRowDetail = renderFeedback
    ? (item: Row) => {
        const feedback = renderFeedback(item)
        return feedback ? <div className="cafe-capture-row__feedback">{feedback}</div> : null
      }
    : undefined

  return (
    <div className={['cafe-capture-table', className].filter(Boolean).join(' ')}>
      <DataTable
        columns={columns}
        rows={rows}
        groups={groups}
        tableClassName={tableClassName}
        defaultCollapsedGroupKeys={defaultCollapsedGroupKeys}
        rowClassName={rowClassName}
        renderCard={renderCard}
        renderRowDetail={renderRowDetail}
        isDesktop={isDesktop}
        state={state}
        emptyLabel={emptyLabel}
        onRetry={onRetry}
        caption={caption}
      />
    </div>
  )
}
