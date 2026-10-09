import type { ReactNode, Ref } from 'react'
import './money-table-shell.css'

export interface MoneyTableShellProps {
  className?: string
  tableClassName?: string
  beforeTable?: ReactNode
  afterTable?: ReactNode
  scrollRef?: Ref<HTMLDivElement>
  children: ReactNode
}

export function MoneyTableShell({ className, tableClassName, beforeTable, afterTable, scrollRef, children }: MoneyTableShellProps) {
  return (
    <div className={`money-table-block${className ? ` ${className}` : ''}`}>
      <div ref={scrollRef} className="money-table-scroll">
        {beforeTable}
        <table className={`money-table${tableClassName ? ` ${tableClassName}` : ''}`}>
          {children}
        </table>
      </div>
      {afterTable}
    </div>
  )
}
