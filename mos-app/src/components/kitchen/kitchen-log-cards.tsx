// KitchenLogCards — the phone reflow (plan §4.1 N8, §8.2).
// Planned section: cards (each composing <WipItemStepper> + a status delta <Pill> +
// category caption). Off-plan section: "+ Add another dish" expander — collapsed by
// default WHEN there are planned items; a search box reveals on expand. When there
// are NO planned items, off-plan expands as the primary content (AC-021 parity: an
// off-plan-only day must keep every dish interactable without an extra tap).
// Token-only (DESIGN.md); reuses WipItemStepper unchanged (AC-020/021/022 labels).

import { useState } from 'react'
import type { WipItemOption, KitchenLogLine, KitchenActionType } from '@/lib/db/kitchen-logs.types'
import { kitchenStatus } from '@/lib/kitchen-status'
import { WipItemStepper } from './wip-item-stepper'
import { Pill } from '@/components/ui/pill'
import { KitchenGroupHeader } from './kitchen-group-header'
import './kitchen-log-cards.css'

interface KitchenLogCardsProps {
  items: WipItemOption[]
  lines: Record<string, KitchenLogLine>
  actionType: KitchenActionType
  search: string
  category: string
  collapsedGroups: Set<string>
  onQtyChange: (itemId: string, qty: number) => void
  onNotesChange: (itemId: string, note: string) => void
  onToggleGroup: (key: string) => void
  onSearchChange: (s: string) => void
  onCategoryChange: (c: string) => void
  disabled?: boolean
}

export function KitchenLogCards({
  items, lines, actionType, search, onQtyChange, onNotesChange, onSearchChange, disabled,
}: KitchenLogCardsProps) {
  const planned = items.filter(it => (lines[it.id]?.plan_qty ?? 0) > 0)
  const offPlan = items.filter(it => (lines[it.id]?.plan_qty ?? 0) <= 0)
  const plannedDishCount = planned.length

  // Off-plan collapse: collapsed by default ONLY when there are planned items.
  // When plannedDishCount === 0, off-plan is the primary content (expanded).
  const [userExpandedOffplan, setUserExpandedOffplan] = useState(false)
  const offplanCollapsed = plannedDishCount > 0 && !userExpandedOffplan

  const q = search.trim().toLowerCase()
  const filteredOffPlan = offPlan.filter(it => !q || it.name.toLowerCase().includes(q))

  return (
    <div className="klc">
      {/* Planned today — always expanded, plan-first */}
      {plannedDishCount > 0 && (
        <section className="klc-section">
          <KitchenGroupHeader
            variant="cards"
            label="Planned today"
            count={plannedDishCount}
            collapsed={false}
            onToggle={() => {}}
          />
          <div className="klc-cards">
            {planned.map(item => (
              <KitchenLogCard
                key={item.id}
                item={item}
                line={lines[item.id]}
                actionType={actionType}
                onQtyChange={qty => onQtyChange(item.id, qty)}
                onNotesChange={note => onNotesChange(item.id, note)}
                disabled={disabled}
              />
            ))}
          </div>
        </section>
      )}

      {/* Off-plan — expander when there are planned items; primary content otherwise */}
      <section className="klc-section">
        <KitchenGroupHeader
          variant="cards"
          label="Off-plan"
          count={offPlan.length}
          sub="log as produced"
          collapsed={offplanCollapsed}
          onToggle={() => setUserExpandedOffplan(v => !v)}
        />
        {plannedDishCount > 0 ? (
          offplanCollapsed ? (
            <button
              type="button"
              className="klc-expander"
              aria-expanded={false}
              aria-label="Add another dish"
              onClick={() => setUserExpandedOffplan(true)}
            >
              + Add another dish
            </button>
          ) : (
            <div className="klc-offplan-open">
              <input
                type="search"
                className="klc-search"
                placeholder="Find an off-plan dish"
                aria-label="Find an off-plan dish"
                value={search}
                onChange={e => onSearchChange(e.target.value)}
              />
              <div className="klc-cards">
                {filteredOffPlan.map(item => (
                  <KitchenLogCard
                    key={item.id}
                    item={item}
                    line={lines[item.id]}
                    actionType={actionType}
                    onQtyChange={qty => onQtyChange(item.id, qty)}
                    onNotesChange={note => onNotesChange(item.id, note)}
                    disabled={disabled}
                  />
                ))}
              </div>
            </div>
          )
        ) : (
          // No planned items → off-plan is the primary content (no expander)
          <div className="klc-cards">
            {filteredOffPlan.map(item => (
              <KitchenLogCard
                key={item.id}
                item={item}
                line={lines[item.id]}
                actionType={actionType}
                onQtyChange={qty => onQtyChange(item.id, qty)}
                onNotesChange={note => onNotesChange(item.id, note)}
                disabled={disabled}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// ── One phone card: mock-B anatomy around the reused WipItemStepper ──────────
function KitchenLogCard({
  item, line, actionType, onQtyChange, onNotesChange, disabled,
}: {
  item: WipItemOption
  line: KitchenLogLine
  actionType: KitchenActionType
  onQtyChange: (qty: number) => void
  onNotesChange: (note: string) => void
  disabled?: boolean
}) {
  const status = kitchenStatus({ made: line.qty_porsi, plan: line.plan_qty, isOffPlan: line.plan_qty <= 0 })
  return (
    <div className="klc-card">
      {item.category && <span className="klc-cat">{item.category}</span>}
      <Pill className="klc-status" tone={status.tone} dot={status.dot ?? true}>{status.label}</Pill>
      <WipItemStepper
        itemName={item.name}
        line={line}
        actionType={actionType}
        onQtyChange={onQtyChange}
        onNotesChange={onNotesChange}
        disabled={disabled}
      />
    </div>
  )
}
