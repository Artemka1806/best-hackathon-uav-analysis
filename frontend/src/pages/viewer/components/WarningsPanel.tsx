import { TriangleAlert } from 'lucide-react'
import { DataTableCard } from './DataTableCard'

const eventTableRows = [
  ['T+12:41', 'Sharp altitude drop', 'High'],
  ['T+14:08', 'Pitch oscillation increase', 'Medium'],
  ['T+15:22', 'GPS drift expansion', 'Medium'],
  ['Post-flight', 'AI debrief pending', 'Info'],
] as const

const warningItems = [
  'Sharp altitude loss detected at T+12:41',
  'Pitch oscillation increased during final approach',
  'GPS drift widened during the fast pass segment',
] as const

export function WarningsPanel() {
  const rows = eventTableRows.map((row) => ({
    id: row[0],
    cells: [
      <span className="font-medium" key={`${row[0]}-time`}>
        {row[0]}
      </span>,
      row[1],
      <span
        key={`${row[0]}-severity`}
        className={row[2] === 'High' ? 'viewer-pill viewer-pill-warning' : 'viewer-pill'}
      >
        {row[2]}
      </span>,
    ],
  }))

  return (
    <DataTableCard
      icon={TriangleAlert}
      title="Events, Warnings, and Anomalies"
      columns={['Window', 'Event', 'Severity']}
      rows={rows}
      footer={
        <div className="flex min-w-0 flex-wrap gap-2">
          {warningItems.map((item) => (
            <span key={item} className="viewer-pill viewer-pill-warning">
              {item}
            </span>
          ))}
        </div>
      }
    />
  )
}
