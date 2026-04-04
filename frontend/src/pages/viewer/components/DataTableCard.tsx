import type { ElementType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface DataTableRow {
  cells: ReactNode[]
  id: string
}

interface DataTableCardProps {
  columns: string[]
  footer?: ReactNode
  icon: ElementType
  rows: DataTableRow[]
  title: string
  className?: string
}

export function DataTableCard({
  columns,
  footer,
  icon: Icon,
  rows,
  title,
  className,
}: DataTableCardProps) {
  return (
    <article className={cn('viewer-panel viewer-section-card', className)}>
      <div className="viewer-section-header">
        <Icon className="h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <div className="viewer-tiny-label">Data Section</div>
          <h2 className="mt-1 break-words text-lg font-semibold tracking-tight">
            {title}
          </h2>
        </div>
      </div>

      <div className="viewer-table-wrap">
        <table className="viewer-data-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                {row.cells.map((cell, index) => (
                  <td key={`${row.id}-${index}`} className="min-w-0 break-words whitespace-normal">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {footer ? <div className="mt-4 min-w-0">{footer}</div> : null}
    </article>
  )
}
