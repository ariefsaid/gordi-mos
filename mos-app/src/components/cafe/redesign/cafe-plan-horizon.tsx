import type { ReactNode } from 'react'

export type PlanHorizonDate<Row> = { date: string; rows: Row[] }

/** Persistent date index plus expanded date/action/item reading order for Pesanan. */
export function PlanHorizon<Row>({ dates, getAction, renderRow, dateLabel, indexLabel, actionLabel, itemLabel }: {
  dates: PlanHorizonDate<Row>[]
  getAction: (row: Row) => string
  renderRow: (row: Row) => ReactNode
  dateLabel: (date: string) => string
  indexLabel: string
  actionLabel: string
  itemLabel: string
}) {
  return <div className="cafe-plan-horizon kp-horizon">
    <nav className="cafe-plan-horizon__index" aria-label={indexLabel}>
      {dates.map(({ date }) => <a key={date} href={`#plan-date-${date}`}>{dateLabel(date)}</a>)}
    </nav>
    <div className="cafe-plan-horizon__dates">
      {dates.map(({ date, rows }) => {
        const actions = new Map<string, Row[]>()
        for (const row of rows) {
          const action = getAction(row)
          actions.set(action, [...(actions.get(action) ?? []), row])
        }
        return <section className="cafe-plan-horizon__date" id={`plan-date-${date}`} key={date}>
          <h2>{dateLabel(date)}</h2>
          {[...actions].map(([action, actionRows]) => <section className="cafe-plan-horizon__action" key={action}>
            <h3>{action}</h3>
            <div className="cafe-plan-horizon__columns" aria-hidden="true"><span>{itemLabel}</span><span>{actionLabel}</span></div>
            <ul>{actionRows.map((row, index) => <li key={`${date}-${action}-${index}`}>{renderRow(row)}</li>)}</ul>
          </section>)}
        </section>
      })}
    </div>
  </div>
}
