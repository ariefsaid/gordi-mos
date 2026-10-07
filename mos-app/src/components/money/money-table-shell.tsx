import type { ReactNode } from 'react'
import './money-table-shell.css'

export interface MoneyTableShellProps {
  className?: string
  tableClassName?: string
  beforeTable?: ReactNode
  afterTable?: ReactNode
  children: ReactNode
}

export function MoneyTableShell({ className, tableClassName, beforeTable, afterTable, children }: MoneyTableShellProps) {
  return (
    <div className={`money-table-block${className ? ` ${className}` : ''}`}>
      <div className="money-table-scroll">
        {beforeTable}
        <table className={`money-table${tableClassName ? ` ${tableClassName}` : ''}`}>
          {children}
        </table>
      </div>
      {afterTable}
    </div>
  )
}
