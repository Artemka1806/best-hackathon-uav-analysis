import { Gauge } from 'lucide-react'
import { DataTableCard } from './DataTableCard'

const missionSummaryRows = [
  ['Flight duration', '17.4 min', 'From arming to landing'],
  ['Total distance', '8.62 km', 'Integrated with Haversine'],
  ['Max altitude gain', '312 m', 'Relative to takeoff'],
  ['Cruise window', '09:10', 'Stable center segment'],
] as const

export function MetricsPanel() {
  const rows = missionSummaryRows.map((row) => ({
    id: row[0],
    cells: [...row],
  }))

  return (
    <DataTableCard
      icon={Gauge}
      title="Flight Summary"
      columns={['Metric', 'Value', 'Context']}
      rows={rows}
    />
  )
}
