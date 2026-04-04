import { ChartColumn } from 'lucide-react'
import { FlightCharts } from './components/FlightCharts'
import { PageHeader } from './components/PageHeader'

export default function ChartsPage() {
  return (
    <div className="w-full space-y-4 md:space-y-[18px]">
      <PageHeader icon={ChartColumn} title="Charts" />
      <FlightCharts />
    </div>
  )
}
